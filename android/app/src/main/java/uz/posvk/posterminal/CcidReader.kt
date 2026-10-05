package uz.posvk.posterminal

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.hardware.usb.UsbConstants
import android.hardware.usb.UsbDevice
import android.hardware.usb.UsbDeviceConnection
import android.hardware.usb.UsbEndpoint
import android.hardware.usb.UsbInterface
import android.hardware.usb.UsbManager
import android.os.Build
import java.io.ByteArrayOutputStream
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

/** USB CCID transport for the Identiv SCR35xx (04e6:581c). */
class CcidReader(private val context: Context) : FiscalReader {
    private class CcidCommandException(val command: Int, val ccidCode: Int, val cardState: Int) :
        IllegalStateException(
            "CCID ${if (command == 0x62) "включение карты (ATR)" else if (command == 0x6F) "обмен с ФМ (APDU)" else "команда ${command.toString(16)}"}: " +
                (if (ccidCode == 0xFE) "чип не ответил" else "код $ccidCode") +
                ", состояние карты $cardState"
        )

    companion object {
        const val VENDOR_ID = 0x04E6
        const val PRODUCT_ID = 0x581C
        private const val TIMEOUT_MS = 15_000
        // SCR35xx advertises dwMaxCCIDMessageLength = 271 bytes.
        private const val MAX_MESSAGE = 271
    }

    private val manager = context.getSystemService(Context.USB_SERVICE) as UsbManager
    private var connection: UsbDeviceConnection? = null
    private var usbInterface: UsbInterface? = null
    private var bulkIn: UsbEndpoint? = null
    private var bulkOut: UsbEndpoint? = null
    private var deviceName: String? = null
    private var sequence = 0
    private var atr = ByteArray(0)

    override fun isConnected(): Boolean = connection != null && atr.isNotEmpty() &&
        manager.deviceList.values.any { it.deviceName == deviceName }

    override fun connect(): ByteArray {
        if (isConnected()) return atr.copyOf()
        forceClose()
        val device = manager.deviceList.values.firstOrNull {
            it.vendorId == VENDOR_ID && it.productId == PRODUCT_ID
        } ?: throw IllegalStateException("Identiv SCR35xx USB не найден")
        ensurePermission(device)
        val iface = (0 until device.interfaceCount).map { device.getInterface(it) }
            .firstOrNull { candidate ->
                candidate.interfaceClass == 0x0B && endpoints(candidate) != null
            } ?: throw IllegalStateException("CCID-интерфейс USB не найден")
        val pair = endpoints(iface)!!
        val opened = manager.openDevice(device)
            ?: throw UsbPermissionException("Не удалось открыть USB-считыватель")
        try {
            if (!opened.claimInterface(iface, true)) {
                throw IllegalStateException("Не удалось занять CCID-интерфейс")
            }
            connection = opened
            usbInterface = iface
            bulkIn = pair.first
            bulkOut = pair.second
            deviceName = device.deviceName
            val response = try {
                exchange(0x62, ByteArray(0), 0x80)
            } catch (error: CcidCommandException) {
                if (error.ccidCode != 0xFE) throw error
                // A cold reset can recover a transient ICC mute. This is safe before
                // any fiscal APDU has been sent; never retry an APDU itself.
                try { exchange(0x63, ByteArray(0), 0x81) } catch (_: Exception) { }
                Thread.sleep(100)
                exchange(0x62, ByteArray(0), 0x80)
            }
            if (response.isEmpty()) throw IllegalStateException("CCID не вернул ATR: проверьте ФМ в считывателе")
            atr = response
            return atr.copyOf()
        } catch (e: Exception) {
            forceClose()
            throw e
        }
    }

    override fun resetAndConnect(): ByteArray {
        disconnect()
        return connect()
    }

