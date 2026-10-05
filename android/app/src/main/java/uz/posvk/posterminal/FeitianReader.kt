package uz.posvk.posterminal

import android.content.Context
import android.hardware.usb.UsbDevice
import android.os.Handler
import android.os.Looper
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Intent
import android.content.IntentFilter
import android.hardware.usb.UsbManager
import android.os.Build
import com.ftsafe.DK
import com.ftsafe.readerScheme.FTReader
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

/**
 * FEITIAN FTReaderAPI 2.0.1.7 uchun tolerant adapter.
 *
 * Muhim prinsiplar:
 *  - connect() idempotent: POWERED holatda readerPowerOn qayta chaqirilmaydi;
 *  - barcha public metodlar FiscalModulePlugin single-thread executorida ishlaydi;
 *  - APDU xatosida mutatsion buyruq ko'r-ko'rona qayta yuborilmaydi;
 *  - buzilgan native USB handle to'liq tashlanadi, keyingi amal yangi FTReader
 *    bilan ulanadi;
 *  - oddiy savdo va sync oralig'ida disconnect/powerOff qilinmaydi.
 */

class UsbPermissionException(
    message: String,
) : IllegalStateException(message)

class FeitianReader(private val context: Context) : FiscalReader {

    private val usbManager =
        context.getSystemService(Context.USB_SERVICE) as UsbManager

    companion object {
        private const val FTSAFE_VENDOR_ID = 0x096E
    }

    private enum class State { CLOSED, OPEN, POWERED }

    private var ft: FTReader? = null
    private var deviceName: String? = null
    private var state: State = State.CLOSED
    private var lastCloseAtMs: Long = 0L

    var lastAtr: ByteArray = ByteArray(0)
        private set

//    @Volatile
//    private var foundDevice: UsbDevice? = null
//
//    @Volatile
//    private var findLatch: CountDownLatch? = null

//    private val handler = object : Handler(Looper.getMainLooper()) {
//        override fun handleMessage(msg: Message) {
//            if (msg.what == DK.USB_IN) {
//                foundDevice = msg.obj as? UsbDevice
//                findLatch?.countDown()
//            }
//        }
//    }

    private val handler = Handler(Looper.getMainLooper())

    override fun isConnected(): Boolean =
        state == State.POWERED && deviceName != null && ft != null

    /**
     * Idempotent ulanish. Sessiya tirik bo'lsa faqat oldingi ATR qaytariladi.
     * Yangi power cycle qilinmaydi.
     */
    override fun connect(): ByteArray {
        if (isConnected()) return lastAtr.copyOf()

        var lastError: Exception? = null
        val delays = longArrayOf(0L, 600L)

        for (delay in delays) {
            if (delay > 0) {
                Thread.sleep(delay)
            }

            waitAfterClose()

            try {
                return connectOnce()

            } catch (e: UsbPermissionException) {

                // Permission uchun AUTOMATIC RETRY YO'Q.
                //
                // Aks holda user "Allow/Cancel" dialogini
                // bir necha marta ko'radi.
                cleanup(
                    powerOff = false,
                    recreateReader = true,
                )

                throw e

            } catch (e: Exception) {

                lastError = e

                cleanup(
                    powerOff = false,
                    recreateReader = true,
                )
            }
        }

        throw lastError ?: IllegalStateException("FM reader ulanmagan")
    }

    /** Eski sessiyani tozalab, bir marta toza ulanish. */
    override fun resetAndConnect(): ByteArray {
        cleanup(powerOff = true, recreateReader = true)
        Thread.sleep(350)
        return connect()
    }

