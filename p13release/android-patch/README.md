# Android voice + notification bridge

The web app now automatically uses `window.Android.speak(...)`, `window.Android.notify(...)` and `window.Android.notifyTone()` when the APK exposes them. Browser users continue to use Web Speech + Web Notifications.

## MainActivity integration

In the existing Capacitor `MainActivity`, after `super.onCreate(...)`/when the WebView is available, add:

```java
getBridge().getWebView().getSettings().setJavaScriptEnabled(true);
getBridge().getWebView().addJavascriptInterface(new AnairaWebBridge(this), "Android");
```

Keep the bridge only for your own trusted Capacitor WebView.

## Android dependencies

`AnairaWebBridge.java` uses AndroidX `NotificationCompat`. Ensure the Android app has `androidx.core:core` available (normal Capacitor Android projects already do).

Also add notification permission for Android 13+:

```xml
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
```

Request the permission from the app at runtime before showing native notifications.
