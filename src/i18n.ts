import en from '../locale/en.json' with { type: 'json' }
import zh from '../locale/zh-CN.json' with { type: 'json' }

export type ChatLanguage = 'en' | 'zh-CN'

/** Read the shell document language; unknown languages fall back to zh at translate(). */
export function readHostLanguage(doc: Document): ChatLanguage | null {
  const lang = doc.documentElement.lang.toLowerCase()
  if (lang.startsWith('zh')) return 'zh-CN'
  if (lang.startsWith('en')) return 'en'
  return null
}

/** Translate plugin-owned display text; keep state values and user content intact. */
export function translate(language: ChatLanguage | null, source: string | null | undefined): string {
  if (!source) return ''
  const text = (language === 'en' ? en : zh).ui[source]
  return typeof text === 'string' ? text : source
}
