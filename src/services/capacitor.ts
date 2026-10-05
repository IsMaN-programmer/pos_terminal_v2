import { Capacitor } from '@capacitor/core'

/** True when the web app runs inside the native Capacitor shell (Android APK). */
export function isNativeMobile(): boolean {
  try {
    return Capacitor.isNativePlatform()
  } catch {
    return false
  }
}

export function nativePlatform(): string {
  try {
    return Capacitor.getPlatform()
  } catch {
    return 'web'
  }
}
