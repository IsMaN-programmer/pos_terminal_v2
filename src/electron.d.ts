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
    }
  }

  interface UpdateState {
    status: 'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error'
    version: string
    isRequired: boolean
    releaseNotes: string
    percent: number
    error: string
    available: boolean
  }
}
