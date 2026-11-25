import type {
  CandidateRequest,
  ClientSessionContext,
  InputTriggerCandidate,
  InputTriggerPick,
  InputTriggerSource,
  PickOutcome,
} from '@deepseek-ai/dsh-client-ui-input-trigger/client'
import type { WebsiteConversation } from './protocol.js'

/** Unique @-source key. The group title row is hidden; candidates carry a
 * localized section heading instead, so no shared-locale registration is needed. */
export const CHAT_REFERENCE_SOURCE = 'deepseek-chat'

export interface ChatReferenceOps {
  /** Recent official conversations (already bounded by the Host). */
  list(signal: AbortSignal): Promise<readonly WebsiteConversation[]>
  /** Summarize one conversation with the current session model; throws to block send. */
  summarize(sessionId: string, conversationId: string, signal: AbortSignal): Promise<string>
  translate(text: string): string
}

interface CandidatePayload { c: string; t: string }
interface ReferencePayload { s: string; c: string; t: string }

function decodeCandidate(value: string | undefined): CandidatePayload | null {
  if (!value) return null
  try {
    const parsed = JSON.parse(value) as Partial<CandidatePayload>
    if (typeof parsed.c !== 'string' || parsed.c.length === 0) return null
    return { c: parsed.c, t: typeof parsed.t === 'string' ? parsed.t : '' }
  } catch { return null }
}

function decodeReference(ref: string): ReferencePayload | null {
  try {
    const parsed = JSON.parse(ref) as Partial<ReferencePayload>
    if (typeof parsed.s !== 'string' || parsed.s.length === 0) return null
    if (typeof parsed.c !== 'string' || parsed.c.length === 0) return null
    return { s: parsed.s, c: parsed.c, t: typeof parsed.t === 'string' ? parsed.t : '' }
  } catch { return null }
}

function formatUpdatedAt(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return ''
  try {
    return new Date(ms).toLocaleString(undefined, {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    })
  } catch { return '' }
}

/** Build the @-reference source. Pure data + callbacks; all RPC lives in ops. */
export function createChatReferenceSource(ops: ChatReferenceOps): InputTriggerSource {
  const section = () => ops.translate('DeepSeek 对话')
  const mention = (title: string): string => `@${section()}「${title}」`
  return {
    trigger: '@',
    name: CHAT_REFERENCE_SOURCE,
    order: 60,
    showGroupTitle: false,
    async candidates(_session: ClientSessionContext, req: CandidateRequest): Promise<readonly InputTriggerCandidate[]> {
      let rows: readonly WebsiteConversation[]
      try { rows = await ops.list(req.signal) }
      catch { return [] }
      if (req.signal.aborted) return []
      const query = req.query.trim().toLowerCase()
      const heading = section()
      const out: InputTriggerCandidate[] = []
      for (const row of rows) {
        const title = row.title || row.id
        if (query && !title.toLowerCase().includes(query) && !row.id.toLowerCase().includes(query)) continue
        out.push({
          name: title,
          label: title,
          icon: 'session',
          description: formatUpdatedAt(row.updatedAt),
          section: heading,
          value: JSON.stringify({ c: row.id, t: row.title } satisfies CandidatePayload),
        })
      }
      return out
    },
    onPick(pick: InputTriggerPick): PickOutcome {
      if (pick.action !== 'pick') return undefined
      const payload = decodeCandidate(pick.candidate.value)
      if (!payload) return undefined
      const sessionId = String(pick.session.sessionId)
      const title = payload.t || payload.c
      const ref = JSON.stringify({ s: sessionId, c: payload.c, t: payload.t } satisfies ReferencePayload)
      return {
        insert: {
          source: CHAT_REFERENCE_SOURCE,
          ref,
          label: title,
          appearance: 'session',
          clipboardText: mention(title),
        },
      }
    },
    codec: {
      clipboardText(ref: string): string {
        const payload = decodeReference(ref)
        return payload ? mention(payload.t || payload.c) : ref
      },
      async serialize(ref: string, signal: AbortSignal): Promise<string> {
        const payload = decodeReference(ref)
        if (!payload) throw new Error(ops.translate('无效的官网对话引用。'))
        // A summarize failure rejects, which blocks the send (never a silent
        // downgrade to the clipboard text).
        return ops.summarize(payload.s, payload.c, signal)
      },
    },
  }
}
