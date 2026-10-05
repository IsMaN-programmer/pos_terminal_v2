package uz.posvk.posterminal

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.SharedPreferences
import android.hardware.usb.UsbDevice
import android.hardware.usb.UsbManager
import android.os.Build
import android.util.Log
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.util.Date
import java.util.LinkedList
import java.net.ConnectException
import java.net.NoRouteToHostException
import java.net.SocketException
import java.net.SocketTimeoutException
import java.net.UnknownHostException
import java.security.MessageDigest
import java.text.SimpleDateFormat
import java.util.concurrent.Executors
import java.util.concurrent.ThreadFactory
import java.util.Locale

import uz.yt.ofd.acrsim.db.SQLiteStorage
import uz.yt.ofd.acrsim.db.dto.EncryptedFullReceiptFile
import uz.yt.ofd.acrsim.sender.Sender
import uz.yt.ofd.acrsim.sender.TCPSender
import uz.yt.ofd.acrsim.sender.dto.ReceiptSyncItem
import uz.yt.ofd.acrsim.sender.dto.SyncItem
import uz.yt.ofd.acrsim.sender.dto.ZReportSyncItem
import uz.yt.ofd.android.lib.apduio.APDUCommand
import uz.yt.ofd.android.lib.apduio.APDUIO
import uz.yt.ofd.android.lib.apduio.APDUResponse
import uz.yt.ofd.android.lib.applet.SW
import uz.yt.ofd.android.lib.applet.command.AckCommand
import uz.yt.ofd.android.lib.applet.command.Applet
import uz.yt.ofd.android.lib.applet.command.GetFiscalMemoryInfoCommand
import uz.yt.ofd.android.lib.applet.command.GetInfoCommand
import uz.yt.ofd.android.lib.applet.command.GetZReportInfoCommand
import uz.yt.ofd.android.lib.applet.command.OpenCloseZReportCommand
import uz.yt.ofd.android.lib.applet.command.GetReceiptFileCommand
import uz.yt.ofd.android.lib.applet.command.GetUnackowledgedZReportsIndexesCommand
import uz.yt.ofd.android.lib.applet.command.GetZReportFileCommand
import uz.yt.ofd.android.lib.applet.command.RegisterReceiptCommand
import uz.yt.ofd.android.lib.applet.command.SyncCommand
import uz.yt.ofd.android.lib.applet.decoder.FiscalMemoryInfoDecoder
import uz.yt.ofd.android.lib.applet.decoder.FiscalSignInfoDecoder
import uz.yt.ofd.android.lib.applet.decoder.InfoDecoder
import uz.yt.ofd.android.lib.applet.decoder.ZReportInfoDecoder
import uz.yt.ofd.android.lib.applet.decoder.ReceiptFileDecoder
import uz.yt.ofd.android.lib.applet.decoder.UnackowledgedZReportsIndexesDecoder
import uz.yt.ofd.android.lib.applet.decoder.VoidDecoder
import uz.yt.ofd.android.lib.applet.decoder.ZReportFileDecoder
import uz.yt.ofd.android.lib.applet.dto.FiscalMemoryInfo
import uz.yt.ofd.android.lib.applet.dto.Info
import uz.yt.ofd.android.lib.codec.HexBin
import uz.yt.ofd.android.lib.codec.message6.SenderInfo
import uz.yt.ofd.android.lib.codec.receipt20.CommissionInfo
import uz.yt.ofd.android.lib.codec.receipt20.ExtraInfo
import uz.yt.ofd.android.lib.codec.receipt20.Location
import uz.yt.ofd.android.lib.codec.receipt20.OperationType
import uz.yt.ofd.android.lib.codec.receipt20.Receipt
import uz.yt.ofd.android.lib.codec.receipt20.ReceiptCodec
import uz.yt.ofd.android.lib.codec.receipt20.ReceiptItem
import uz.yt.ofd.android.lib.codec.receipt20.ReceiptType
import uz.yt.ofd.android.lib.codec.receipt20.RefundInfo
import uz.yt.ofd.android.lib.crypto.GOST28147Engine
import uz.yt.ofd.android.lib.exception.SWException
import uz.yt.ofd.android.lib.validator.FiscalSignValidator

/**
 * Flutter <-> FM ko'prigi.
 *
 * Qo'shimchalar:
 *  - USB DETACH receiver: FM sug'urilganda reader darhol majburan
 *    yopiladi (SDK oqimi cheksiz siklda qolmaydi) va Dart tomonga
 *    'onFmDetached' xabari yuboriladi — headerdagi indikator bir
 *    zumda yangilanadi.
 */
private class FmMethodCall(val method: String, private val arguments: Map<String, Any?>) {
    @Suppress("UNCHECKED_CAST")
    fun <T> argument(name: String): T? = arguments[name] as? T
}

private interface FmResult {
    fun success(value: Any?)
    fun error(code: String, message: String, details: Map<String, Any?>)
    fun notImplemented()
}

@CapacitorPlugin(name = "FiscalNative")
class FiscalNativePlugin : Plugin() {

    companion object {
        private const val TAG = "FiscalModulePlugin"
        private const val FTSAFE_VENDOR_ID = 0x096E // 2414
        private const val PREFS_NAME = "fm_idempotency_v1"
        private const val PREF_ORDER = "receipt_order"
        private const val MAX_IDEMPOTENCY_KEYS = 512

        private val DEFAULT_OFD_ADDRESSES = listOf(
            "s0.ofd.uz:3447",
            "s1.ofd.uz:3447",
            "s2.ofd.uz:3447",
        )
    }

