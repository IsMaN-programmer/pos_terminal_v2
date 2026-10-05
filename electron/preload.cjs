const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  isDesktop: true,
  getUpdateState: () => ipcRenderer.invoke('update:get-state'),
  checkForUpdates: () => ipcRenderer.invoke('update:check'),
  downloadUpdate: () => ipcRenderer.invoke('update:download'),
  quitAndInstall: () => ipcRenderer.invoke('update:install'),
  onUpdateStatus: (callback) => {
    const listener = (_event, payload) => callback(payload)
    ipcRenderer.on('update:status', listener)
    return () => ipcRenderer.removeListener('update:status', listener)
  },
  generatePdf: (html) => ipcRenderer.invoke('pdf:generate', html),
  getNetworkConfig: () => ipcRenderer.invoke('network:get-config'),
  setSlaveMode: (masterIp) => ipcRenderer.invoke('network:set-slave', masterIp),
  resetNetworkMode: () => ipcRenderer.invoke('network:reset'),
  restartApp: () => ipcRenderer.invoke('app:restart'),
  exitFullscreen: () => ipcRenderer.invoke('window:exit-fullscreen'),
})
