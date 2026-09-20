package com.anaira.restaurantpos;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.webkit.JavascriptInterface;
import androidx.core.app.NotificationCompat;
import java.util.HashMap;
import java.util.Locale;
import java.util.UUID;

/**
 * Native bridge for the Capacitor WebView.
 * Add this bridge to MainActivity after the Capacitor WebView is available.
 */
public final class AnairaWebBridge {
    private static final String CHANNEL_ID = "anaira_restaurant_alerts";
    private final Context context;
    private TextToSpeech tts;

    public AnairaWebBridge(Context context) {
        this.context = context.getApplicationContext();
        tts = new TextToSpeech(this.context, status -> {
            if (status == TextToSpeech.SUCCESS) tts.setSpeechRate(0.9f);
        });
        createChannel();
    }

    private void createChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
            nm.createNotificationChannel(new NotificationChannel(CHANNEL_ID, "Restaurant Alerts", NotificationManager.IMPORTANCE_HIGH));
        }
    }

    @JavascriptInterface
    public void speak(String text, String language, double rate, double volume, int repeat) {
        if (tts == null) return;
        Locale locale = Locale.forLanguageTag(language == null ? "hi-IN" : language);
        int result = tts.setLanguage(locale);
        if (result == TextToSpeech.LANG_MISSING_DATA || result == TextToSpeech.LANG_NOT_SUPPORTED) {
            tts.setLanguage(Locale.forLanguageTag("en-IN"));
        }
        tts.setSpeechRate((float)Math.max(0.5, Math.min(2.0, rate)));
        tts.setPitch(1.0f);
        int count = Math.max(1, Math.min(5, repeat));
        tts.stop();
        for (int i = 0; i < count; i++) {
            String id = "anaira-tts-" + UUID.randomUUID();
            HashMap<String, String> params = new HashMap<>();
            params.put(TextToSpeech.Engine.KEY_PARAM_UTTERANCE_ID, id);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                tts.speak(text, i == 0 ? TextToSpeech.QUEUE_FLUSH : TextToSpeech.QUEUE_ADD, null, id);
            } else {
                tts.speak(text, i == 0 ? TextToSpeech.QUEUE_FLUSH : TextToSpeech.QUEUE_ADD, params);
            }
        }
    }

    @JavascriptInterface
    public void notify(String title, String message, String actionUrl) {
        Intent launch = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
        if (launch == null) launch = new Intent();
        launch.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pending = PendingIntent.getActivity(
                context, 1001, launch,
                PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0)
        );
        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL_ID)
                .setSmallIcon(android.R.drawable.ic_dialog_info)
                .setContentTitle(title)
                .setContentText(message)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(message))
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setAutoCancel(true)
                .setContentIntent(pending);
        NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        nm.notify((int)(System.currentTimeMillis() & 0x7fffffff), builder.build());
    }

    @JavascriptInterface
    public void notifyTone() {
        android.media.ToneGenerator tg = new android.media.ToneGenerator(android.media.AudioManager.STREAM_NOTIFICATION, 90);
        tg.startTone(android.media.ToneGenerator.TONE_PROP_BEEP2, 500);
        new android.os.Handler(android.os.Looper.getMainLooper()).postDelayed(tg::release, 700);
    }

    public void destroy() {
        if (tts != null) { tts.stop(); tts.shutdown(); tts = null; }
    }
}
