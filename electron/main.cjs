const { app, BrowserWindow, ipcMain } = require('electron')
const { autoUpdater } = require('electron-updater')
const path = require('node:path')
const fs = require('node:fs')
const os = require('node:os')

const isDev = !app.isPackaged
const BACKEND_PORT = process.env.PORT || 5000
const BACKEND_URL = `http://127.0.0.1:${BACKEND_PORT}`

function configPath() {
  return app.isPackaged
    ? path.join(app.getPath('userData'), 'config.json')
    : path.join(__dirname, '..', 'backend', 'server', 'config.json')
}

function readConfig() {
  try {
    if (fs.existsSync(configPath())) {
      return JSON.parse(fs.readFileSync(configPath(), 'utf8'))
    }
  } catch {}
  return { role: 'neutral', masterIp: '' }
}

function writeConfig(patch) {
  const cfg = { ...readConfig(), ...patch }
  try {
    fs.mkdirSync(path.dirname(configPath()), { recursive: true })
    fs.writeFileSync(configPath(), JSON.stringify(cfg, null, 2))
  } catch (e) {
    console.error('Config write failed:', e)
  }
  return cfg
}

function restartApp() {
  app.relaunch()
  app.exit(0)
}

let mainWindow = null
let updateState = {
  status: 'idle',
  version: '',
  currentVersion: app.getVersion(),
  isRequired: false,
  releaseNotes: '',
  percent: 0,
  error: '',
  available: false,
}

function broadcast(patch) {
  updateState = { ...updateState, ...patch }
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('update:status', updateState)
  }
}

function stripHtml(html) {
  return String(html || '')
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .trim()
}

async function githubReleaseNotes(version) {
  try {
    const res = await fetch(`https://api.github.com/repos/IsMaN-programmer/pos_terminal_v2/releases/tags/v${version}`)
    if (res.ok) {
      const data = await res.json()
      return stripHtml(data.body || '')
    }
  } catch {}
  return ''
}

function setupAutoUpdater() {
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.setFeedURL({
    provider: 'github',
    owner: 'IsMaN-programmer',
    repo: 'pos_terminal_v2',
    private: false,
  })

  autoUpdater.on('checking-for-update', () => broadcast({ status: 'checking' }))

  autoUpdater.on('update-available', async (info) => {
    let notes = stripHtml(info?.releaseNotes || '')
    if (!notes) notes = await githubReleaseNotes(info?.version || '')
    const isRequired = /^\[REQUIRED\]/i.test(notes)
    broadcast({
      status: 'available',
      version: info?.version || '',
      releaseNotes: notes,
      isRequired,
      available: true,
      error: '',
    })
  })

  autoUpdater.on('update-not-available', () => broadcast({ status: 'not-available', available: false }))
  autoUpdater.on('download-progress', (p) => broadcast({ status: 'downloading', percent: Math.round(p?.percent || 0) }))
  autoUpdater.on('update-downloaded', (info) => broadcast({ status: 'downloaded', version: info?.version || '' }))
  autoUpdater.on('error', (err) => broadcast({ status: 'error', error: err?.message || String(err) }))
}

async function backendRunning() {
  try {
    const r = await fetch(`${BACKEND_URL}/api/internet-check`, { signal: AbortSignal.timeout(1500) })
    return r.ok
  } catch {
    return false
  }
}

async function ensureBackend() {
  if (await backendRunning()) return
  try {
    await import('../backend/server/index.js')
  } catch (e) {
    console.error('Backend start failed:', e)
  }
  const start = Date.now()
  while (Date.now() - start < 15000) {
    if (await backendRunning()) return
    await new Promise((r) => setTimeout(r, 300))
  }
}

async function createWindow() {
  const cfg = readConfig()
  const isSlave = cfg.role === 'slave' && cfg.masterIp

  await ensureBackend()

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    fullscreen: app.isPackaged,
    autoHideMenuBar: true,
    backgroundColor: '#ffffff',
    icon: path.join(__dirname, '..', 'public', 'logo.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  if (isSlave) {
    const masterUrl = `http://${cfg.masterIp}:${BACKEND_PORT}`
    mainWindow.webContents.on('did-fail-load', (_e, errorCode, errorDesc, validatedURL) => {
      if (errorCode === -3) return
      console.error(`Master load failed (${errorCode}): ${errorDesc}`)
      const html = buildFailPage(cfg.masterIp, errorDesc)
      mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
    })
    mainWindow.loadURL(masterUrl)
  } else {
    mainWindow.loadURL(BACKEND_URL)
  }
  mainWindow.on('closed', () => { mainWindow = null })
}

