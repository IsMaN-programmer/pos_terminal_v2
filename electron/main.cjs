const { app, BrowserWindow, ipcMain } = require('electron')
const { autoUpdater } = require('electron-updater')
const path = require('node:path')

const isDev = !app.isPackaged
const BACKEND_PORT = process.env.PORT || 5000
const BACKEND_URL = `http://127.0.0.1:${BACKEND_PORT}`

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
  await ensureBackend()
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
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
  mainWindow.loadURL(BACKEND_URL)
  mainWindow.on('closed', () => { mainWindow = null })
}

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