    private lateinit var feitianReader: FeitianReader
    private lateinit var ccidReader: CcidReader
    private val reader: FiscalReader
        get() {
            val usb = appContext.getSystemService(Context.USB_SERVICE) as UsbManager
            return if (usb.deviceList.values.any {
                it.vendorId == CcidReader.VENDOR_ID && it.productId == CcidReader.PRODUCT_ID
            }) ccidReader else feitianReader
        }
    private lateinit var storage: SQLiteStorage
    private lateinit var appContext: Context
    private lateinit var preferences: SharedPreferences

    private var sender: Sender? = null
    private var previousUncaughtHandler: Thread.UncaughtExceptionHandler? = null
    @Volatile private var engineAttached = false

    /**
     * USB/FM amallari uchun yagona native navbat. Dart tomonda ham navbat bor,
     * lekin bu qatlam oxirgi himoya: SDK bir vaqtning o'zida ikki thread'dan
     * hech qachon chaqirilmaydi.
     */
    private val executor = Executors.newSingleThreadExecutor(
        ThreadFactory { runnable ->
            Thread(runnable, "fm-native-io").apply { isDaemon = false }
        }
    )

    private val usbReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            val device: UsbDevice? =
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                    intent.getParcelableExtra(
                        UsbManager.EXTRA_DEVICE,
                        UsbDevice::class.java,
                    )
                } else {
                    @Suppress("DEPRECATION")
                    intent.getParcelableExtra(UsbManager.EXTRA_DEVICE)
                }

            if (device == null || (device.vendorId != FTSAFE_VENDOR_ID &&
                !(device.vendorId == CcidReader.VENDOR_ID && device.productId == CcidReader.PRODUCT_ID))) return

            when (intent.action) {
                UsbManager.ACTION_USB_DEVICE_DETACHED -> {
                    Log.i(TAG, "FM USB detached")
                    executor.execute {
                        if (device.vendorId == FTSAFE_VENDOR_ID) feitianReader.forceClose()
                        else ccidReader.forceClose()
                    }
                    notifyDart("onFmDetached")
                }

                UsbManager.ACTION_USB_DEVICE_ATTACHED -> {
                    Log.i(TAG, "FM USB attached")
                    // Permission/connect UI talab qilgan paytda bajariladi.
                    notifyDart("onFmAttached")
                }
            }
        }
    }

    override fun load() {
        appContext = context.applicationContext
        feitianReader = FeitianReader(appContext)
        ccidReader = CcidReader(appContext)
        storage = SQLiteStorage(appContext)
        preferences = appContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        engineAttached = true

        installFtSafeCrashGuard()

        val filter = IntentFilter().apply {
            addAction(UsbManager.ACTION_USB_DEVICE_DETACHED)
            addAction(UsbManager.ACTION_USB_DEVICE_ATTACHED)
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            appContext.registerReceiver(usbReceiver, filter, Context.RECEIVER_EXPORTED)
        } else {
            appContext.registerReceiver(usbReceiver, filter)
        }
    }

    override fun handleOnDestroy() {
        engineAttached = false
        try {
            appContext.unregisterReceiver(usbReceiver)
        } catch (_: Exception) {
        }

        // Pending native amallardan keyin tartibli cleanup.
        executor.execute {
            try {
                feitianReader.disconnect()
                ccidReader.disconnect()
            } catch (_: Exception) {
            }
            try {
                storage.close()
            } catch (_: Exception) {
            }
        }
        executor.shutdown()

        previousUncaughtHandler?.let {
            Thread.setDefaultUncaughtExceptionHandler(it)
        }
        super.handleOnDestroy()
    }

    /**
     * FTSAFE SDK'ning o'z interrupt threadidagi ma'lum uncaught exception
     * Android processni o'ldirmasligi uchun tor doiradagi guard.
     */
    private fun installFtSafeCrashGuard() {
        val previous = Thread.getDefaultUncaughtExceptionHandler()
        previousUncaughtHandler = previous

        Thread.setDefaultUncaughtExceptionHandler { thread, error ->
            val fromFtSafe = error.stackTrace.any {
                it.className.startsWith("com.ftsafe.")
            }

            if (fromFtSafe && !isFatal(error)) {
                Log.e(TAG, "FTSAFE SDK background fault: ${thread.name}", error)
                notifyDart("onFmSdkFault")
            } else {
                previous?.uncaughtException(thread, error)
            }
        }
    }

    // Reader'ni acrsim lib'ning APDUIO interfeysiga moslash
    private inner class ReaderAPDUIO : APDUIO {
        override fun transmit(command: APDUCommand): APDUResponse =
            APDUResponse(reader.transmit(command.bytes))
    }

    private fun fmDate(value: String?): Date {
        if (value.isNullOrBlank() || value == "now") return Date()
        val parser = SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.US)
        parser.isLenient = false
        return parser.parse(value.replace('T', ' '))
            ?: throw IllegalArgumentException("Invalid fiscal date")
    }

    private fun fmtDate(value: Date?): String =
        value?.let { SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.US).format(it) } ?: ""

    private fun listDevices(): List<Map<String, String>> {
        val usb = appContext.getSystemService(Context.USB_SERVICE) as UsbManager
        val device = usb.deviceList.values.firstOrNull {
            it.vendorId == FTSAFE_VENDOR_ID ||
                (it.vendorId == CcidReader.VENDOR_ID && it.productId == CcidReader.PRODUCT_ID)
        } ?: return emptyList()
        reader.connect()
        val factoryId = getFactoryId(ReaderAPDUIO())
        val info = withApplet { io ->
            GetInfoCommand(byteArrayOf(Info.TAG_TERMINAL_ID))
                .run(io, InfoDecoder::class.java).decode()
        }
        return listOf(mapOf(
            "FactoryID" to factoryId,
            "TerminalID" to (info.terminalID ?: ""),
            "Description" to "Fiscal module",
            "ReaderName" to if (device.vendorId == FTSAFE_VENDOR_ID) "Feitian USB" else "Identiv SCR35xx CCID",
        ))
    }

    private fun memoryInfo(): Map<String, Any?> = withApplet { io ->
        val info = GetFiscalMemoryInfoCommand(null)
            .run(io, FiscalMemoryInfoDecoder::class.java).decode()
        mapOf(
            "TerminalID" to (info.terminalID ?: ""),
            "ReceiptSeq" to (info.receiptSeq ?: 0),
            "ReceiptsCount" to (info.receiptsCount ?: 0),
            "ZReportsCount" to (info.zreportsCount ?: 0),
            "LastOperationTime" to fmtDate(info.lastOperationTime),
        )
    }

    private fun shiftInfo(index: Int): Map<String, Any?> = withApplet { io ->
        val info = GetZReportInfoCommand(index.toShort(), null)
            .run(io, ZReportInfoDecoder::class.java).decode()
        mapOf(
            "TerminalID" to (info.terminalID ?: ""),
            "OpenTime" to fmtDate(info.openTime),
            "CloseTime" to fmtDate(info.closeTime),
            "FirstReceiptSeq" to (info.firstReceiptSeq ?: 0),
            "LastReceiptSeq" to (info.lastReceiptSeq ?: 0),
            "TotalSaleCount" to (info.totalSaleCount ?: 0),
            "TotalRefundCount" to (info.totalRefundCount ?: 0),
            "TotalCash" to mapOf("Sale" to (info.totalCash?.sale ?: 0), "Refund" to (info.totalCash?.refund ?: 0)),
            "TotalCard" to mapOf("Sale" to (info.totalCard?.sale ?: 0), "Refund" to (info.totalCard?.refund ?: 0)),
            "TotalVAT" to mapOf("Sale" to (info.totalVAT?.sale ?: 0), "Refund" to (info.totalVAT?.refund ?: 0)),
        )
    }

    private fun changeShift(open: Boolean, time: String?): String = withApplet { io ->
        OpenCloseZReportCommand(open, fmDate(time)).run(io, VoidDecoder::class.java)
        "OK"
    }

    private fun registeredReceipt(txid: String): Map<String, Any?> {
        val response = registerByTxid(txid.toLong())
        val raw = hex(response.dropLast(4))
        val info = FiscalSignInfoDecoder(raw).decode()
        val sign = HexBin.encode(info.fiscalSign)
        val date = fmtDate(info.time)
        return mapOf(
            "TerminalID" to info.terminalID,
            "ReceiptSeq" to info.receiptSeq,
            "FiscalSign" to sign,
            "DateTime" to date,
            "QRCodeURL" to "https://ofd.soliq.uz/check?t=${info.terminalID}&r=${info.receiptSeq}&c=${date.replace(Regex("[^0-9]"), "")}&s=$sign",
        )
    }

    @PluginMethod
    fun invoke(call: PluginCall) {
        val method = call.getString("method")
        if (method.isNullOrBlank()) {
            call.reject("Missing fiscal method")
            return
        }
        val args = call.data.optJSONObject("args")?.let { objectToMap(it) } ?: emptyMap()
        onMethodCall(FmMethodCall(method, args), object : FmResult {
            override fun success(value: Any?) {
                val response = JSObject()
                response.put("value", jsonResponseValue(value))
                call.resolve(response)
            }

            override fun error(code: String, message: String, details: Map<String, Any?>) {
                call.reject(message, code, null, JSObject.fromJSONObject(JSONObject(details)))
            }

            override fun notImplemented() {
                call.reject("Unsupported fiscal method: $method")
            }
        })
    }

    private fun objectToMap(value: JSONObject): Map<String, Any?> =
        value.keys().asSequence().associateWith { key -> jsonValue(value.opt(key)) }

    private fun jsonValue(value: Any?): Any? = when (value) {
        is JSONObject -> objectToMap(value)
        is JSONArray -> (0 until value.length()).map { jsonValue(value.opt(it)) }
        JSONObject.NULL -> null
        else -> value
    }

    private fun jsonResponseValue(value: Any?): Any? = when (value) {
        is Map<*, *> -> JSONObject().apply {
            value.forEach { (key, item) -> if (key != null) put(key.toString(), jsonResponseValue(item)) }
        }
        is Iterable<*> -> JSONArray().apply { value.forEach { put(jsonResponseValue(it)) } }
        else -> value
    }

    private fun onMethodCall(call: FmMethodCall, result: FmResult) {
        if (!engineAttached) {
            result.error(
                "FM_NOT_CONNECTED",
                "Fiskal modul mavjud emas",
                mapOf("kind" to "notConnected", "retryable" to true),
            )
            return
        }

        executor.execute {
            try {
                val response: Any? = when (call.method) {
                    "listDevices" -> listDevices()
                    "memoryInfo" -> memoryInfo()
                    "shiftInfo" -> shiftInfo(call.argument<Number>("index")?.toInt() ?: 0)
                    "openShift" -> changeShift(true, call.argument("dateTime"))
                    "closeShift" -> changeShift(false, call.argument("dateTime"))
                    "registerTxid" -> registeredReceipt(requireArgument(call, "txid"))
                    "connect" -> toHex(reader.connect())
                    "reset" -> toHex(reader.resetAndConnect())
                    "isConnected" -> reader.isConnected()

                    "disconnect" -> {
                        reader.disconnect()
                        null
                    }

                    "transmit" -> {
                        val apduHex = requireArgument<String>(call, "apdu")
                        toHex(reader.transmit(hex(apduHex)))
                    }

                    "execute" -> {
                        val apduHex = requireArgument<String>(call, "apdu")
                        withApplet { toHex(reader.transmit(hex(apduHex))) }
                    }

                    "setServerAddresses" -> {
                        val addresses = requireArgument<List<String>>(call, "addresses")
                            .map { it.trim() }
                            .filter { it.isNotEmpty() }
                        require(addresses.isNotEmpty()) {
                            "OFD server manzillari bo'sh"
                        }
                        sender = buildSender(addresses)
                        null
                    }

                    "encodeReceipt" -> encodeReceipt(call)

                    "registerReceipt" -> {
                        val txid = call.argument<String>("txid")
                        if (!txid.isNullOrBlank()) {
                            registerByTxid(txid.toLong())
                        } else {
                            registerLegacy(requireArgument(call, "totalBlock"))
                        }
                    }

                    "sync" -> sync(call)

                    else -> {
                        mainThread { result.notImplemented() }
                        return@execute
                    }
                }

                mainThread { result.success(response) }
            } catch (error: Throwable) {
                if (isFatal(error)) throw error
                deliverError(result, error)
            }
        }
    }

    // ------------------------------------------------------------------
    // encodeReceipt
    // ------------------------------------------------------------------

    private fun encodeReceipt(call: FmMethodCall): Map<String, String> {
        val type = call.argument<Number>("type")!!.toByte()
        val operation = call.argument<Number>("operation")!!.toByte()
        val cash = call.argument<Number>("cash")!!.toLong()
        val card = call.argument<Number>("card")!!.toLong()
        val timeMillis = call.argument<Number>("timeMillis")!!.toLong()
        val itemsArg = call.argument<List<Map<String, Any?>>>("items")!!

        val items = LinkedList<ReceiptItem>()
        for (m in itemsArg) {
            val commissionTin = (m["TIN"] as String?)?.trim().orEmpty()
            val commissionPinfl = (m["PINFL"] as String?)?.trim().orEmpty()
            val commission =
                if (commissionTin.isNotEmpty() || commissionPinfl.isNotEmpty()) {
                    CommissionInfo(
                        commissionTin.ifEmpty { null },
                        commissionPinfl.ifEmpty { null },
                    )
                } else {
                    null
                }

            items.add(
                ReceiptItem(
                    m["Name"] as String,
                    m["Barcode"] as String?,
                    m["label"] as String?,
                    m["spic"] as String,
                    (m["units"] as Number).toLong(),
                    m["packageCode"] as String?,
                    ((m["ownerType"] as Number?) ?: 0).toByte(),
                    (m["price"] as Number).toLong(),
                    (m["vatPercent"] as Number).toShort(),
                    (m["vat"] as Number).toLong(),
                    (m["amount"] as Number).toLong(),
                    ((m["discount"] as Number?) ?: 0L).toLong(),
                    ((m["other"] as Number?) ?: 0L).toLong(),
                    commission,
                )
            )
        }

        val receiptType = ReceiptType.values().first { it.value == type }
        val operationType = OperationType.values().first { it.value == operation }

        val lat = call.argument<Number>("latitude")?.toDouble()
        val lng = call.argument<Number>("longitude")?.toDouble()
        val location = if (lat != null && lng != null) Location(lat, lng) else null

        val cardType = call.argument<Number>("cardType")?.toByte()
        val cardNumber = call.argument<String>("cardNumber")
            ?.trim()?.takeIf { it.isNotEmpty() }

        val qrPaymentId = call.argument<String>("qrPaymentId")
            ?.trim()?.takeIf { it.isNotEmpty() }
        val pptId = call.argument<String>("pptid")
            ?.trim()?.takeIf { it.isNotEmpty() }

        val extraInfo = if (cardType != null || cardNumber != null ||
            qrPaymentId != null || pptId != null) {
            ExtraInfo().apply {
                if (cardType != null) this.cardType = cardType
                if (cardNumber != null) this.cardNumber = cardNumber
                if (qrPaymentId != null) this.qrPaymentId = qrPaymentId
                if (pptId != null) this.pptid = pptId
            }
        } else {
            null
        }

        val refundInfo =
            if ((operation.toInt() and 0xFF) == 0x01) {
                val originalTerminalId =
                    requireArgument<String>(call, "refundTerminalId",).trim()
                val originalReceiptSeq = requireArgument<Number>(call, "refundReceiptSeq",).toLong()
                val originalDateTime = requireArgument<String>(call, "refundDateTime",).trim()
                val originalFiscalSign = requireArgument<String>(call, "refundFiscalSign",).trim()
                require(originalTerminalId.isNotEmpty()) {
                    "Qaytarilayotgan chek TerminalID bo'sh"
                }
                require(originalReceiptSeq > 0) {
                    "Qaytarilayotgan chek ReceiptSeq noto'g'ri"
                }
                require(
                    originalDateTime.matches(
                        Regex("""\d{14}""")
                    )
                ) {
                    "Qaytarilayotgan chek sanasi noto'g'ri"
                }
                require(
                    originalFiscalSign.isNotEmpty() &&
                            originalFiscalSign.length % 2 == 0 &&
                            originalFiscalSign.matches(
                                Regex("""[0-9A-Fa-f]+""")
                            )
                ) {
                    "Qaytarilayotgan chek FiscalSign noto'g'ri"
                }
                RefundInfo(
                    originalTerminalId,
                    originalReceiptSeq.toString(),
                    originalDateTime,
                    originalFiscalSign,
                )
            } else {
                null
            }

        val receipt = Receipt(
            items,
            cash,
            card,
            Date(timeMillis),
            receiptType,
            operationType,
            refundInfo,
            location,
            extraInfo,
        )

        val receiptKey = requireArgument<String>(call, "receiptKey").trim()
        require(receiptKey.isNotEmpty()) { "receiptKey bo'sh" }

        val txidPreferenceKey = txidPreferenceKey(receiptKey)
        val existingId = preferences.getLong(txidPreferenceKey, -1L)

        if (existingId > 0L) {
            try {
                val existingFactoryID =
                    preferences.getString(factoryPreferenceKey(existingId), null)
                        ?: getFactoryId(ReaderAPDUIO()).also {
                            preferences.edit()
                                .putString(factoryPreferenceKey(existingId), it)
                                .commit()
                        }
                val existing = storage.getReceiptRegisterLog(
                    existingFactoryID,
                    existingId,
                )
                return mapOf(
                    "txid" to existingId.toString(),
                    "totalBlock" to HexBin.encode(existing.totalBlockRaw),
                    "fullReceipt" to HexBin.encode(existing.tlvEncodedReceiptRaw),
                    "reused" to "true",
                )
            } catch (error: Throwable) {
                Log.w(TAG, "Stale receiptKey cache removed: $receiptKey", error)
                preferences.edit().remove(txidPreferenceKey).commit()
            }
        }

        val factoryID = getFactoryId(ReaderAPDUIO())
        val tlvOut = ByteArrayOutputStream()
        val tbOut = ByteArrayOutputStream()
        ReceiptCodec.encode(
            receipt,
            tlvOut,
            tbOut,
            FiscalSignValidator { _, _, _, _ -> true },
        )

        val txid = storage.newReceiptRegisterLog(
            factoryID,
            ReceiptCodec.VERSION,
            receiptType.value,
            operationType.value,
            tlvOut.toByteArray(),
            tbOut.toByteArray(),
        )

        rememberTxid(txidPreferenceKey, txid, factoryID)

        return mapOf(
            "txid" to txid.toString(),
            "totalBlock" to HexBin.encode(tbOut.toByteArray()),
            "fullReceipt" to HexBin.encode(tlvOut.toByteArray()),
            "reused" to "false",
        )
    }

    // ------------------------------------------------------------------
    // registerReceipt (txid)
    // ------------------------------------------------------------------

    private fun registerByTxid(id: Long): String {
        require(id > 0) { "txid noto'g'ri" }

        val completedResponse = preferences.getString(registeredPreferenceKey(id), null)
        if (!completedResponse.isNullOrBlank()) {
            return completedResponse
        }

        val apduio = ReaderAPDUIO()
        val factoryID = preferences.getString(factoryPreferenceKey(id), null)
            ?: getFactoryId(apduio).also {
                preferences.edit().putString(factoryPreferenceKey(id), it).commit()
            }
        val receiptLog = storage.getReceiptRegisterLog(factoryID, id)

        // APDU javobi olingan, lekin app FullReceipt'ni bazaga yozish vaqtida
        // yopilgan bo'lsa, fiskal APDU'ni qayta yubormasdan finalize qilamiz.
        val pendingResponse = preferences.getString(pendingResponseKey(id), null)
        if (!pendingResponse.isNullOrBlank()) {
            val terminalId = preferences.getString(pendingTerminalKey(id), null)
            val receiptSeq = preferences.getLong(pendingSeqKey(id), -1L)
            val timeMillis = preferences.getLong(pendingTimeKey(id), -1L)
            val cipherKeyHex = preferences.getString(pendingCipherKey(id), null)

            if (!terminalId.isNullOrBlank() &&
                receiptSeq >= 0L &&
                timeMillis > 0L &&
                !cipherKeyHex.isNullOrBlank()
            ) {
                val encrypted = encryptFullReceipt(
                    receiptLog.tlvEncodedReceiptRaw,
                    hex(cipherKeyHex),
                )

                try {
                    storage.newFullReceipt(
                        factoryID,
                        terminalId,
                        receiptSeq,
                        Date(timeMillis),
                        receiptLog.receiptVersion,
                        receiptLog.receiptType,
                        receiptLog.operation,
                        encrypted,
                        id,
                    )
                } catch (error: Throwable) {
                    // App oldingi urinishda yozuvni yaratib, complete markerga
                    // ulgurmagan bo'lishi mumkin. Faqat duplicate/constraint
                    // xatosini muvaffaqiyat deb qabul qilamiz.
                    val text = (error.message ?: "").lowercase()
                    if ("unique" !in text &&
                        "constraint" !in text &&
                        "already exists" !in text
                    ) {
                        throw error
                    }
                }

                markRegistrationComplete(id, pendingResponse)
                return pendingResponse
            }

            clearPendingRegistration(id)
        }

        val cipher = GOST28147Engine()
        val tlvRaw = receiptLog.tlvEncodedReceiptRaw
        if (tlvRaw.size % cipher.blockSize != 0) {
            throw IllegalStateException(
                "FullReceipt hajmi ${tlvRaw.size} blok hajmiga " +
                    "(${cipher.blockSize}) bo'linmaydi"
            )
        }

        return withApplet {
            val decoder = try {
                RegisterReceiptCommand(receiptLog.totalBlockRaw)
                    .run(apduio, FiscalSignInfoDecoder::class.java)
            } catch (error: Throwable) {
                storage.updateReceiptRegisterLog(
                    factoryID,
                    id,
                    error.message ?: error.javaClass.simpleName,
                )
                throw error
            }

            val info = decoder.decode()
            val response = HexBin.encode(decoder.data) + "9000"

            storage.updateReceiptRegisterLog(
                factoryID,
                id,
                decoder.data,
                info.terminalID,
                info.receiptSeq,
            )

            // Javobni va shifrlash uchun zarur ma'lumotlarni avval durable
            // saqlaymiz. Shu nuqtadan keyingi crash'da APDU qayta yuborilmaydi.
            preferences.edit()
                .putString(pendingResponseKey(id), response)
                .putString(pendingTerminalKey(id), info.terminalID)
                .putLong(pendingSeqKey(id), info.receiptSeq.toLong())
                .putLong(pendingTimeKey(id), info.time.time)
                .putString(pendingCipherKey(id), HexBin.encode(info.cipherKey))
                .commit()

            cipher.init(true, cipher.getSBox("D-A"), info.cipherKey)
            val encryptedFile = ByteArray(tlvRaw.size)
            var offset = 0
            while (offset < tlvRaw.size) {
                cipher.processBlock(tlvRaw, offset, encryptedFile, offset)
                offset += cipher.blockSize
            }

            storage.newFullReceipt(
                factoryID,
                info.terminalID,
                info.receiptSeq,
                info.time,
                receiptLog.receiptVersion,
                receiptLog.receiptType,
                receiptLog.operation,
                encryptedFile,
                id,
            )

            markRegistrationComplete(id, response)
            response
        }
    }

    private fun registerLegacy(totalBlockHex: String): String = withApplet {
        val decoder = RegisterReceiptCommand(hex(totalBlockHex))
            .run(ReaderAPDUIO(), FiscalSignInfoDecoder::class.java)
        HexBin.encode(decoder.data) + "9000"
    }

    // ------------------------------------------------------------------
    // sync
    // ------------------------------------------------------------------

    private fun sync(call: FmMethodCall): String {
        val snd = sender ?: buildSender(DEFAULT_OFD_ADDRESSES).also { sender = it }

        var maxItems = (call.argument<Number>("maxItems") ?: 32).toInt()
        val doStateSync = call.argument<Boolean>("stateSync") ?: true

        val apduio = ReaderAPDUIO()
        val factoryID = getFactoryId(apduio)

        return withApplet {
            val report = StringBuilder()

            if (doStateSync) {
                try {
                    val tags = byteArrayOf(Info.TAG_TERMINAL_ID, Info.TAG_SYNC_CHALLENGE)
                    val info = GetInfoCommand(tags)
                        .run(apduio, InfoDecoder::class.java).decode()
                    val syncFile = snd.SyncState(info.terminalID, info.syncChallenge)
                    SyncCommand(syncFile).run(apduio, VoidDecoder::class.java)
                    report.append("state:OK ")
                } catch (t: Throwable) {
                    if (maxItems == 0) throw t
                    report.append("state:ERR ")
                }
            }

            val syncItems = LinkedList<SyncItem>()

            val fmTags = byteArrayOf(
                FiscalMemoryInfo.TAG_TERMINAL_ID,
                FiscalMemoryInfo.TAG_RECEIPTS_COUNT,
            )
            val fmInfo = GetFiscalMemoryInfoCommand(fmTags)
                .run(apduio, FiscalMemoryInfoDecoder::class.java).decode()
            val terminalId = fmInfo.terminalID

            if (fmInfo.receiptsCount > 0) {
                var index: Short = 0
                while (maxItems > 0) {
                    try {
                        val rf = GetReceiptFileCommand(true, index, null)
                            .run(apduio, ReceiptFileDecoder::class.java).decode()

                        val full: EncryptedFullReceiptFile? =
                            storage.getFullReceipt(factoryID, rf.terminalID, rf.receiptSeq)

                        syncItems.add(ReceiptSyncItem(rf, full))
                    } catch (swe: SWException) {
                        if (swe.sw == SW.NOT_FOUND) break else throw swe
                    }
                    index++
                    maxItems--
                }
            }

            run {
                val unz = GetUnackowledgedZReportsIndexesCommand()
                    .run(apduio, UnackowledgedZReportsIndexesDecoder::class.java).decode()
                var i = 0
                while (maxItems > 0 && i < unz.count) {
                    val index = unz.indexes[i]
                    try {
                        val zf = GetZReportFileCommand(index)
                            .run(apduio, ZReportFileDecoder::class.java).decode()
                        syncItems.add(ZReportSyncItem(zf))
                    } catch (swe: SWException) {
                        when (swe.sw) {
                            SW.ZREPORT_IS_NOT_CLOSED, SW.ZREPORT_IS_NOT_OPENED -> {}
                            SW.NOT_FOUND -> break
                            else -> throw swe
                        }
                    }
                    i++
                    maxItems--
                }
            }

            if (syncItems.isEmpty()) {
                return@withApplet report.append("files:0").toString()
            }

            val status = snd.SyncItems(terminalId, syncItems)
                ?: return@withApplet report.append("files:0").toString()

            when (status.statusCode.name) {
                "OK" -> {}
                "OKNotice" -> report.append("notice:${status.notice} ")
                "RetrySend" -> throw IllegalStateException(
                    "Server band — keyinroq qayta urinib ko'ring")
                else -> throw IllegalStateException(
                    "OFD server rad etdi: ${status.statusCode.name} ${status.notice ?: ""}")
            }

            var ok = 0
            var fail = 0
            for (item in syncItems) {
                val af = item.ackFile
                if (af == null) {
                    fail++
                    continue
                }
                when (af.status.name) {
                    "Acknowledge" -> {
                        try {
                            AckCommand(af.body, item.index)
                                .run(apduio, VoidDecoder::class.java)
                            ok++
                        } catch (swe: SWException) {
                            if (swe.sw == SW.NOT_FOUND) ok++
                            else throw swe
                        }
                    }
                    else -> fail++
                }
            }

            report.append("files:${syncItems.size} ack:$ok fail:$fail").toString()
        }
    }

    // ------------------------------------------------------------------
    // Yordamchilar
    // ------------------------------------------------------------------

    private fun <T> withApplet(block: (APDUIO) -> T): T {
        reader.connect()
        val apduio = ReaderAPDUIO()
        val sel = apduio.transmit(Applet.selectCommand())
        if (sel.sw.toInt() != SW.NO_ERROR.code.toInt()) {
            throw SWException(sel.sw)
        }
        try {
            return block(apduio)
        } finally {
            try { apduio.transmit(Applet.deselectCommand()) } catch (_: Exception) {}
        }
    }

    private fun getFactoryId(apduio: APDUIO): String {
        val resp = apduio.transmit(
            APDUCommand("get factory id", 0x00, 0xCA.toByte(), 0x9F.toByte(), 0x7F))
        var cplc = resp.data
        if (cplc.size > 3 && cplc[0] == 0x9F.toByte() && cplc[1] == 0x7F.toByte()) {
            cplc = cplc.copyOfRange(3, cplc.size)
        }
        return HexBin.encode(cplc)
    }

    private data class ClassifiedError(
        val code: String,
        val kind: String,
        val retryable: Boolean,
        val sw: Int? = null,
    )

    private fun deliverError(result: FmResult, error: Throwable) {
        val classified = classify(error)

        if (classified.kind == "usbTransport" ||
            classified.kind == "notConnected"
        ) {
            try {
                reader.forceClose()
            } catch (_: Exception) {
            }
        }

        Log.e(TAG, "${classified.code}: ${error.message}", error)

        val details = mutableMapOf<String, Any?>(
            "kind" to classified.kind,
            "retryable" to classified.retryable,
            "technical" to (error.message ?: error.javaClass.name),
        )
        classified.sw?.let { details["sw"] = it }

        mainThread {
            result.error(
                classified.code,
                error.message ?: "Fiscal module operation failed",
                details,
            )
        }
    }

    private fun classify(error: Throwable): ClassifiedError {
        val root = rootCause(error)
        val message = (root.message ?: error.message ?: "").lowercase()
        val className = root.javaClass.name

        if (root is SWException) {
            return ClassifiedError(
                code = "FM_SW",
                kind = "statusWord",
                retryable = false,
                sw = root.sw.code.toInt() and 0xFFFF,
            )
        }

        if (root is UsbPermissionException) {
            return ClassifiedError(
                code = "FM_USB_PERMISSION",
                kind = "notConnected",
                retryable = false,
            )
        }

        if (root is SocketTimeoutException ||
            "timed out" in message ||
            "timeout" in message
        ) {
            return ClassifiedError("FM_TIMEOUT", "timeout", true)
        }

        if (root is UnknownHostException ||
            root is ConnectException ||
            root is NoRouteToHostException ||
            root is SocketException ||
            "enetunreach" in message ||
            "ehostunreach" in message ||
            "network is unreachable" in message ||
            "failed to connect to" in message ||
            "connection refused" in message
        ) {
            return ClassifiedError("OFD_NETWORK", "network", true)
        }

        if (className.startsWith("com.ftsafe.") ||
            "usb_send" in message ||
            "usb_recv" in message ||
            "device is closed" in message ||
            "err : 612" in message ||
            "native_control_request" in message
        ) {
            return ClassifiedError("FM_USB_TRANSPORT", "usbTransport", true)
        }

        if ("topilmadi" in message ||
            "not found" in message ||
            "ulanmagan" in message ||
            "ulanish yo'q" in message ||
            "o'quvchi ochilmagan" in message ||
            "usb device" in message
        ) {
            return ClassifiedError("FM_NOT_CONNECTED", "notConnected", true)
        }

        if ("server band" in message ||
            "ofd server rad etdi" in message ||
            "retrysend" in message
        ) {
            return ClassifiedError("OFD_SERVER", "server", true)
        }

        if (root is IllegalArgumentException ||
            root is NumberFormatException ||
            "noto'g'ri" in message ||
            "bo'sh" in message
        ) {
            return ClassifiedError("FM_INVALID_DATA", "invalidData", false)
        }

        return ClassifiedError("FM_INTERNAL", "internal", false)
    }

    private fun rootCause(error: Throwable): Throwable {
        var current = error
        val seen = HashSet<Throwable>()
        while (current.cause != null && seen.add(current)) {
            current = current.cause!!
        }
        return current
    }

    private fun isFatal(error: Throwable): Boolean =
        error is VirtualMachineError || error is ThreadDeath || error is LinkageError

    private fun buildSender(addresses: List<String>): Sender =
        TCPSender(
            addresses,
            3500,
            SenderInfo("posvk-mobile", "", "v1.0"),
        )

    private fun notifyDart(method: String) {
        if (!engineAttached) return
        mainThread {
            if (!engineAttached) return@mainThread
            try {
                notifyListeners(method, JSObject())
            } catch (_: Exception) {
            }
        }
    }

    private inline fun <reified T> requireArgument(
        call: FmMethodCall,
        name: String,
    ): T = call.argument<T>(name)
        ?: throw IllegalArgumentException("$name argument yo'q")

    private fun pendingResponseKey(txid: Long) = "pending:response:$txid"
    private fun pendingTerminalKey(txid: Long) = "pending:terminal:$txid"
    private fun pendingSeqKey(txid: Long) = "pending:seq:$txid"
    private fun pendingTimeKey(txid: Long) = "pending:time:$txid"
    private fun pendingCipherKey(txid: Long) = "pending:cipher:$txid"

    private fun markRegistrationComplete(txid: Long, response: String) {
        preferences.edit()
            .putString(registeredPreferenceKey(txid), response)
            .remove(pendingResponseKey(txid))
            .remove(pendingTerminalKey(txid))
            .remove(pendingSeqKey(txid))
            .remove(pendingTimeKey(txid))
            .remove(pendingCipherKey(txid))
            .commit()
    }

    private fun clearPendingRegistration(txid: Long) {
        preferences.edit()
            .remove(pendingResponseKey(txid))
            .remove(pendingTerminalKey(txid))
            .remove(pendingSeqKey(txid))
            .remove(pendingTimeKey(txid))
            .remove(pendingCipherKey(txid))
            .commit()
    }

    private fun encryptFullReceipt(raw: ByteArray, cipherKey: ByteArray): ByteArray {
        val cipher = GOST28147Engine()
        if (raw.size % cipher.blockSize != 0) {
            throw IllegalStateException("FullReceipt blok hajmiga bo'linmaydi")
        }
        cipher.init(true, cipher.getSBox("D-A"), cipherKey)
        val encrypted = ByteArray(raw.size)
        var offset = 0
        while (offset < raw.size) {
            cipher.processBlock(raw, offset, encrypted, offset)
            offset += cipher.blockSize
        }
        return encrypted
    }

    private fun txidPreferenceKey(receiptKey: String): String =
        "txid:${sha256(receiptKey)}"

    private fun registeredPreferenceKey(txid: Long): String =
        "registered:$txid"

    private fun factoryPreferenceKey(txid: Long): String =
        "factory:$txid"

    private fun sha256(value: String): String =
        MessageDigest.getInstance("SHA-256")
            .digest(value.toByteArray(Charsets.UTF_8))
            .joinToString("") { "%02x".format(it) }

    private fun rememberTxid(key: String, txid: Long, factoryID: String) {
        val order = preferences.getString(PREF_ORDER, "")
            .orEmpty()
            .split('|')
            .filter { it.isNotBlank() && it != key }
            .toMutableList()

        order.add(key)
        val editor = preferences.edit()
            .putLong(key, txid)
            .putString(factoryPreferenceKey(txid), factoryID)

        while (order.size > MAX_IDEMPOTENCY_KEYS) {
            val removedKey = order.removeAt(0)
            val removedTxid = preferences.getLong(removedKey, -1L)
            editor.remove(removedKey)
            if (removedTxid > 0) {
                editor.remove(registeredPreferenceKey(removedTxid))
                editor.remove(factoryPreferenceKey(removedTxid))
                editor.remove(pendingResponseKey(removedTxid))
                editor.remove(pendingTerminalKey(removedTxid))
                editor.remove(pendingSeqKey(removedTxid))
                editor.remove(pendingTimeKey(removedTxid))
                editor.remove(pendingCipherKey(removedTxid))
            }
        }

        editor.putString(PREF_ORDER, order.joinToString("|")).commit()
    }

    private fun mainThread(block: () -> Unit) =
        android.os.Handler(android.os.Looper.getMainLooper()).post(block)

    private fun hex(s: String): ByteArray {
        val clean = s.replace(" ", "")
        return ByteArray(clean.length / 2) {
            clean.substring(it * 2, it * 2 + 2).toInt(16).toByte()
        }
    }

    private fun toHex(b: ByteArray) = b.joinToString("") { "%02X".format(it) }
}
