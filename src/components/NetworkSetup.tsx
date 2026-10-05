import { useEffect, useState } from 'react'
import { useT } from '../i18n'
import { useNetworkStore, setRoleLocal, refreshTerminals, reconnectNetwork } from '../services/networkSocket'
import { isNativeMobile } from '../services/capacitor'
import { setMasterRole, setNeutralRole, setSlaveRole, kickTerminal, restartAsSlave, resetSlaveMode } from '../services/network'
import { GlobeIcon, SmartphoneIcon } from './Icons'

function fmtTime(iso: string): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
}

export default function NetworkSetup() {
  const t = useT()
  const net = useNetworkStore()
  const [modalOpen, setModalOpen] = useState(false)
  const [ipInput, setIpInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [ipInfo, setIpInfo] = useState<{ ip: string; port: number }>({ ip: '—', port: 5000 })

  useEffect(() => {
    if (net.role !== 'master') return
    refreshTerminals()
    const timer = setInterval(refreshTerminals, 5000)
    return () => clearInterval(timer)
  }, [net.role])

  useEffect(() => {
    if (net.role !== 'master') return
    fetch('/api/network/status')
      .then(r => r.json())
      .then(d => setIpInfo({ ip: d.ip || '—', port: d.port || 5000 }))
      .catch(() => {})
  }, [net.role])

  async function handleCreateIp() {
    setBusy(true)
    setError('')
    const ok = await setMasterRole()
    if (ok) {
      setRoleLocal('master')
      refreshTerminals()
    } else {
      setError(t('Не удалось активировать режим кассы', 'Kassa rejimini faollashtirib bo\'lmadi', 'Failed to activate cash register mode'))
    }
    setBusy(false)
  }

  async function handleConnect() {
    setError('')
    if (!ipInput.trim()) {
      setError(t('Введите IP-адрес кассы', 'Kassa IP-manzilini kiriting', 'Enter cash register IP address'))
      return
    }
    setBusy(true)
    const res = await setSlaveRole(ipInput)
    if (!res.ok) {
      setError(res.error === 'invalid'
        ? t('Неверный IP-адрес. Пример: 192.168.1.100', 'Noto\'g\'ri IP-manzil. Masalan: 192.168.1.100', 'Invalid IP address. Example: 192.168.1.100')
        : (isNativeMobile() ? res.error || 'Касса недоступна' : t('Не удалось сохранить настройки', 'Sozlamalarni saqlab bo\'lmadi', 'Failed to save settings')))
      setBusy(false)
      return
    }
    setBusy(false)
    if (isNativeMobile()) { setModalOpen(false); await reconnectNetwork(); return }
    await restartAsSlave()
  }

  async function handleReset() {
    setBusy(true)
    setError('')
    if (net.role === 'slave') {
      const ok = await resetSlaveMode()
      if (ok && isNativeMobile()) { await reconnectNetwork(); setBusy(false); return }
      if (ok && window.electronAPI?.restartApp) {
        await window.electronAPI.restartApp()
        return
      }
      setError(t('Не удалось отключиться от кассы', 'Kassadan uzilib bo\'lmadi', 'Failed to disconnect from cash register'))
    } else {
      const ok = await setNeutralRole()
      if (ok) setRoleLocal('neutral')
    }
    setBusy(false)
  }

  async function handleKick(id: string) {
    await kickTerminal(id)
    refreshTerminals()
  }

  const online = net.terminals.filter(x => x.connected)
  const offline = net.terminals.filter(x => !x.connected)

  return (
    <div style={{ background: '#fff', borderRadius: 12, padding: isNativeMobile() ? 16 : 24, boxShadow: '0 4px 14px rgba(0,0,0,0.12)' }}>
      <h3 style={{ fontSize: 16, fontWeight: 700, color: '#1e293b', margin: '0 0 16px 0' }}>
        {t('Сеть терминалов', 'Terminallar tarmog\'i', 'Terminal network')}
      </h3>

      {net.role === 'neutral' && (
        <div>
          <div style={{ fontSize: 13, color: '#64748b', marginBottom: 16, lineHeight: 1.5 }}>
            {isNativeMobile() ? 'Подключите телефон и главную кассу к одной сети Wi-Fi. На кассе включите «Создать IP» и укажите её адрес здесь.' : t('Выберите режим работы этого компьютера:', 'Ushbu kompyuterning ish rejimini tanlang:', 'Select operating mode for this computer:')}
          </div>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            {!isNativeMobile() && <button
              onClick={handleCreateIp}
              disabled={busy}
              style={{ flex: 1, minWidth: 260, padding: '22px 20px', borderRadius: 12, border: '2px solid #2563eb', background: '#eff6ff', cursor: 'pointer', textAlign: 'left' }}
            >
              <div style={{ fontSize: 18, fontWeight: 700, color: '#1d4ed8', marginBottom: 6 }}>{t('Создать IP', 'IP yaratish', 'Create IP')}</div>
              <div style={{ fontSize: 13, color: '#475569' }}>
                {t('Главная касса. Другие терминалы будут подключаться к этому компьютеру.', 'Bosh kassa. Boshqa terminallar ushbu kompyuterga ulanadi.', 'Main cash register. Other terminals will connect to this computer.')}
              </div>
            </button>}
            <button
              onClick={() => { setModalOpen(true); setIpInput(''); setError('') }}
              disabled={busy}
              style={{ flex: 1, minWidth: isNativeMobile() ? 0 : 260, padding: '22px 20px', borderRadius: 12, border: '2px solid #059669', background: '#ecfdf5', cursor: 'pointer', textAlign: 'left' }}
            >
              <div style={{ fontSize: 18, fontWeight: 700, color: '#047857', marginBottom: 6 }}>{t('Подключиться', 'Ulanish', 'Connect')}</div>
              <div style={{ fontSize: 13, color: '#475569' }}>
                {t('Терминал официанта. Подключиться к главной кассе по Wi-Fi.', 'Ofitsiant terminali. Wi-Fi orqali bosh kassaga ulanish.', 'Waiter terminal. Connect to main cash register via Wi-Fi.')}
              </div>
            </button>
          </div>
          {error && <div style={{ color: '#ef4444', fontSize: 13, marginTop: 12 }}>{error}</div>}
        </div>
      )}

      {net.role === 'master' && (
        <div>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center', padding: '14px 18px', borderRadius: 10, background: '#eff6ff', border: '1px solid #bfdbfe', marginBottom: 16, flexWrap: 'wrap' }}>
            <span style={{ color: '#1d4ed8', display: 'flex' }}><GlobeIcon /></span>
            <div>
              <div style={{ fontSize: 13, color: '#475569', fontWeight: 500 }}>{t('Ваш IP-адрес для подключения', 'Ulanish uchun IP-manzilingiz', 'Your IP address for connection')}</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#1d4ed8', fontFamily: 'Consolas, monospace' }}>
                {ipInfo.ip} <span style={{ fontSize: 14, fontWeight: 600, color: '#64748b' }}>({t('Порт', 'Port', 'Port')}: {ipInfo.port})</span>
              </div>
            </div>
          </div>

          <div style={{ fontSize: 14, fontWeight: 600, color: '#1e293b', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: '#059669', display: 'flex' }}><SmartphoneIcon /></span>
            {t('Подключено терминалов', 'Ulangan terminallar', 'Connected terminals')}: {online.length}
          </div>

          <div style={{ maxHeight: 260, overflowY: 'auto', marginRight: -6, paddingRight: 6 }}>
            {net.terminals.map(tm => (
              <div key={tm.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderRadius: 10, border: '1px solid #e2e8f0', marginBottom: 8, background: tm.connected ? '#f0fdf4' : '#fef2f2' }}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: tm.connected ? '#22c55e' : '#ef4444', flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tm.name}</div>
                  <div style={{ fontSize: 12, color: '#64748b' }}>
                    {tm.connected
                      ? t('В сети', 'Tarmoqda', 'Online') + ' · ' + fmtTime(tm.connectedAt)
                      : t('Не в сети', 'Tarmoqda emas', 'Offline') + ' · ' + t('Связь потеряна в', 'Aloqa uzildi', 'Connection lost at') + ' ' + fmtTime(tm.lostAt)}
                  </div>
                </div>
                {tm.ip && tm.ip !== '::1' && tm.ip !== '::ffff:127.0.0.1' && (
                  <span style={{ fontSize: 12, color: '#94a3b8', fontFamily: 'Consolas, monospace' }}>{tm.ip}</span>
                )}
                <button
                  onClick={() => handleKick(tm.id)}
                  style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid #fecaca', background: '#fff', color: '#dc2626', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                >
                  {t('Отключить', 'Uzish', 'Disconnect')}
                </button>
              </div>
            ))}
          </div>

          {net.terminals.length === 0 && (
            <div style={{ padding: '102px 20px', textAlign: 'center', borderRadius: 10, border: '1px dashed #cbd5e1', color: '#94a3b8', fontSize: 14 }}>
              {t('Список пуст. Официанты подключаются через «Подключиться» на своих терминалах.', 'Ro\'yxat bo\'sh. Ofitsiantlar o\'z terminallarida «Ulanish» orqali ulanadi.', 'List is empty. Waiters connect via "Connect" on their terminals.')}
            </div>
          )}

          {offline.length > 0 && (
            <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 10 }}>
              {t('Офлайн', 'Oflayn', 'Offline')}: {offline.length}
            </div>
          )}

          <div style={{ marginTop: 16 }}>
            <button
              onClick={handleReset}
              disabled={busy}
              style={{ padding: '10px 22px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
            >
              {t('Сбросить режим кассы', 'Kassa rejimini qaytarish', 'Reset cash register mode')}
            </button>
          </div>
        </div>
      )}

      {net.role === 'slave' && (
        <div>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center', padding: '14px 18px', borderRadius: 10, marginBottom: 14, flexWrap: 'wrap',
            background: net.connection === 'connected' ? '#f0fdf4' : '#fef2f2', border: `1px solid ${net.connection === 'connected' ? '#bbf7d0' : '#fecaca'}` }}>
            <span style={{ width: 12, height: 12, borderRadius: '50%', background: net.connection === 'connected' ? '#22c55e' : '#ef4444', flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: 13, color: '#475569', fontWeight: 500 }}>{t('Подключено к кассе', 'Kassaga ulangan', 'Connected to cash register')}</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#1e293b', fontFamily: 'Consolas, monospace' }}>{net.masterIp}</div>
            </div>
            <div style={{ marginLeft: 'auto', fontSize: 13, fontWeight: 600, color: net.connection === 'connected' ? '#16a34a' : '#dc2626' }}>
              {net.connection === 'connected'
                ? t('В сети', 'Tarmoqda', 'Online')
                : net.connection === 'kicked'
                  ? t('Отключено администратором', 'Administrator tomonidan uzildi', 'Disconnected by administrator')
                  : net.connection === 'connecting'
                    ? t('Подключение...', 'Ulanmoqda...', 'Connecting...')
                    : t('Нет связи — переподключение...', 'Aloqa yo\'q — qayta ulanmoqda...', 'No connection — reconnecting...')}
            </div>
          </div>
          <button
            onClick={handleReset}
            disabled={busy}
            style={{ padding: '10px 22px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
          >
            {t('Отключиться от кассы', 'Kassadan uzilish', 'Disconnect from cash register')}
          </button>
        </div>
      )}

      {modalOpen && (
        <div className="modal-overlay" onClick={() => setModalOpen(false)}>
          <div className="modal-content" style={{ width: 420, maxWidth: 'calc(100vw - 24px)' }} onClick={e => e.stopPropagation()}>
            <div className="modal-title">{t('Введите IP-адрес Главной кассы', 'Bosh kassaning IP-manzilini kiriting', 'Enter main cash register IP address')}</div>
            <div style={{ fontSize: 13, color: '#64748b', marginBottom: 14 }}>
              {t('Посмотрите на экране кассы адрес в разделе «Сеть терминалов» (например 192.168.1.100).', 'Kassa ekranida «Terminallar tarmog\'i» bo\'limidagi manzilga qarang (masalan 192.168.1.100).', 'Check the cash register screen for the address in the "Terminal network" section (e.g., 192.168.1.100).')}
            </div>
            <input
              className="modal-input"
              style={{ fontFamily: 'Consolas, monospace', fontSize: 18, letterSpacing: 1 }}
              placeholder="192.168.1.100"
              value={ipInput}
              onChange={e => { setIpInput(e.target.value); setError('') }}
              autoFocus
              onKeyDown={e => { if (e.key === 'Enter') handleConnect() }}
            />
            {error && <div style={{ color: '#ef4444', fontSize: 13, marginTop: 10 }}>{error}</div>}
            <div className="modal-actions">
              <button className="modal-btn cancel" onClick={() => setModalOpen(false)} disabled={busy}>{t('Отмена', 'Bekor qilish', 'Cancel')}</button>
              <button className="modal-btn" style={{ background: '#059669', color: '#fff', border: 'none' }} onClick={handleConnect} disabled={busy}>
                {busy ? t('Сохранение...', 'Saqlanmoqda...', 'Saving...') : t('Подключиться', 'Ulanish', 'Connect')}
              </button>
            </div>
          </div>
        </div>
      )}
      {isNativeMobile() && net.role === 'slave' && error && <div className="pin-error">{error}</div>}
    </div>
  )
}
