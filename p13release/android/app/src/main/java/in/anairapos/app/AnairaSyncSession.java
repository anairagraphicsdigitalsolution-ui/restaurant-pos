package in.anairapos.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;

import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import android.util.Base64;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/** Small encrypted session store used only by the native background sync worker. */
final class AnairaSyncSession {
    private static final String PREFS = "anaira_sync_session";
    private static final String KEY_ALIAS = "anaira_sync_key_v1";
    private static final String TOKEN = "token";
    private static final String RESTAURANT = "restaurant_id";
    private static final String API_BASE = "api_base";
    private static final String IV = "iv";

    private AnairaSyncSession() {}

    static synchronized void save(Context context, String restaurantId, String token, String apiBase) throws Exception {
        SecretKey key = getOrCreateKey();
        byte[] iv = new byte[12];
        new java.security.SecureRandom().nextBytes(iv);
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, key, new GCMParameterSpec(128, iv));
        byte[] encrypted = cipher.doFinal(token.getBytes(StandardCharsets.UTF_8));
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
                .putString(TOKEN, Base64.encodeToString(encrypted, Base64.NO_WRAP))
                .putString(IV, Base64.encodeToString(iv, Base64.NO_WRAP))
                .putString(RESTAURANT, restaurantId)
                .putString(API_BASE, apiBase)
                .apply();
    }

    static synchronized Session read(Context context) {
        try {
            SharedPreferences p = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            String encrypted = p.getString(TOKEN, null);
            String ivEncoded = p.getString(IV, null);
            String restaurantId = p.getString(RESTAURANT, null);
            String apiBase = p.getString(API_BASE, "https://www.anairapos.in");
            if (encrypted == null || ivEncoded == null || restaurantId == null) return null;
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, getOrCreateKey(), new GCMParameterSpec(128, Base64.decode(ivEncoded, Base64.DEFAULT)));
            String token = new String(cipher.doFinal(Base64.decode(encrypted, Base64.DEFAULT)), StandardCharsets.UTF_8);
            if (token.isEmpty()) return null;
            return new Session(restaurantId, token, normalizeBase(apiBase));
        } catch (Exception e) {
            return null;
        }
    }

    static synchronized void clear(Context context) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().clear().apply();
    }

    private static String normalizeBase(String base) {
        String value = base == null || base.trim().isEmpty() ? "https://www.anairapos.in" : base.trim();
        while (value.endsWith("/")) value = value.substring(0, value.length() - 1);
        return value;
    }

    private static SecretKey getOrCreateKey() throws Exception {
        KeyStore keyStore = KeyStore.getInstance("AndroidKeyStore");
        keyStore.load(null);
        if (keyStore.containsAlias(KEY_ALIAS)) {
            return ((KeyStore.SecretKeyEntry) keyStore.getEntry(KEY_ALIAS, null)).getSecretKey();
        }
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(KEY_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setUserAuthenticationRequired(false)
                .build());
        return generator.generateKey();
    }

    static final class Session {
        final String restaurantId;
        final String token;
        final String apiBase;
        Session(String restaurantId, String token, String apiBase) {
            this.restaurantId = restaurantId;
            this.token = token;
            this.apiBase = apiBase;
        }
    }
}