    private fun connectOnce(): ByteArray {
        if (isConnected()) {
            return lastAtr.copyOf()
        }

        // MUHIM:
        // FTReader SDK chaqirilishidan OLDIN qurilmani Android orqali
        // topamiz va permission'ni bir marta olamiz.
        val device = findUsbDevice()

        ensureUsbPermission(device)

        // Shu nuqtaga kelganda Android USB permission allaqachon bor.
        val reader = ensureReader()

        if (
            state == State.CLOSED ||
            deviceName == null
        ) {
            reader.readerOpen(
                device.deviceName
            )

            deviceName = device.deviceName
            state = State.OPEN

            Thread.sleep(350)
        }

        val dev =
            deviceName
                ?: throw IllegalStateException(
                    "FM USB device name yo'q"
                )

        lastAtr = reader.readerPowerOn(
            dev,
            0,
        )

        if (lastAtr.isEmpty()) {
            throw IllegalStateException(
                "FM ATR bo'sh qaytdi"
            )
        }

        state = State.POWERED

        return lastAtr.copyOf()
    }

//    private fun findDevice(reader: FTReader): UsbDevice {
//        foundDevice = null
//        val latch = CountDownLatch(1)
//        findLatch = latch
//
//        try {
//            reader.readerFind()
//            if (!latch.await(5, TimeUnit.SECONDS)) {
//                throw IllegalStateException("FM USB qurilmasini topish timeout")
//            }
//            return foundDevice
//                ?: throw IllegalStateException("FM USB qurilmasi topilmadi")
//        } finally {
//            findLatch = null
//        }
//    }

    private fun findUsbDevice(): UsbDevice {
        return usbManager.deviceList.values
            .firstOrNull { device ->
                device.vendorId == FTSAFE_VENDOR_ID
            }
            ?: throw IllegalStateException(
                "FM USB qurilmasi topilmadi"
            )
    }

    private fun ensureUsbPermission(
        device: UsbDevice,
    ) {
        if (usbManager.hasPermission(device)) {
            return
        }

        val action =
            "${context.packageName}.FTSAFE_USB_PERMISSION"

        val latch = CountDownLatch(1)

        var granted = false
        var correctDevice = false

        val receiver = object : BroadcastReceiver() {
            override fun onReceive(
                context: Context,
                intent: Intent,
            ) {
                if (intent.action != action) return

                val receivedDevice: UsbDevice? =
                    if (
                        Build.VERSION.SDK_INT >=
                        Build.VERSION_CODES.TIRAMISU
                    ) {
                        intent.getParcelableExtra(
                            UsbManager.EXTRA_DEVICE,
                            UsbDevice::class.java,
                        )
                    } else {
                        @Suppress("DEPRECATION")
                        intent.getParcelableExtra(
                            UsbManager.EXTRA_DEVICE,
                        )
                    }

                correctDevice =
                    receivedDevice?.deviceId == device.deviceId

                granted =
                    correctDevice &&
                            intent.getBooleanExtra(
                                UsbManager.EXTRA_PERMISSION_GRANTED,
                                false,
                            )

                latch.countDown()
            }
        }

        val filter = IntentFilter(action)

        if (
            Build.VERSION.SDK_INT >=
            Build.VERSION_CODES.TIRAMISU
        ) {
            context.registerReceiver(
                receiver,
                filter,
                Context.RECEIVER_NOT_EXPORTED,
            )
        } else {
            @Suppress("DEPRECATION")
            context.registerReceiver(
                receiver,
                filter,
            )
        }

        try {
            // Receiver register bo'lganidan keyin yana bir marta
            // tekshiramiz — race condition bo'lmasligi uchun.
            if (usbManager.hasPermission(device)) {
                return
            }

            val permissionIntent =
                PendingIntent.getBroadcast(
                    context,
                    device.deviceId,
                    Intent(action).setPackage(
                        context.packageName
                    ),
                    PendingIntent.FLAG_UPDATE_CURRENT or
                            PendingIntent.FLAG_IMMUTABLE,
                )

            usbManager.requestPermission(
                device,
                permissionIntent,
            )

            val received = latch.await(
                30,
                TimeUnit.SECONDS,
            )

            if (!received) {
                throw UsbPermissionException(
                    "FM USB ruxsatini kutish timeout"
                )
            }

            if (
                !granted ||
                !correctDevice ||
                !usbManager.hasPermission(device)
            ) {
                throw UsbPermissionException(
                    "FM USB qurilmasiga ruxsat berilmadi"
                )
            }

        } finally {
            try {
                context.unregisterReceiver(receiver)
            } catch (_: Exception) {
            }
        }
    }

    /**
     * APDU yuborish. Transport xatosi bo'lsa sessiya invalid qilinadi, lekin
     * ayni APDU avtomatik qayta yuborilmaydi — fiskal mutatsiya dublikat
     * bo'lishi mumkin.
     */
    override fun transmit(apdu: ByteArray): ByteArray {
        if (apdu.isEmpty()) throw IllegalArgumentException("APDU bo'sh")
        if (!isConnected()) connect()
        return transmitInternal(apdu, correctionDepth = 0)
    }

