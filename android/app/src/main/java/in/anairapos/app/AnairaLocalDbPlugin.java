package in.anairapos.app;

import android.content.ContentValues;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.PluginMethod;

import org.json.JSONObject;

@CapacitorPlugin(name = "AnairaLocalDb")
public class AnairaLocalDbPlugin extends Plugin {
    private LocalDb db;

    private LocalDb db() {
        if (db == null) db = new LocalDb(getContext());
        return db;
    }

    @PluginMethod
    public void open(PluginCall call) {
        db().getWritableDatabase();
        JSObject out = new JSObject();
        out.put("success", true);
        out.put("driver", "android-sqlite");
        out.put("restaurantId", call.getString("restaurantId", ""));
        call.resolve(out);
    }

    @PluginMethod
    public void put(PluginCall call) {
        String restaurantId = call.getString("restaurantId", "");
        String entity = call.getString("entity", "");
        String id = call.getString("id", "");
        JSObject data = call.getObject("data", new JSObject());
        if (restaurantId.isEmpty() || entity.isEmpty() || id.isEmpty()) {
            call.reject("restaurantId, entity and id are required"); return;
        }
        ContentValues values = new ContentValues();
        values.put("key", restaurantId + ":" + entity + ":" + id);
        values.put("restaurant_id", restaurantId);
        values.put("entity", entity);
        values.put("record_id", id);
        values.put("data", data.toString());
        db().getWritableDatabase().insertWithOnConflict("records", null, values, SQLiteDatabase.CONFLICT_REPLACE);
        JSObject out = new JSObject(); out.put("success", true); call.resolve(out);
    }


    @PluginMethod
    public void list(PluginCall call) {
        String restaurantId = call.getString("restaurantId", "");
        String entity = call.getString("entity", "");
        Cursor c = db().getReadableDatabase().query("records", new String[]{"data"}, "restaurant_id=? AND entity=?", new String[]{restaurantId, entity}, null, null, "updated_at ASC");
        try {
            com.getcapacitor.JSArray out = new com.getcapacitor.JSArray();
            while (c.moveToNext()) out.put(new JSONObject(c.getString(0)));
            JSObject result = new JSObject();
            result.put("records", out);
            call.resolve(result);
        } catch (Exception e) { call.reject(e.getMessage()); }
        finally { c.close(); }
    }

    @PluginMethod
    public void remove(PluginCall call) {
        String restaurantId = call.getString("restaurantId", "");
        String entity = call.getString("entity", "");
        String id = call.getString("id", "");
        db().getWritableDatabase().delete("records", "key=?", new String[]{restaurantId + ":" + entity + ":" + id});
        JSObject result = new JSObject(); result.put("success", true); call.resolve(result);
    }

    @PluginMethod
    public void get(PluginCall call) {
        String restaurantId = call.getString("restaurantId", "");
        String entity = call.getString("entity", "");
        String id = call.getString("id", "");
        Cursor c = db().getReadableDatabase().query("records", new String[]{"data"}, "key=?", new String[]{restaurantId + ":" + entity + ":" + id}, null, null, null);
        try {
            if (!c.moveToFirst()) { call.resolve(new JSObject()); return; }
            call.resolve(JSObject.fromJSONObject(new JSONObject(c.getString(0))));
        } catch (Exception e) { call.reject(e.getMessage()); }
        finally { c.close(); }
    }

    static class LocalDb extends SQLiteOpenHelper {
        LocalDb(android.content.Context context) { super(context, "anaira_local.db", null, 1); }
        @Override public void onCreate(SQLiteDatabase db) {
            db.execSQL("CREATE TABLE records (key TEXT PRIMARY KEY, restaurant_id TEXT NOT NULL, entity TEXT NOT NULL, record_id TEXT NOT NULL, data TEXT NOT NULL, updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now')))");
            db.execSQL("CREATE INDEX idx_records_restaurant_entity ON records(restaurant_id, entity)");
        }
        @Override public void onUpgrade(SQLiteDatabase db, int oldVersion, int newVersion) { }
    }
}
