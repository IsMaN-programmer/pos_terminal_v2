package uz.posvk.posterminal;

import android.content.Context;
import android.hardware.usb.UsbDevice;
import android.hardware.usb.UsbManager;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "FiscalUsb")
public class FiscalUsbPlugin extends Plugin {
    private static final int FEITIAN_VENDOR_ID = 0x096E;

    @PluginMethod
    public void listReaders(PluginCall call) {
        UsbManager manager = (UsbManager) getContext().getSystemService(Context.USB_SERVICE);
        if (manager == null) {
            call.reject("Android USB host is unavailable");
            return;
        }

        JSArray readers = new JSArray();
        for (UsbDevice device : manager.getDeviceList().values()) {
            JSObject reader = new JSObject();
            reader.put("deviceId", device.getDeviceId());
            reader.put("deviceName", device.getDeviceName());
            reader.put("vendorId", device.getVendorId());
            reader.put("productId", device.getProductId());
            reader.put("deviceClass", device.getDeviceClass());
            reader.put("interfaceCount", device.getInterfaceCount());
            reader.put("isFeitian", device.getVendorId() == FEITIAN_VENDOR_ID);
            reader.put("hasPermission", manager.hasPermission(device));
            readers.put(reader);
        }

        JSObject result = new JSObject();
        result.put("readers", readers);
        call.resolve(result);
    }
}
