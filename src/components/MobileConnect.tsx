import { useState, useSyncExternalStore } from 'react'
import { useT } from '../i18n'
import { mobileConnection } from '../services/mobileConnection'
import { setSlaveRole } from '../services/network'
import { reconnectNetwork, useNetworkStore } from '../services/networkSocket'
import { getMobileSyncState, subscribeMobileSync } from '../services/dataStore'

export default function MobileConnect() {
  const t = useT()
  const net = useNetworkStore()
  const sync = useSyncExternalStore(subscribeMobileSync, getMobileSyncState)
  const savedHost = mobileConnection().host
  const [editing, setEditing] = useState(false)
  const [host, setHost] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function connect() {
    setBusy(true)
    setError('')
    const result = await setSlaveRole(host)
    if (!result.ok) {
      setError(result.error === 'invalid'
        ? t('Введите правильный IP-адрес кассы', 'Kassa IP-manzilini to‘g‘ri kiriting', 'Enter a valid cash register IP address')
        : result.error || t('Касса недоступна', 'Kassa mavjud emas', 'Cash register unavailable'))
      setBusy(false)
      return
    }
    setEditing(false)
    await reconnectNetwork()
    setBusy(false)
  }

  async function retry() {
    setBusy(true)
    setError('')
    await reconnectNetwork()
    setBusy(false)
  }

  return (
    <main className="mobile-connect-screen">
      <div className="mobile-connect-card">
        <img src="/logo.png" alt="" className="mobile-connect-logo" />
        <h1>{t('Подключение к кассе', 'Kassaga ulanish', 'Connect to cash register')}</h1>
        {savedHost && !editing ? (
          <>
            <p className="mobile-connect-host">{savedHost}</p>
            <p className={`mobile-connect-status${net.connection === 'connected' && sync.ready ? ' connected' : ''}`} role="status">
              {net.connection === 'connected'
                ? sync.ready
                  ? t('Данные загружены', 'Maʼlumotlar yuklandi', 'Data loaded')
                  : t('Загрузка данных с кассы…', 'Kassadan maʼlumotlar yuklanmoqda…', 'Loading cash register data…')
                : t('Нет связи с кассой — ожидание Wi-Fi…', 'Kassa bilan aloqa yo‘q — Wi-Fi kutilmoqda…', 'No connection — waiting for Wi-Fi…')}
            </p>
            {sync.error && <p className="mobile-connect-error">{sync.error}</p>}
            <button className="mobile-connect-primary" type="button" onClick={retry} disabled={busy}>
              {busy ? t('Подключаемся…', 'Ulanmoqda…', 'Connecting…') : t('Подключиться', 'Ulanish', 'Connect')}
            </button>
            <button className="mobile-connect-secondary" type="button" onClick={() => { setHost(savedHost); setEditing(true) }}>
              {t('Изменить адрес кассы', 'Kassa manzilini o‘zgartirish', 'Change cash register address')}
            </button>
          </>
        ) : editing ? (
          <form onSubmit={e => { e.preventDefault(); void connect() }}>
            <p>{t('Телефон и касса должны быть в одной сети Wi-Fi. Введите IP-адрес главной кассы.', 'Telefon va kassa bir Wi-Fi tarmog‘ida bo‘lishi kerak. Bosh kassa IP-manzilini kiriting.', 'Connect the phone and cash register to the same Wi-Fi, then enter the main cash register IP address.')}</p>
            <label htmlFor="mobile-cashier-ip">{t('IP-адрес кассы', 'Kassa IP-manzili', 'Cash register IP address')}</label>
            <input id="mobile-cashier-ip" type="text" inputMode="decimal" value={host} onChange={e => setHost(e.target.value)} placeholder="192.168.1.100" autoComplete="off" />
            {error && <p className="mobile-connect-error" role="alert">{error}</p>}
            <button className="mobile-connect-primary" type="submit" disabled={busy}>
              {busy ? t('Подключаемся…', 'Ulanmoqda…', 'Connecting…') : t('Подключиться', 'Ulanish', 'Connect')}
            </button>
            {savedHost && <button className="mobile-connect-secondary" type="button" onClick={() => setEditing(false)}>{t('Назад', 'Orqaga', 'Back')}</button>}
          </form>
        ) : (
          <>
            <p>{t('Подключитесь к главной кассе, чтобы войти по PIN-коду.', 'PIN-kod bilan kirish uchun bosh kassaga ulaning.', 'Connect to the main cash register to continue to PIN login.')}</p>
            <button className="mobile-connect-primary" type="button" onClick={() => setEditing(true)}>
              {t('Подключиться', 'Ulanish', 'Connect')}
            </button>
          </>
        )}
      </div>
    </main>
  )
}