    override fun transmit(apdu: ByteArray): ByteArray {
        require(apdu.isNotEmpty()) { "APDU пуст" }
        if (!isConnected()) connect()
        // The applet SDK encodes SELECT AID as case 3 (Lc + AID), while
        // Java Card SELECT FILE expects case 4 (Lc + AID + Le). Feitian's
        // SDK tolerates the missing Le; this CCID reader does not.
        val selectByAid = apdu.size >= 6 &&
            apdu[1] == 0xA4.toByte() && apdu[2] == 0x04.toByte() &&
            (apdu[4].toInt() and 0xFF) > 0 &&
            apdu.size == 5 + (apdu[4].toInt() and 0xFF)
        val wireApdu = if (selectByAid) apdu + byteArrayOf(0) else apdu
        try {
            return transmitInternal(wireApdu, 0)
        } catch (e: CcidCommandException) {
            val header = apdu.take(minOf(5, apdu.size)).joinToString("") {
                "%02X".format(it.toInt() and 0xFF)
            }
            val atrHex = atr.joinToString("") { "%02X".format(it.toInt() and 0xFF) }
            forceClose()
            // Only the command header is included; APDU payload may contain fiscal data.
            throw IllegalStateException("${e.message}; APDU $header; ATR $atrHex", e)
        } catch (e: Exception) {
            // Never replay a mutating fiscal APDU after an uncertain USB failure.
            forceClose()
            throw e
        }
    }

    private fun transmitInternal(apdu: ByteArray, correctionDepth: Int): ByteArray {
        var data = exchange(0x6F, apdu, 0x80)
        var followUps = 0
        while (data.size >= 2 && data[data.size - 2] == 0x61.toByte() && followUps < 8) {
            val more = exchange(0x6F, byteArrayOf(0, 0xC0.toByte(), 0, 0, data.last()), 0x80)
            data = if (data.size > 2) data.copyOfRange(0, data.size - 2) + more else more
            followUps++
        }
        if (followUps == 8 && data.size >= 2 && data[data.size - 2] == 0x61.toByte()) {
            throw IllegalStateException("Превышен лимит CCID GET RESPONSE")
        }
        if (data.size == 2 && data[0] == 0x6C.toByte() && apdu.size >= 5 && correctionDepth == 0) {
            val fixed = apdu.copyOf()
            fixed[fixed.lastIndex] = data[1]
            return transmitInternal(fixed, 1)
        }
        return data
    }

    private fun exchange(type: Int, data: ByteArray, expectedType: Int): ByteArray {
        val conn = connection ?: throw IllegalStateException("CCID не подключён")
        val out = bulkOut ?: throw IllegalStateException("CCID Bulk OUT не найден")
        val input = bulkIn ?: throw IllegalStateException("CCID Bulk IN не найден")
        require(data.size + 10 <= MAX_MESSAGE) { "CCID команда слишком длинная" }
        val seq = sequence++ and 0xFF
        val packet = ByteArray(10 + data.size)
        packet[0] = type.toByte()
        for (i in 0..3) packet[1 + i] = (data.size ushr (8 * i)).toByte()
        packet[6] = seq.toByte()
        data.copyInto(packet, 10)
        val written = conn.bulkTransfer(out, packet, packet.size, TIMEOUT_MS)
        if (written != packet.size) throw IllegalStateException("Ошибка записи CCID USB ($written/${packet.size})")

        var extensions = 0
        while (true) {
            val response = readMessage(conn, input)
            if ((response[0].toInt() and 0xFF) != expectedType ||
                (response[5].toInt() and 0xFF) != 0 ||
                (response[6].toInt() and 0xFF) != seq) {
                throw IllegalStateException("Неверный ответ CCID (тип/слот/номер)")
            }
            val status = (response[7].toInt() and 0xC0) ushr 6
            if (status == 2) {
                if (++extensions > 20) throw IllegalStateException("Таймаут ожидания CCID")
                continue
            }
            if (status != 0) {
                val error = response[8].toInt() and 0xFF
                val slot = response[7].toInt() and 0x03
                throw CcidCommandException(type, error, slot)
            }
            val length = messageLength(response)
            return response.copyOfRange(10, 10 + length)
        }
    }

