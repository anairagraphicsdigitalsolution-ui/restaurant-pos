package in.anairapos.app;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(android.os.Bundle savedInstanceState) {
        registerPlugin(AnairaLocalDbPlugin.class);
        registerPlugin(AnairaBluetoothPrinterPlugin.class);
        super.onCreate(savedInstanceState);
        if (getBridge() != null && getBridge().getWebView() != null) {
            getBridge().getWebView().getSettings().setJavaScriptEnabled(true);
            getBridge().getWebView().addJavascriptInterface(new AnairaWebBridge(this), "Android");
        }
    }
}
