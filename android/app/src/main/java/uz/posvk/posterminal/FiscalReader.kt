package uz.posvk.posterminal

interface FiscalReader {
    fun connect(): ByteArray
    fun resetAndConnect(): ByteArray
    fun isConnected(): Boolean
    fun transmit(apdu: ByteArray): ByteArray
    fun disconnect()
    fun forceClose()
}