    private fun transmitInternal(
        apdu: ByteArray,
        correctionDepth: Int,
    ): ByteArray {
        val reader = ft ?: throw IllegalStateException("FM reader yo'q")
        val dev = deviceName ?: throw IllegalStateException("FM USB ochilmagan")

        try {
            var data = reader.readerXfr(dev, 0, apdu)

            // T=0: SW1=61 -> GET RESPONSE. Cheksiz loopdan himoya.
            var getResponseCount = 0
            while (data.size >= 2 &&
                data[data.size - 2] == 0x61.toByte() &&
                getResponseCount < 8
            ) {
                val le = data[data.size - 1]
                val getResponse = byteArrayOf(
                    0x00,
                    0xC0.toByte(),
                    0x00,
                    0x00,
                    le,
                )
                val more = reader.readerXfr(dev, 0, getResponse)
                data = if (data.size > 2) {
                    data.copyOfRange(0, data.size - 2) + more
                } else {
                    more
                }
                getResponseCount++
            }

            if (getResponseCount >= 8 &&
                data.size >= 2 &&
                data[data.size - 2] == 0x61.toByte()
            ) {
                throw IllegalStateException("FM GET RESPONSE limiti oshdi")
            }

            // SW1=6C XX -> faqat Le tuzatish; maksimum bir marta.
            if (data.size == 2 &&
                data[0] == 0x6C.toByte() &&
                apdu.size >= 5 &&
                correctionDepth == 0
            ) {
                val fixed = apdu.copyOf()
                fixed[fixed.size - 1] = data[1]
                return transmitInternal(fixed, correctionDepth + 1)
            }

            return data
        } catch (e: Exception) {
            // Yopilgan native handle boshqa amal tomonidan ishlatilmasin.
            cleanup(powerOff = false, recreateReader = true)
            throw e
        }
    }

    /** Faqat explicit disconnect/app detach uchun. */
    override fun disconnect() {
        cleanup(powerOff = true, recreateReader = true)
    }

    /** USB jismonan sug'urilganda powerOff qilmasdan tez tozalash. */
    override fun forceClose() {
        cleanup(powerOff = false, recreateReader = true)
    }

    private fun ensureReader(): FTReader {
        val existing = ft
        if (existing != null) return existing

        if (Looper.myLooper() == Looper.getMainLooper()) {
            return FTReader(context, handler, DK.FTREADER_TYPE_USB).also { ft = it }
        }

        val latch = CountDownLatch(1)
        var created: FTReader? = null
        var error: Exception? = null

        Handler(Looper.getMainLooper()).post {
            try {
                created = FTReader(context, handler, DK.FTREADER_TYPE_USB)
            } catch (e: Exception) {
                error = e
            } finally {
                latch.countDown()
            }
        }

        if (!latch.await(5, TimeUnit.SECONDS)) {
            throw IllegalStateException("FTReader yaratish timeout")
        }
        error?.let { throw it }

        return (created ?: throw IllegalStateException("FTReader yaratilmadi"))
            .also { ft = it }
    }

    private fun cleanup(powerOff: Boolean, recreateReader: Boolean) {
        val reader = ft
        val dev = deviceName

        if (powerOff && state == State.POWERED && reader != null && dev != null) {
            try {
                reader.readerPowerOff(dev, 0)
            } catch (_: Exception) {
                // Cleanup davom etishi kerak.
            }
        }

        if (reader != null && dev != null) {
            try {
                reader.readerClose(dev)
            } catch (_: Exception) {
                // Native handle allaqachon yopilgan bo'lishi mumkin.
            }
        }

        deviceName = null
//        foundDevice = null
//        findLatch?.countDown()
//        findLatch = null
        lastAtr = ByteArray(0)
        state = State.CLOSED
        lastCloseAtMs = System.currentTimeMillis()

        if (recreateReader) ft = null
    }

    private fun waitAfterClose() {
        val elapsed = System.currentTimeMillis() - lastCloseAtMs
        val minimumGap = 250L
        if (elapsed in 0 until minimumGap) {
            Thread.sleep(minimumGap - elapsed)
        }
    }
}
