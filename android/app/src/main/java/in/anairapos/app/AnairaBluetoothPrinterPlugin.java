package in.anairapos.app;

import android.Manifest;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothGatt;
import android.bluetooth.BluetoothGattCallback;
import android.bluetooth.BluetoothGattCharacteristic;
import android.bluetooth.BluetoothGattService;
import android.bluetooth.BluetoothManager;
import android.bluetooth.le.BluetoothLeScanner;
import android.bluetooth.le.ScanCallback;
import android.bluetooth.le.ScanResult;
import android.content.Intent;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.PluginMethod;

import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

@CapacitorPlugin(
    name = "AnairaBluetoothPrinter",
    permissions = {
        @Permission(strings = { Manifest.permission.BLUETOOTH_CONNECT, Manifest.permission.BLUETOOTH_SCAN }, alias = "bluetooth")
    }
)
public class AnairaBluetoothPrinterPlugin extends Plugin {
    private BluetoothSocketState classic = new BluetoothSocketState();
    private BluetoothGatt bleGatt;
    private BluetoothGattCharacteristic bleWriteCharacteristic;
    private BluetoothDevice bleDevice;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private static final UUID SPP_UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB");

    @PluginMethod
    public void pairedPrinters(PluginCall call) {
        try {
            BluetoothAdapter adapter = getAdapter();
            if (adapter == null) { call.reject("Bluetooth is not available"); return; }
            if (!adapter.isEnabled()) { call.reject("Bluetooth is turned off"); return; }
            if (Build.VERSION.SDK_INT >= 31 && !hasRequiredPermissions()) { requestPermissionForAlias("bluetooth", call, "pairedPrinters"); return; }
            JSArray arr = new JSArray();
            Set<BluetoothDevice> devices = adapter.getBondedDevices();
            for (BluetoothDevice d : devices) {
                JSObject row = new JSObject();
                row.put("name", safeName(d));
                row.put("address", d.getAddress());
                row.put("connected", classic.device != null && d.getAddress().equals(classic.device.getAddress()));
                arr.put(row);
            }
            JSObject out = new JSObject(); out.put("printers", arr); call.resolve(out);
        } catch (Exception e) { call.reject(message(e)); }
    }

    @PluginMethod
    public void scanBle(PluginCall call) {
        try {
            BluetoothAdapter adapter = getAdapter();
            if (adapter == null) { call.reject("Bluetooth is not available"); return; }
            if (!adapter.isEnabled()) { call.reject("Turn on Bluetooth first"); return; }
            if (Build.VERSION.SDK_INT >= 31 && !hasRequiredPermissions()) { requestPermissionForAlias("bluetooth", call, "scanBle"); return; }
            BluetoothLeScanner scanner = adapter.getBluetoothLeScanner();
            if (scanner == null) { call.reject("BLE scanner is not available"); return; }

            final LinkedHashMap<String, JSObject> found = new LinkedHashMap<>();
            ScanCallback callback = new ScanCallback() {
                @Override public void onScanResult(int callbackType, ScanResult result) {
                    BluetoothDevice d = result.getDevice();
                    if (d == null || d.getAddress() == null) return;
                    JSObject row = new JSObject();
                    row.put("name", safeName(d));
                    row.put("address", d.getAddress());
                    row.put("rssi", result.getRssi());
                    found.put(d.getAddress(), row);
                }
                @Override public void onScanFailed(int errorCode) {
                    handler.removeCallbacksAndMessages(call);
                    call.reject("BLE scan failed: " + errorCode);
                }
            };
            scanner.startScan(callback);
            handler.postDelayed(() -> {
                try { scanner.stopScan(callback); } catch (Exception ignored) {}
                JSArray arr = new JSArray();
                for (JSObject row : found.values()) arr.put(row);
                JSObject out = new JSObject(); out.put("printers", arr); call.resolve(out);
            }, 6500);
        } catch (Exception e) { call.reject(message(e)); }
    }