function buildFailPage(masterIp, errorDesc) {
  const esc = (s) => String(s || '').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8">
<style>
  body { margin: 0; font-family: 'Segoe UI', Arial, sans-serif; background: #f1f5f9; display: flex; align-items: center; justify-content: center; height: 100vh; }
  .card { background: #fff; border-radius: 16px; padding: 40px 48px; box-shadow: 0 8px 30px rgba(0,0,0,0.12); text-align: center; max-width: 440px; }
  .dot { width: 14px; height: 14px; border-radius: 50%; background: #ef4444; margin: 0 auto 16px; }
  h1 { font-size: 20px; color: #1e293b; margin: 0 0 8px; }
  p { font-size: 14px; color: #64748b; margin: 0 0 8px; }
  .ip { font-size: 15px; font-weight: 700; color: #2563eb; margin-bottom: 20px; }
  .btn { display: inline-block; margin: 6px; padding: 12px 28px; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; border: none; }
  .primary { background: #2563eb; color: #fff; }
  .ghost { background: #f1f5f9; color: #334155; }
</style>
</head>
<body>
  <div class="card">
    <div class="dot"></div>
    <h1>Нет связи с кассой</h1>
    <p>Не удалось подключиться к главной кассе</p>
    <div class="ip">${esc(masterIp)} : ${BACKEND_PORT}</div>
    <p style="font-size:12px;color:#94a3b8">${esc(errorDesc)}</p>
    <button class="btn primary" onclick="location.reload()">Повторить</button>
    <button class="btn ghost" id="resetBtn" style="display:none">Сбросить режим терминала</button>
  </div>
  <script>
    if (window.electronAPI && window.electronAPI.resetNetworkMode) {
      document.getElementById('resetBtn').style.display = 'inline-block'
      document.getElementById('resetBtn').onclick = async () => {
        await window.electronAPI.resetNetworkMode()
        if (window.electronAPI.restartApp) window.electronAPI.restartApp()
      }
    }
    setTimeout(function () { location.reload() }, 5000)
  <\/script>
</body>
</html>`
}

ipcMain.handle('network:get-config', () => {
  const cfg = readConfig()
  return {
    role: cfg.role || 'neutral',
    masterIp: cfg.masterIp || '',
    terminalName: os.hostname() || 'TERMINAL',
  }
})

ipcMain.handle('network:set-slave', (_e, masterIp) => {
  if (!masterIp || !/^(\d{1,3}\.){3}\d{1,3}$/.test(String(masterIp))) return { ok: false, error: 'Invalid IP' }
  writeConfig({ role: 'slave', masterIp: String(masterIp) })
  return { ok: true }
})

ipcMain.handle('network:reset', () => {
  writeConfig({ role: 'neutral', masterIp: '' })
  return { ok: true }
})

ipcMain.handle('app:restart', () => {
  restartApp()
  return true
})

ipcMain.handle('window:exit-fullscreen', () => {
  app.quit()
  return true
})

ipcMain.handle('update:get-state', () => updateState)
ipcMain.handle('update:check', async () => {
  if (!app.isPackaged) {
    broadcast({ status: 'not-available', available: false })
    return updateState
  }
  broadcast({ status: 'checking' })
  try {
    await autoUpdater.checkForUpdates()
  } catch (e) {
    broadcast({ status: 'error', error: e?.message || String(e) })
  }
  return updateState
})
ipcMain.handle('update:download', async () => {
  try {
    await autoUpdater.downloadUpdate()
  } catch (e) {
    broadcast({ status: 'error', error: e?.message || String(e) })
  }
  return updateState
})
ipcMain.handle('update:install', async () => {
  autoUpdater.quitAndInstall()
  return true
})

ipcMain.handle('pdf:generate', async (_event, html) => {
  const win = new BrowserWindow({
    show: false,
    width: 800,
    height: 1100,
    backgroundColor: '#ffffff',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })
  try {
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
    const pdf = await win.webContents.printToPDF({ printBackground: true, pageSize: 'A4' })
    return pdf.toString('base64')
  } finally {
    if (!win.isDestroyed()) win.destroy()
  }
})

app.whenReady().then(async () => {
  app.setAppUserModelId('uz.posvk.posterminal')
  setupAutoUpdater()
  await createWindow()

  if (app.isPackaged) {
    setTimeout(() => {
      autoUpdater.checkForUpdates().catch((e) => broadcast({ status: 'error', error: e?.message || String(e) }))
    }, 3000)
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