    private fun readMessage(conn: UsbDeviceConnection, input: UsbEndpoint): ByteArray {
        val bytes = ByteArrayOutputStream()
        var expected = 10
        while (bytes.size() < expected) {
            val chunk = ByteArray(minOf(MAX_MESSAGE - bytes.size(), 4096))
            val count = conn.bulkTransfer(input, chunk, chunk.size, TIMEOUT_MS)
            if (count <= 0) throw IllegalStateException("Нет ответа CCID USB ($count)")
            bytes.write(chunk, 0, count)
            if (bytes.size() >= 10) {
                val current = bytes.toByteArray()
                expected = 10 + messageLength(current)
                if (expected > MAX_MESSAGE || bytes.size() > expected) {
                    throw IllegalStateException("Некорректная длина ответа CCID")
                }
            }
        }
        return bytes.toByteArray()
    }

    private fun messageLength(data: ByteArray): Int {
        var length = 0L
        for (i in 0..3) length = length or ((data[1 + i].toLong() and 0xFF) shl (8 * i))
        if (length > MAX_MESSAGE - 10) throw IllegalStateException("Ответ CCID слишком длинный")
        return length.toInt()
    }

    private fun endpoints(iface: UsbInterface): Pair<UsbEndpoint, UsbEndpoint>? {
        val all = (0 until iface.endpointCount).map { iface.getEndpoint(it) }
        val input = all.firstOrNull {
            it.type == UsbConstants.USB_ENDPOINT_XFER_BULK && it.direction == UsbConstants.USB_DIR_IN
        }
        val output = all.firstOrNull {
            it.type == UsbConstants.USB_ENDPOINT_XFER_BULK && it.direction == UsbConstants.USB_DIR_OUT
        }
        return if (input != null && output != null) input to output else null
    }

    private fun ensurePermission(device: UsbDevice) {
        if (manager.hasPermission(device)) return
        val action = "${context.packageName}.CCID_USB_PERMISSION"
        val latch = CountDownLatch(1)
        var granted = false
        var callbackDeviceId: Int? = null
        val receiver = object : BroadcastReceiver() {
            override fun onReceive(context: Context, intent: Intent) {
                if (intent.action != action) return
                val received = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                    intent.getParcelableExtra(UsbManager.EXTRA_DEVICE, UsbDevice::class.java)
                } else {
                    @Suppress("DEPRECATION")
                    intent.getParcelableExtra<UsbDevice>(UsbManager.EXTRA_DEVICE)
                }
                callbackDeviceId = received?.deviceId
                granted = intent.getBooleanExtra(UsbManager.EXTRA_PERMISSION_GRANTED, false)
                latch.countDown()
            }
        }
        val filter = IntentFilter(action)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            context.registerReceiver(receiver, filter, Context.RECEIVER_NOT_EXPORTED)
        } else {
            @Suppress("DEPRECATION")
            context.registerReceiver(receiver, filter)
        }
        try {
            if (manager.hasPermission(device)) return
            val pending = PendingIntent.getBroadcast(
                context, device.deviceId, Intent(action).setPackage(context.packageName),
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            manager.requestPermission(device, pending)
            val received = latch.await(30, TimeUnit.SECONDS)
            // The real USB grant is authoritative. Some Android implementations
            // omit fill-in extras from an immutable PendingIntent's callback.
            if (manager.hasPermission(device)) return
            if (!received) throw UsbPermissionException("Время ожидания разрешения USB истекло")
            throw UsbPermissionException(
                "Доступ к USB-считывателю не разрешён Android " +
                    "(ответ: ${if (granted) "разрешено" else "отказано"}, " +
                    "устройство: ${callbackDeviceId ?: "не указано"})"
            )
        } finally {
            context.unregisterReceiver(receiver)
        }
    }

    override fun disconnect() {
        if (connection != null && atr.isNotEmpty()) {
            try { exchange(0x63, ByteArray(0), 0x81) } catch (_: Exception) { }
        }
        forceClose()
    }

    override fun forceClose() {
        val conn = connection
        val iface = usbInterface
        if (conn != null) {
            if (iface != null) try { conn.releaseInterface(iface) } catch (_: Exception) { }
            try { conn.close() } catch (_: Exception) { }
        }
        connection = null
        usbInterface = null
        bulkIn = null
        bulkOut = null
        deviceName = null
        atr = ByteArray(0)
    }
}
