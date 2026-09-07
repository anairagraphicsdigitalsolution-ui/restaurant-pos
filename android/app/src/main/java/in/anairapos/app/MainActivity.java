package in.anairapos.app;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.Plugin;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(android.os.Bundle savedInstanceState) {
        registerPlugin(AnairaLocalDbPlugin.class);
        registerPlugin(AnairaBluetoothPrinterPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
