export {}

declare global {
  interface Window {
    electronAPI?: {
      isDesktop: boolean
      getUpdateState: () => Promise<UpdateState>
      checkForUpdates: () => Promise<UpdateState>
      downloadUpdate: () => Promise<UpdateState>
      quitAndInstall: () => Promise<boolean>
      onUpdateStatus: (cb: (s: UpdateState) => void) => () => void
      generatePdf: (html: string) => Promise<string>
      getNetworkConfig: () => Promise<{ role: string; masterIp: string; terminalName: string }>
      setSlaveMode: (masterIp: string) => Promise<{ ok: boolean; error?: string }>
      resetNetworkMode: () => Promise<{ ok: boolean }>
      restartApp: () => Promise<boolean>
      exitFullscreen: () => Promise<boolean>
    }
  }

  interface UpdateState {
    status: 'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error'
    version: string
    currentVersion: string
    isRequired: boolean
    releaseNotes: string
    percent: number
    error: string
    available: boolean
  }
}
