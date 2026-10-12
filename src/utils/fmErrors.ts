import { tr } from '../i18n'

// Human-readable translations of fiscal-module errors, so cashiers
// understand what happened (same idea as posvk_mobile fm_sw_messages).

function errText(err: unknown): string {
  if (typeof err === 'string') return err
  if (err instanceof Error) return `${err.message} ${(err as any)?.cause ? String((err as any).cause) : ''}`
  try {
    const s = JSON.stringify(err)
    return s === '{}' ? String(err) : s
  } catch {
    return String(err)
  }
}

/**
 * Returns a friendly message when the error means "a different fiscal
 * module is plugged in" (applet select fails with SW 6A82 =
 * SW_FILE_NOT_FOUND), otherwise null (caller shows the raw error).
 */
export function fmUserMessage(err: unknown): string | null {
  const text = errText(err)
  if (/6A82|SW_FILE_NOT_FOUND|applet select error/i.test(text)) {
    return tr(
      'Подключён другой фискальный модуль. Проверьте ФМ и попробуйте снова.',
      'Boshqa fiskal modul ulangan. FM ni tekshiring va qayta urinib ko‘ring.',
      'A different fiscal module is connected. Check the FM and try again.',
    )
  }
  return null
}
