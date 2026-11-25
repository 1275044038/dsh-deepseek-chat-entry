import type { WebsiteSession, WebsiteConversation, ChatEntryClientMetadata } from './protocol.js'

export const WEBSITE_API_ORIGIN = 'https://chat.deepseek.com'
const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

export interface WebsiteMessage { role: 'USER' | 'ASSISTANT'; text: string }
export type WebsiteApiErrorCode = 'token-expired' | 'unauthorized' | 'network' | 'shape' | 'empty'
export class WebsiteApiError extends Error {
  constructor(message: string, readonly code: WebsiteApiErrorCode) { super(message); this.name = 'WebsiteApiError' }
}
export interface FetchResponse { ok: boolean; status: number; json(): Promise<unknown>; text(): Promise<string> }
export type FetchLike = (url: string, init: { headers: Record<string, string>; signal: AbortSignal }) => Promise<FetchResponse>

function toMillis(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n) || n <= 0) return 0
  return n < 1e12 ? Math.round(n * 1000) : Math.round(n)
}

export function websiteHeaders(session: WebsiteSession, metadata: ChatEntryClientMetadata): Record<string, string> {
  return {
    'Authorization': `Bearer ${session.token}`,
    'x-device-id': session.deviceId,
    'x-client-platform': 'web',
    'x-client-version': '2.0.0',
    'x-client-locale': metadata.locale.startsWith('zh') ? 'zh_CN' : 'en_US',
    'x-client-timezone-offset': String(metadata.timezoneOffsetSeconds),
    'Accept': 'application/json',
    'User-Agent': BROWSER_UA,
    'Referer': WEBSITE_API_ORIGIN + '/',
    'Origin': WEBSITE_API_ORIGIN,
  }
}

async function callApi(
  path: string, query: Record<string, string>, session: WebsiteSession,
  metadata: ChatEntryClientMetadata, signal: AbortSignal, fetchImpl: FetchLike,
): Promise<unknown> {
  const url = new URL(path, WEBSITE_API_ORIGIN)
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v)
  let res: FetchResponse
  try { res = await fetchImpl(url.toString(), { headers: websiteHeaders(session, metadata), signal }) }
  catch { throw new WebsiteApiError('无法连接 DeepSeek 官网，请检查网络。', 'network') }
  if (res.status === 401 || res.status === 403) throw new WebsiteApiError('官网登录已失效，请打开 DeepSeek 聊天面板重新登录。', 'unauthorized')
  let body: unknown
  try { body = await res.json() }
  catch { throw new WebsiteApiError('官网返回了无法解析的响应，请稍后重试。', 'shape') }
  const envelope = body as { code?: number; msg?: string; data?: { biz_code?: number; biz_data?: unknown } | null }
  if (envelope.code === 40003) throw new WebsiteApiError('官网登录已过期，请打开 DeepSeek 聊天面板刷新登录。', 'token-expired')
  if (envelope.code !== 0 || !envelope.data || envelope.data.biz_code !== 0) {
    throw new WebsiteApiError('官网接口返回错误，请稍后重试。', 'shape')
  }
  return envelope.data.biz_data
}

export async function listWebsiteConversations(
  session: WebsiteSession, metadata: ChatEntryClientMetadata, signal: AbortSignal,
  fetchImpl: FetchLike = globalThis.fetch as FetchLike,
): Promise<WebsiteConversation[]> {
  const data = await callApi('/api/v0/chat_session/fetch_page', { count: '50', mode: 'lte' }, session, metadata, signal, fetchImpl) as { chat_sessions?: unknown }
  const rows = Array.isArray(data?.chat_sessions) ? data.chat_sessions : []
  const out: WebsiteConversation[] = []
  for (const row of rows) {
    const r = row as { id?: unknown; title?: unknown; updated_at?: unknown }
    if (typeof r.id !== 'string' || r.id.length === 0) continue
    out.push({
      id: r.id.slice(0, 512),
      title: (typeof r.title === 'string' && r.title.trim() ? r.title.trim() : '未命名对话').slice(0, 2000),
      updatedAt: toMillis(r.updated_at),
    })
    if (out.length >= 50) break
  }
  return out
}

export async function fetchWebsiteConversation(
  session: WebsiteSession, conversationId: string, metadata: ChatEntryClientMetadata, signal: AbortSignal,
  fetchImpl: FetchLike = globalThis.fetch as FetchLike,
): Promise<WebsiteMessage[]> {
  const data = await callApi('/api/v0/chat/history_messages', { chat_session_id: conversationId }, session, metadata, signal, fetchImpl) as { chat_messages?: unknown }
  const rows = Array.isArray(data?.chat_messages) ? data.chat_messages : []
  const messages: WebsiteMessage[] = []
  for (const row of rows) {
    const r = row as { role?: unknown; fragments?: unknown }
    const role = r.role === 'USER' ? 'USER' : r.role === 'ASSISTANT' ? 'ASSISTANT' : null
    if (!role) continue
    const fragments = Array.isArray(r.fragments) ? r.fragments : []
    const text = fragments.map(f => {
      const c = (f as { content?: unknown }).content
      return typeof c === 'string' ? c : ''
    }).join('').trim()
    if (text) messages.push({ role, text })
  }
  if (messages.length === 0) throw new WebsiteApiError('该对话没有可读取的内容。', 'empty')
  return messages
}

export function renderTranscript(messages: WebsiteMessage[], maxBytes: number): string {
  const lines = messages.map(m => `${m.role === 'USER' ? '用户' : '助手'}：${m.text}`)
  const kept: string[] = []
  let bytes = 0
  for (let i = lines.length - 1; i >= 0; i--) {
    const lineBytes = Buffer.byteLength(lines[i], 'utf8') + 1
    if (bytes + lineBytes > maxBytes && kept.length > 0) break
    kept.unshift(lines[i])
    bytes += lineBytes
  }
  const truncated = kept.length < lines.length
  const body = kept.join('\n')
  return truncated ? `（前文已省略）\n${body}` : body
}
