import { useSyncExternalStore, useCallback } from 'react'
import { dataStore } from './services/dataStore'

export const LANG_KEY = 'pos_v2_language'
export type Lang = 'ru' | 'uz' | 'en'

const listeners = new Set<() => void>()

let cachedLang: Lang = (() => {
  try {
    const v = dataStore.getItem(LANG_KEY)
    if (v === 'uz') return 'uz'
    if (v === 'en') return 'en'
    return 'ru'
  } catch {
    return 'ru'
  }
})()

export function getLang(): Lang {
  return cachedLang
}

export function setLang(lang: Lang) {
  cachedLang = lang
  try { dataStore.setItem(LANG_KEY, lang) } catch {}
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

export function isEn(): boolean {
  return cachedLang === 'en'
}

/** Non-React / sync translation helper. */
export function tr(ru: string, uz: string, en?: string): string {
  if (cachedLang === 'uz') return uz
  if (cachedLang === 'en') return en ?? ru
  return ru
}

/** Locale string for date/number formatting. */
export function locale(): string {
  if (cachedLang === 'uz') return 'uz-UZ'
  if (cachedLang === 'en') return 'en-US'
  return 'ru-RU'
}

/**
 * React hook that returns a translate function bound to the current language.
 * Re-renders the component whenever the language changes.
 */
export function useT(): (ru: string, uz: string, en?: string) => string {
  const lang = useSyncExternalStore(subscribe, getSnapshot)
  return useCallback((ru: string, uz: string, en?: string) => {
    if (lang === 'uz') return uz
    if (lang === 'en') return en ?? ru
    return ru
  }, [lang])
}