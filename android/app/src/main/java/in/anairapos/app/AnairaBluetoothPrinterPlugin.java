package in.anairapos.app;

import android.Manifest;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothSocket;
import android.content.Intent;
import android.os.Build;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.PluginMethod;

import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Set;
import java.util.UUID;

@CapacitorPlugin(
    name = "AnairaBluetoothPrinter",
    permissions = {
        @Permission(strings = { Manifest.permission.BLUETOOTH_CONNECT, Manifest.permission.BLUETOOTH_SCAN }, alias = "bluetooth")
    }
)
public class AnairaBluetoothPrinterPlugin extends Plugin {
    private BluetoothSocket socket;
    private OutputStream output;
    private BluetoothDevice connectedDevice;
    private static final UUID SPP_UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB");

    @PluginMethod
    public void pairedPrinters(PluginCall call) {
        try {
            BluetoothAdapter adapter = BluetoothAdapter.getDefaultAdapter();
            if (adapter == null) { call.reject("Bluetooth is not available"); return; }
            if (!adapter.isEnabled()) { call.reject("Bluetooth is turned off"); return; }
            if (Build.VERSION.SDK_INT >= 31 && !hasRequiredPermissions()) { requestPermissionForAlias("bluetooth", call, "pairedPrinters"); return; }
            JSArray arr = new JSArray();
            Set<BluetoothDevice> devices = adapter.getBondedDevices();
            for (BluetoothDevice d : devices) {
                JSObject row = new JSObject();
                row.put("name", d.getName() == null ? "Bluetooth printer" : d.getName());
                row.put("address", d.getAddress());
                row.put("connected", connectedDevice != null && d.getAddress().equals(connectedDevice.getAddress()));
                arr.put(row);
            }
            JSObject out = new JSObject(); out.put("printers", arr); call.resolve(out);
        } catch (Exception e) { call.reject(e.getMessage()); }
    }

    @PluginMethod
    public void connect(PluginCall call) {
        String address = call.getString("address", "");
        if (address.isEmpty()) { call.reject("Printer address is required"); return; }
        try {
            BluetoothAdapter adapter = BluetoothAdapter.getDefaultAdapter();
            if (adapter == null || !adapter.isEnabled()) { call.reject("Turn on Bluetooth first"); return; }
            if (Build.VERSION.SDK_INT >= 31 && !hasRequiredPermissions()) { requestPermissionForAlias("bluetooth", call, "connect"); return; }
            BluetoothDevice device = adapter.getRemoteDevice(address);
            closeConnection();
            adapter.cancelDiscovery();
            BluetoothSocket s = device.createRfcommSocketToServiceRecord(SPP_UUID);
            s.connect();
            socket = s;
            output = s.getOutputStream();
            connectedDevice = device;
            JSObject out = new JSObject(); out.put("success", true); out.put("name", device.getName()); out.put("address", address); call.resolve(out);
        } catch (Exception e) { closeConnection(); call.reject("Bluetooth printer connection failed: " + e.getMessage()); }
    }

    @PluginMethod
    public void printRaw(PluginCall call) {
        String base64 = call.getString("base64", "");
        if (base64.isEmpty()) { call.reject("base64 ESC/POS data is required"); return; }
        try {
            if (output == null || socket == null || !socket.isConnected()) throw new Exception("Printer is not connected");
            byte[] data = android.util.Base64.decode(base64, android.util.Base64.DEFAULT);
            output.write(data); output.flush();
            JSObject out = new JSObject(); out.put("success", true); out.put("printer", connectedDevice == null ? "" : connectedDevice.getName()); call.resolve(out);
        } catch (Exception e) { call.reject(e.getMessage()); }
    }

    @PluginMethod
    public void printText(PluginCall call) {
        String text = call.getString("text", "");
        try {
            if (output == null || socket == null || !socket.isConnected()) throw new Exception("Printer is not connected");
            byte[] init = new byte[]{0x1b,0x40};
            output.write(init); output.write(text.getBytes(StandardCharsets.UTF_8)); output.write(new byte[]{10,10,10}); output.flush();
            JSObject out = new JSObject(); out.put("success", true); call.resolve(out);
        } catch (Exception e) { call.reject(e.getMessage()); }
    }

    @PluginMethod
    public void disconnect(PluginCall call) {
        closeConnection(); JSObject out = new JSObject(); out.put("success", true); call.resolve(out);
    }

    @PluginMethod
    public void openBluetoothSettings(PluginCall call) {
        try { getContext().startActivity(new Intent(android.provider.Settings.ACTION_BLUETOOTH_SETTINGS)); call.resolve(); }
        catch (Exception e) { call.reject(e.getMessage()); }
    }

    private boolean hasRequiredPermissions() {
        if (Build.VERSION.SDK_INT < 31) return true;
        return getContext().checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT) == android.content.pm.PackageManager.PERMISSION_GRANTED && getContext().checkSelfPermission(Manifest.permission.BLUETOOTH_SCAN) == android.content.pm.PackageManager.PERMISSION_GRANTED;
    }

    private void closeConnection() {
        try { if (output != null) output.close(); } catch (Exception ignored) {}
        try { if (socket != null) socket.close(); } catch (Exception ignored) {}
        output = null; socket = null; connectedDevice = null;
    }

    @Override public void handleOnDestroy() { closeConnection(); super.handleOnDestroy(); }
}