    @PluginMethod
    public void connectBle(PluginCall call) {
        String address = call.getString("address", "");
        if (address.isEmpty()) { call.reject("Printer address is required"); return; }
        try {
            BluetoothAdapter adapter = getAdapter();
            if (adapter == null || !adapter.isEnabled()) { call.reject("Turn on Bluetooth first"); return; }
            if (Build.VERSION.SDK_INT >= 31 && !hasRequiredPermissions()) { requestPermissionForAlias("bluetooth", call, "connectBle"); return; }
            BluetoothDevice device = adapter.getRemoteDevice(address);
            closeBle();
            bleDevice = device;
            bleGatt = device.connectGatt(getContext(), false, new BluetoothGattCallback() {
                @Override public void onConnectionStateChange(BluetoothGatt gatt, int status, int newState) {
                    if (status != BluetoothGatt.GATT_SUCCESS || newState != android.bluetooth.BluetoothProfile.STATE_CONNECTED) {
                        if (newState != android.bluetooth.BluetoothProfile.STATE_CONNECTED) {
                            closeBle();
                            call.reject("BLE printer connection failed (status " + status + ")");
                        }
                        return;
                    }
                    gatt.discoverServices();
                }
                @Override public void onServicesDiscovered(BluetoothGatt gatt, int status) {
                    if (status != BluetoothGatt.GATT_SUCCESS) { call.reject("Unable to discover BLE printer services"); return; }
                    BluetoothGattCharacteristic chosen = findWritableCharacteristic(gatt);
                    if (chosen == null) {
                        StringBuilder services = new StringBuilder();
                        for (BluetoothGattService s : gatt.getServices()) services.append(s.getUuid()).append(" ");
                        call.reject("BLE printer has no writable ESC/POS characteristic. Services: " + services);
                        return;
                    }
                    bleWriteCharacteristic = chosen;
                    int props = chosen.getProperties();
                    chosen.setWriteType((props & BluetoothGattCharacteristic.PROPERTY_WRITE_NO_RESPONSE) != 0
                        ? BluetoothGattCharacteristic.WRITE_TYPE_NO_RESPONSE
                        : BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT);
                    JSObject out = new JSObject();
                    out.put("success", true);
                    out.put("name", safeName(device));
                    out.put("address", address);
                    out.put("service", chosen.getService().getUuid().toString());
                    out.put("characteristic", chosen.getUuid().toString());
                    call.resolve(out);
                }
            });
        } catch (Exception e) { closeBle(); call.reject(message(e)); }
    }

    @PluginMethod
    public void connect(PluginCall call) {
        String address = call.getString("address", "");
        if (address.isEmpty()) { call.reject("Printer address is required"); return; }
        try {
            BluetoothAdapter adapter = getAdapter();
            if (adapter == null || !adapter.isEnabled()) { call.reject("Turn on Bluetooth first"); return; }
            if (Build.VERSION.SDK_INT >= 31 && !hasRequiredPermissions()) { requestPermissionForAlias("bluetooth", call, "connect"); return; }
            BluetoothDevice device = adapter.getRemoteDevice(address);
            closeClassic();
            adapter.cancelDiscovery();
            android.bluetooth.BluetoothSocket s = device.createRfcommSocketToServiceRecord(SPP_UUID);
            s.connect();
            classic.socket = s;
            classic.output = s.getOutputStream();
            classic.device = device;
            JSObject out = new JSObject(); out.put("success", true); out.put("name", safeName(device)); out.put("address", address); call.resolve(out);
        } catch (Exception e) { closeClassic(); call.reject("Bluetooth printer connection failed: " + message(e)); }
    }

    @PluginMethod
    public void printRaw(PluginCall call) {
        String base64 = call.getString("base64", "");
        if (base64.isEmpty()) { call.reject("base64 ESC/POS data is required"); return; }
        try {
            byte[] data = android.util.Base64.decode(base64, android.util.Base64.DEFAULT);
            if (bleGatt != null && bleWriteCharacteristic != null) {
                writeBle(data);
                JSObject out = new JSObject(); out.put("success", true); out.put("transport", "ble"); out.put("printer", safeName(bleDevice)); call.resolve(out); return;
            }
            if (classic.output != null && classic.socket != null && classic.socket.isConnected()) {
                classic.output.write(data); classic.output.flush();
                JSObject out = new JSObject(); out.put("success", true); out.put("transport", "spp"); out.put("printer", safeName(classic.device)); call.resolve(out); return;
            }
            throw new Exception("No Bluetooth printer is connected");
        } catch (Exception e) { call.reject(message(e)); }
    }

    @PluginMethod
    public void printText(PluginCall call) {
        String text = call.getString("text", "");
        try {
            byte[] init = new byte[]{0x1b,0x40};
            byte[] body = text.getBytes(StandardCharsets.UTF_8);
            byte[] tail = new byte[]{10,10,10};
            byte[] all = new byte[init.length + body.length + tail.length];
            System.arraycopy(init,0,all,0,init.length); System.arraycopy(body,0,all,init.length,body.length); System.arraycopy(tail,0,all,init.length+body.length,tail.length);
            if (bleGatt != null && bleWriteCharacteristic != null) { writeBle(all); }
            else if (classic.output != null && classic.socket != null && classic.socket.isConnected()) { classic.output.write(all); classic.output.flush(); }
            else throw new Exception("No Bluetooth printer is connected");
            JSObject out = new JSObject(); out.put("success", true); call.resolve(out);
        } catch (Exception e) { call.reject(message(e)); }
    }

