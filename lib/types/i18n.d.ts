export type ChatLanguage = 'en' | 'zh-CN';
/** Read the shell document language; unknown languages fall back to zh at translate(). */
export declare function readHostLanguage(doc: Document): ChatLanguage | null;
/** Translate plugin-owned display text; keep state values and user content intact. */
export declare function translate(language: ChatLanguage | null, source: string | null | undefined): string;
