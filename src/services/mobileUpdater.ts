import { tr } from '../i18n'
import { isNativeMobile } from './capacitor'

const GH_OWNER = 'IsMaN-programmer'
const GH_REPO = 'pos_terminal_v2'
const APK_MIME = 'application/vnd.android.package-archive'

export interface MobileUpdateInfo {
  version: string
  tag: string
  apkUrl: string
  apkName: string
  notes: string
  required: boolean
}

function normVersion(v: string): string {
  return (v || '').trim().replace(/^[vV]/, '')
}

/** Compare dot-separated versions. >0 if a>b, <0 if a<b, 0 if equal. */
export function compareVersions(a: string, b: string): number {
  const pa = normVersion(a).split('.').map(x => parseInt(x, 10) || 0)
  const pb = normVersion(b).split('.').map(x => parseInt(x, 10) || 0)
  const n = Math.max(pa.length, pb.length)
  for (let i = 0; i < n; i++) {
    const d = (pa[i] || 0) - (pb[i] || 0)
    if (d !== 0) return d > 0 ? 1 : -1
  }
  return 0
}

/** Version of the installed APK (build.gradle versionName). */
export async function getInstalledVersion(): Promise<string> {
  if (!isNativeMobile()) return ''
  try {
    const { App } = await import('@capacitor/app')
    const info = await App.getInfo()
    if (info.version) return normVersion(info.version)
  } catch { /* fall through */ }
  return ''
}

interface GhAsset {
  name: string
  browser_download_url: string
}

interface GhRelease {
  tag_name: string
  body?: string
  assets?: GhAsset[]
}

/**
 * Check the latest GitHub release for a newer .apk.
 * Returns null when up to date, offline, or not a native build.
 */
export async function checkForMobileUpdate(): Promise<MobileUpdateInfo | null> {
  if (!isNativeMobile()) return null
  const current = await getInstalledVersion()
  if (!current) return null
  let rel: GhRelease
  try {
    const res = await fetch(`https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/releases/latest`, {
      headers: { Accept: 'application/vnd.github+json' },
    })
    if (!res.ok) return null
    rel = await res.json()
  } catch {
    return null
  }
  const remote = normVersion(rel.tag_name || '')
  if (!remote || compareVersions(remote, current) <= 0) return null
  const apk = (rel.assets || []).find(a => a.name.toLowerCase().endsWith('.apk'))
  if (!apk) return null
  const notes = rel.body || ''
  return {
    version: remote,
    tag: rel.tag_name,
    apkUrl: apk.browser_download_url,
    apkName: apk.name,
    notes,
    required: /\[required\]/i.test(notes),
  }
}

export function mobileUpdateError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e || '')
  if (/network|fetch|failed/i.test(msg)) {
    return tr('Нет соединения. Проверьте интернет и попробуйте снова.', 'Aloqa yo‘q. Internetni tekshirib qayta urinib ko‘ring.', 'No connection. Check the internet and try again.')
  }
  return msg || tr('Не удалось скачать обновление', 'Yangilanishni yuklab bo‘lmadi', 'Failed to download the update')
}

function cordovaFileOpener(): any {
  const w = window as any
  const fo = w?.cordova?.plugins?.fileOpener2
  if (!fo) throw new Error(tr('Модуль установки недоступен', 'O‘rnatish moduli mavjud emas', 'Installer module unavailable'))
  return fo
}

/**
 * Download the APK (with progress) and open the system installer.
 * Mirrors the desktop flow: download → install/restart.
 */
export async function downloadAndInstallApk(
  info: MobileUpdateInfo,
  onProgress: (percent: number) => void,
): Promise<void> {
  const { Filesystem, Directory } = await import('@capacitor/filesystem')
  onProgress(0)
  const path = `updates/${info.apkName}`
  const progressListener = await Filesystem.addListener('progress', (p: { url?: string; bytes?: number; contentLength?: number }) => {
    if (p.url && !info.apkUrl.startsWith(p.url) && !p.url.startsWith(info.apkUrl)) return
    if (p.contentLength && p.contentLength > 0) {
      onProgress(Math.max(0, Math.min(100, Math.round(((p.bytes || 0) / p.contentLength) * 100))))
    }
  }).catch(() => null)
  try {
    try { await Filesystem.deleteFile({ path, directory: Directory.Cache }) } catch { /* first download */ }
    const result = await Filesystem.downloadFile(
      { url: info.apkUrl, path, directory: Directory.Cache, progress: true },
    )
    onProgress(100)
    const abs = result.path?.startsWith('file://') ? result.path : `file://${result.path}`
    const fo = cordovaFileOpener()
    await new Promise<void>((resolve, reject) => {
      fo.open(abs, APK_MIME, {
        success: () => resolve(),
        error: (err: any) => reject(new Error(err?.message || String(err || 'open failed'))),
      })
    })
  } catch (e) {
    try { await Filesystem.deleteFile({ path, directory: Directory.Cache }) } catch { /* ignore */ }
    throw e
  } finally {
    try { await progressListener?.remove() } catch { /* ignore */ }
  }
}
