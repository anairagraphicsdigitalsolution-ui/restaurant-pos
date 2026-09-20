package in.anairapos.app;

import android.os.Bundle;
import android.view.View;
import android.webkit.WebView;

import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(AnairaLocalDbPlugin.class);
        registerPlugin(AnairaBluetoothPrinterPlugin.class);
        super.onCreate(savedInstanceState);

        /*
         * Android 15/16 enforces edge-to-edge for apps targeting recent SDKs.
         * The POS UI has fixed/sticky headers, drawers and bottom actions, so
         * explicitly apply system-bar insets to the WebView. Without this,
         * the Android status bar can sit on top of the search/header and the
         * navigation bar can cover the last cards/buttons.
         */
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);

        if (getBridge() != null && getBridge().getWebView() != null) {
            WebView webView = getBridge().getWebView();
            webView.getSettings().setJavaScriptEnabled(true);
            webView.setFitsSystemWindows(false);
            webView.addJavascriptInterface(new AnairaWebBridge(this), "Android");

            ViewCompat.setOnApplyWindowInsetsListener(webView, (view, insets) -> {
                Insets systemBars = insets.getInsets(WindowInsetsCompat.Type.systemBars());
                view.setPadding(
                    view.getPaddingLeft(),
                    systemBars.top,
                    view.getPaddingRight(),
                    systemBars.bottom
                );
                return insets;
            });
            ViewCompat.requestApplyInsets(webView);
        }
    }
}
