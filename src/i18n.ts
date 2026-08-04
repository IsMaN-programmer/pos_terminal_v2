import { useSyncExternalStore, useCallback } from 'react'

export const LANG_KEY = 'pos_v2_language'
export type Lang = 'ru' | 'uz'

const listeners = new Set<() => void>()

let cachedLang: Lang = (() => {
  try {
    return localStorage.getItem(LANG_KEY) === 'uz' ? 'uz' : 'ru'
  } catch {
    return 'ru'
  }
})()

export function getLang(): Lang {
  return cachedLang
}

export function setLang(lang: Lang) {
  cachedLang = lang
  try { localStorage.setItem(LANG_KEY, lang) } catch {}
  listeners.forEach(l => l())
}

function subscribe(callback: () => void) {
  listeners.add(callback)
  return () => { listeners.delete(callback) }
}

function getSnapshot(): Lang {
  return cachedLang
}

/** Non-React / sync translation: works anywhere (receipts, services). */
export function isUz(): boolean {
  return cachedLang === 'uz'
}

/** Non-React / sync translation helper. */
export function tr(ru: string, uz: string): string {
  return cachedLang === 'uz' ? uz : ru
}

/** Locale string for date/number formatting. */
export function locale(): string {
  return cachedLang === 'uz' ? 'uz-UZ' : 'ru-RU'
}

/**
 * React hook that returns a translate function bound to the current language.
 * Re-renders the component whenever the language changes.
 */
export function useT(): (ru: string, uz: string) => string {
  const lang = useSyncExternalStore(subscribe, getSnapshot)
  return useCallback((ru: string, uz: string) => (lang === 'uz' ? uz : ru), [lang])
}