    @PluginMethod
    public void disconnect(PluginCall call) {
        closeBle(); closeClassic(); JSObject out = new JSObject(); out.put("success", true); call.resolve(out);
    }

    @PluginMethod
    public void openBluetoothSettings(PluginCall call) {
        try { getContext().startActivity(new Intent(android.provider.Settings.ACTION_BLUETOOTH_SETTINGS)); call.resolve(); }
        catch (Exception e) { call.reject(message(e)); }
    }

    private void writeBle(byte[] data) throws Exception {
        if (bleGatt == null || bleWriteCharacteristic == null) throw new Exception("BLE printer is not connected");
        final int chunkSize = bleWriteCharacteristic.getWriteType() == BluetoothGattCharacteristic.WRITE_TYPE_NO_RESPONSE ? 180 : 120;
        for (int offset = 0; offset < data.length; offset += chunkSize) {
            int len = Math.min(chunkSize, data.length - offset);
            byte[] chunk = new byte[len];
            System.arraycopy(data, offset, chunk, 0, len);
            bleWriteCharacteristic.setValue(chunk);
            if (!bleGatt.writeCharacteristic(bleWriteCharacteristic)) throw new Exception("BLE printer write failed");
            try { Thread.sleep(35); } catch (InterruptedException ignored) { Thread.currentThread().interrupt(); }
        }
    }

    private BluetoothGattCharacteristic findWritableCharacteristic(BluetoothGatt gatt) {
        String[] preferredServices = { "0000ffe0", "000018f0", "0000ae30", "0000ff00", "49535343-fe7d-4ae5-8fa9-9fafd205e455", "6e400001-b5a3-f393-e0a9-e50e24dcca9e" };
        String[] preferredChars = { "0000ffe1", "00002af1", "0000ae01", "0000ff02", "49535343-8841-43f4-a8d4-ecbe34729bb3", "6e400002-b5a3-f393-e0a9-e50e24dcca9e" };
        for (BluetoothGattService s : gatt.getServices()) {
            String su = s.getUuid().toString().toLowerCase();
            for (BluetoothGattCharacteristic c : s.getCharacteristics()) {
                String cu = c.getUuid().toString().toLowerCase();
                boolean writable = (c.getProperties() & (BluetoothGattCharacteristic.PROPERTY_WRITE | BluetoothGattCharacteristic.PROPERTY_WRITE_NO_RESPONSE)) != 0;
                if (!writable) continue;
                for (String ps : preferredServices) if (su.startsWith(ps)) for (String pc : preferredChars) if (cu.startsWith(pc)) return c;
            }
        }
        for (BluetoothGattService s : gatt.getServices()) for (BluetoothGattCharacteristic c : s.getCharacteristics()) {
            if ((c.getProperties() & (BluetoothGattCharacteristic.PROPERTY_WRITE | BluetoothGattCharacteristic.PROPERTY_WRITE_NO_RESPONSE)) != 0) return c;
        }
        return null;
    }

    private BluetoothAdapter getAdapter() {
        BluetoothManager manager = (BluetoothManager) getContext().getSystemService(android.content.Context.BLUETOOTH_SERVICE);
        return manager == null ? null : manager.getAdapter();
    }

    private String safeName(BluetoothDevice d) { try { return d == null || d.getName() == null ? "Bluetooth Printer" : d.getName(); } catch (Exception e) { return "Bluetooth Printer"; } }
    private String message(Exception e) { return e == null || e.getMessage() == null ? "Bluetooth printer error" : e.getMessage(); }
    private boolean hasRequiredPermissions() {
        if (Build.VERSION.SDK_INT < 31) return true;
        return getContext().checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT) == android.content.pm.PackageManager.PERMISSION_GRANTED && getContext().checkSelfPermission(Manifest.permission.BLUETOOTH_SCAN) == android.content.pm.PackageManager.PERMISSION_GRANTED;
    }
    private void closeBle() {
        try { if (bleGatt != null) bleGatt.disconnect(); } catch (Exception ignored) {}
        try { if (bleGatt != null) bleGatt.close(); } catch (Exception ignored) {}
        bleGatt = null; bleWriteCharacteristic = null; bleDevice = null;
    }
    private void closeClassic() {
        try { if (classic.output != null) classic.output.close(); } catch (Exception ignored) {}
        try { if (classic.socket != null) classic.socket.close(); } catch (Exception ignored) {}
        classic = new BluetoothSocketState();
    }
    @Override public void handleOnDestroy() { closeBle(); closeClassic(); super.handleOnDestroy(); }

    private static class BluetoothSocketState {
        android.bluetooth.BluetoothSocket socket;
        OutputStream output;
        BluetoothDevice device;
    }
}
