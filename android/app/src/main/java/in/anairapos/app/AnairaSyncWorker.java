package in.anairapos.app;

import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;

import androidx.annotation.NonNull;
import androidx.work.Constraints;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.ExistingWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.OneTimeWorkRequest;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.TimeUnit;

/** True native recovery sync. It runs without the WebView being alive. */
public class AnairaSyncWorker extends Worker {
    public static final String UNIQUE_PERIODIC = "anaira-p0-native-sync";
    public static final String UNIQUE_NOW = "anaira-p0-native-sync-now";
    private final LocalDb db;

    public AnairaSyncWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
        db = new LocalDb(context.getApplicationContext());
    }

    public static void schedule(Context context) {
        Constraints constraints = new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build();
        PeriodicWorkRequest request = new PeriodicWorkRequest.Builder(AnairaSyncWorker.class, 15, TimeUnit.MINUTES)
                .setConstraints(constraints).build();
        WorkManager.getInstance(context).enqueueUniquePeriodicWork(UNIQUE_PERIODIC, ExistingPeriodicWorkPolicy.UPDATE, request);
    }

    public static void runNow(Context context) {
        Constraints constraints = new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build();
        OneTimeWorkRequest request = new OneTimeWorkRequest.Builder(AnairaSyncWorker.class).setConstraints(constraints).build();
        WorkManager.getInstance(context).enqueueUniqueWork(UNIQUE_NOW, ExistingWorkPolicy.REPLACE, request);
    }

    @NonNull
    @Override
    public Result doWork() {
        AnairaSyncSession.Session session = AnairaSyncSession.read(getApplicationContext());
        if (session == null) return Result.success();
        try {
            int pushed = pushQueue(session);
            int pulled = pullCloud(session);
            writeMeta(session.restaurantId, new JSONObject()
                    .put("state", "online")
                    .put("last_success_at", now())
                    .put("last_sync_at", now())
                    .put("pushed", pushed)
                    .put("pulled", pulled)
                    .put("device_id", "android-native"));
            return Result.success();
        } catch (Exception e) {
            if (e instanceof AuthSyncException || String.valueOf(e.getMessage()).matches(".*HTTP (401|403).*")) {
                AnairaSyncSession.clear(getApplicationContext());
                writeMeta(session.restaurantId, new JSONObject().put("state", "auth_required").put("last_sync_at", now()).put("last_error", "Session expired; sign in again"));
                return Result.success();
            }
            writeMeta(session.restaurantId, new JSONObject()
                    .put("state", "degraded")
                    .put("last_sync_at", now())
                    .put("last_error", e.getMessage() == null ? "Native sync failed" : e.getMessage()));
            return Result.retry();
        }
    }

    private int pushQueue(AnairaSyncSession.Session s) throws Exception {
        List<JSONObject> queue = db.listQueue(s.restaurantId, 50);
        int pushed = 0;
        for (JSONObject entry : queue) {
            String queueId = entry.optString("queue_id", "");
            String entity = entry.optString("entity", "");
            try {
                db.updateQueue(s.restaurantId, queueId, new JSONObject().put("status", "processing").put("attempts", entry.optInt("attempts", 0) + 1).put("last_attempt_at", now()));
                JSONObject payload = entry.optJSONObject("payload");
                if (payload == null) payload = new JSONObject();
                JSONObject result;
                if ("orders".equals(entity)) {
                    JSONObject body = new JSONObject().put("restaurant_id", s.restaurantId).put("device_id", "android-native").put("orders", new JSONArray().put(payload));
                    result = request(s.apiBase + "/api/mobile/sync", "POST", s.token, body);
                } else if ("billing_finalize".equals(entity)) {
                    String key = payload.optString("idempotency_key", "offline-billing:" + entry.optString("entity_id") + ":" + queueId);
                    payload.put("idempotency_key", key).put("order_id", entry.optString("entity_id"));
                    result = request(s.apiBase + "/api/billing/finalize", "POST", s.token, payload);
                } else if ("restaurant_deliveries".equals(entity)) {
                    String key = payload.optString("idempotency_key", "offline-delivery:" + entry.optString("entity_id") + ":" + queueId);
                    payload.put("idempotency_key", key);
                    result = request(s.apiBase + "/api/delivery", "POST", s.token, payload);
                } else {
                    throw new Exception("No native cloud handler for " + entity);
                }
                if (!result.optBoolean("success", false)) throw new Exception(result.optString("error", "Sync failed"));
                db.updateQueue(s.restaurantId, queueId, new JSONObject().put("status", "synced").put("synced_at", now()).put("last_error", JSONObject.NULL));
                pushed++;
            } catch (Exception e) {
                int attempts = entry.optInt("attempts", 0) + 1;
                long delay = Math.min(30 * 60 * 1000L, 1000L * (1L << Math.min(attempts, 10)));
                db.updateQueue(s.restaurantId, queueId, new JSONObject()
                        .put("status", attempts >= 8 ? "error" : "retry")
                        .put("attempts", attempts)
                        .put("last_error", e.getMessage())
                        .put("next_attempt_at", new java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSSXXX", java.util.Locale.US).format(new java.util.Date(System.currentTimeMillis() + delay))));
            }
        }
        return pushed;
    }

    private int pullCloud(AnairaSyncSession.Session s) throws Exception {
        JSONObject meta = db.getMeta(s.restaurantId, "cloud-cursor");
        long cursor = meta == null ? 0 : meta.optLong("value", 0);
        String url = s.apiBase + "/api/mobile/sync/pull?restaurant_id=" + java.net.URLEncoder.encode(s.restaurantId, "UTF-8") + "&after_id=" + cursor + "&limit=200&device_id=android-native";
        JSONObject result = request(url, "GET", s.token, null);
        if (!result.optBoolean("success", false)) throw new Exception(result.optString("error", "Cloud pull failed"));
        JSONArray events = result.optJSONArray("events");
        int pulled = 0;
        if (events != null) {
            for (int i = 0; i < events.length(); i++) {
                JSONObject event = events.optJSONObject(i);
                if (event == null) continue;
                String entity = event.optString("table_name", "");
                JSONObject row = event.optJSONObject("row_data");
                if (row == null || !row.has("id")) continue;
                String id = row.optString("id", "");
                if ("DELETE".equalsIgnoreCase(event.optString("operation"))) {
                    db.remove(s.restaurantId, entity, id);
                } else {
                    JSONObject local = db.get(s.restaurantId, entity, id);
                    if (local != null && isLocalNewer(row, local)) {
                        recordConflict(s, entity, id, local, row);
                        continue;
                    }
                    db.put(s.restaurantId, entity, id, row);
                }
                pulled++;
            }
        }
        long next = result.optLong("next_after_id", cursor);
        db.putMeta(s.restaurantId, "cloud-cursor", new JSONObject().put("value", next));
        return pulled;
    }

    private void recordConflict(AnairaSyncSession.Session s, String entity, String id, JSONObject local, JSONObject incoming) {
        try {
            JSONObject conflict = new JSONObject().put("restaurant_id", s.restaurantId).put("entity", entity).put("entity_id", id).put("direction", "cloud_to_local").put("resolution", "local-newer").put("local", local).put("incoming", incoming).put("device_id", "android-native");
            db.put(s.restaurantId, "conflict", java.util.UUID.randomUUID().toString(), conflict);
            request(s.apiBase + "/api/mobile/sync/conflict", "POST", s.token, conflict);
        } catch (Exception ignored) {}
    }

    private boolean isLocalNewer(JSONObject incoming, JSONObject local) {
        long a = parseTime(incoming.optString("updated_at", incoming.optString("created_at", "")));
        long b = parseTime(local.optString("updated_at", local.optString("created_at", "")));
        return a > 0 && b > 0 && a < b;
    }

    private long parseTime(String value) {
        if (value == null || value.trim().isEmpty()) return 0;
        String v = value.trim();
        try { return new java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSSXXX", java.util.Locale.US).parse(v).getTime(); } catch (Exception ignored) {}
        try { return new java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ssXXX", java.util.Locale.US).parse(v).getTime(); } catch (Exception ignored) {}
        return 0;
    }

    private JSONObject request(String urlString, String method, String token, JSONObject body) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(urlString).openConnection();
        c.setRequestMethod(method);
        c.setConnectTimeout(15000);
        c.setReadTimeout(30000);
        c.setRequestProperty("Accept", "application/json");
        c.setRequestProperty("Authorization", "Bearer " + token);
        if (body != null) {
            c.setDoOutput(true);
            c.setRequestProperty("Content-Type", "application/json");
            byte[] bytes = body.toString().getBytes(StandardCharsets.UTF_8);
            try (OutputStream out = c.getOutputStream()) { out.write(bytes); }
        }
        int code = c.getResponseCode();
        InputStream stream = code >= 200 && code < 400 ? c.getInputStream() : c.getErrorStream();
        String response = read(stream);
        if (code == 401 || code == 403) throw new AuthSyncException("HTTP " + code);
        if (code < 200 || code >= 300) throw new Exception("HTTP " + code + ": " + response);
        return response.isEmpty() ? new JSONObject().put("success", true) : new JSONObject(response);
    }

    private String read(InputStream input) throws Exception {
        if (input == null) return "";
        try (BufferedReader r = new BufferedReader(new InputStreamReader(input, StandardCharsets.UTF_8))) {
            StringBuilder b = new StringBuilder(); String line;
            while ((line = r.readLine()) != null) b.append(line);
            return b.toString();
        }
    }

    private void writeMeta(String restaurantId, JSONObject value) {
        try { db.putMeta(restaurantId, "sync-health", value); } catch (Exception ignored) {}
    }

    private String now() { return new java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSSXXX", java.util.Locale.US).format(new java.util.Date()); }

    private static class AuthSyncException extends Exception { AuthSyncException(String message) { super(message); } }

    static class LocalDb extends android.database.sqlite.SQLiteOpenHelper {
        private final Context context;
        LocalDb(Context context) { super(context, "anaira_local.db", null, 2); this.context = context; }
        @Override public void onCreate(SQLiteDatabase db) {
            db.execSQL("CREATE TABLE IF NOT EXISTS records (key TEXT PRIMARY KEY, restaurant_id TEXT NOT NULL, entity TEXT NOT NULL, record_id TEXT NOT NULL, data TEXT NOT NULL, updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now')))" );
            db.execSQL("CREATE INDEX IF NOT EXISTS idx_records_restaurant_entity ON records(restaurant_id, entity)");
        }
        @Override public void onUpgrade(SQLiteDatabase db, int oldVersion, int newVersion) { onCreate(db); }
        List<JSONObject> listQueue(String restaurantId, int limit) throws Exception {
            List<JSONObject> out = new ArrayList<>(); long now = System.currentTimeMillis();
            Cursor c = getReadableDatabase().query("records", new String[]{"data"}, "restaurant_id=? AND entity=?", new String[]{restaurantId,"sync_queue"}, null,null,"updated_at ASC",String.valueOf(limit));
            try { while(c.moveToNext()) { JSONObject x=new JSONObject(c.getString(0)); String status=x.optString("status","pending"); long next=parse(x.optString("next_attempt_at","")); if (("pending".equals(status)||"retry".equals(status)||"error".equals(status)) && (next==0||next<=now)) out.add(x); } } finally { c.close(); }
            return out;
        }
        JSONObject get(String restaurantId,String entity,String id) throws Exception { Cursor c=getReadableDatabase().query("records",new String[]{"data"},"key=?",new String[]{restaurantId+":"+entity+":"+id},null,null,null); try { return c.moveToFirst()?new JSONObject(c.getString(0)):null; } finally { c.close(); } }
        void put(String restaurantId,String entity,String id,JSONObject data){ ContentValues v=new ContentValues();v.put("key",restaurantId+":"+entity+":"+id);v.put("restaurant_id",restaurantId);v.put("entity",entity);v.put("record_id",id);v.put("data",data.toString());v.put("updated_at",System.currentTimeMillis()/1000);getWritableDatabase().insertWithOnConflict("records",null,v,SQLiteDatabase.CONFLICT_REPLACE); }
        void remove(String restaurantId,String entity,String id){ getWritableDatabase().delete("records","key=?",new String[]{restaurantId+":"+entity+":"+id}); }
        void updateQueue(String restaurantId,String id,JSONObject patch) throws Exception { JSONObject current=get(restaurantId,"sync_queue",id); if(current==null) current=new JSONObject(); java.util.Iterator<String> keys=patch.keys();while(keys.hasNext()){String k=keys.next();current.put(k,patch.get(k));}put(restaurantId,"sync_queue",id,current); }
        JSONObject getMeta(String restaurantId,String key) throws Exception { return get(restaurantId,"meta",key); }
        void putMeta(String restaurantId,String key,JSONObject value){ put(restaurantId,"meta",key,value); }
        private long parse(String value){try{return new java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSSXXX", java.util.Locale.US).parse(value).getTime();}catch(Exception e){return 0;}}
    }
}
