declare module '@deepseek-ai/dsh-llm/types' {
  interface LlmRequestPurposeMap { 'deepseek-chat-summary': true }
}
import { createUserMessage, BlockAssembler } from '@deepseek-ai/dsh-llm'
import type { ContextFormed, GenerateOptions, Message } from '@deepseek-ai/dsh-llm'
declare module '@deepseek-ai/dsh-llm' {
  interface MessageSourceMap {
    'dsh-deepseek-chat-entry': { kind: 'dsh-deepseek-chat-entry' } & ContextFormed
  }
}

export const SUMMARY_MAX_INPUT_BYTES = 60_000
export const SUMMARY_MAX_OUTPUT_TOKENS = 600
export const SUMMARY_TIMEOUT_MS = 60_000

const SYSTEM_PROMPT = '你是对话摘要助手。请把下面这段用户与 DeepSeek 官网助手的对话压缩成简洁摘要，保留关键事实、决定、代码片段与待办事项，省略寒暄与重复。使用对话原本的语言输出。只输出摘要正文，不要额外解释。'

export interface SummaryRoute { provider: string; model: string }

interface SessionsLike { list(): { id: string }[] }
interface ProjectionsLike { snapshot(session: unknown, keys: string[]): { values: Record<string, unknown> } }
interface LlmLike {
  prepareCall(config: unknown, signal?: AbortSignal): Promise<{ config: unknown; stream(options: unknown): AsyncIterable<unknown> }>
}

export function resolveSessionRoute(ctx: { get(name: string): unknown }, sessionId: string): SummaryRoute | null {
  const sessions = ctx.get('sessions') as SessionsLike | undefined
  const projections = ctx.get('sessionProjections') as ProjectionsLike | undefined
  if (!sessions || !projections) return null
  const session = sessions.list().find(s => s.id === sessionId)
  if (!session) return null
  const snapshot = projections.snapshot(session, ['modelSelection'])
  const selection = snapshot.values.modelSelection as { next?: SummaryRoute; lastUsed?: SummaryRoute } | undefined
  const route = selection?.next ?? selection?.lastUsed
  return route && typeof route.provider === 'string' && typeof route.model === 'string'
    ? { provider: route.provider, model: route.model }
    : null
}

function withDeadline(signal: AbortSignal, ms: number): { signal: AbortSignal; dispose(): void } {
  const controller = new AbortController()
  const onAbort = () => controller.abort(signal.reason)
  if (signal.aborted) controller.abort(signal.reason)
  else signal.addEventListener('abort', onAbort, { once: true })
  const timer = setTimeout(() => controller.abort(new Error('DEEPSEEK_CHAT_SUMMARY_TIMEOUT')), ms)
  return {
    signal: controller.signal,
    dispose() { clearTimeout(timer); signal.removeEventListener('abort', onAbort) },
  }
}

export async function summarizeTranscript(
  ctx: { get(name: string): unknown }, sessionId: string, transcript: string, signal: AbortSignal,
): Promise<string> {
  const llm = ctx.get('llm') as LlmLike | undefined
  if (!llm) throw new Error('DSH 模型服务不可用。')
  const route = resolveSessionRoute(ctx, sessionId)
  if (!route) throw new Error('无法确定当前会话模型，请先在该会话发送一条消息。')
  const messages: Message[] = [createUserMessage({
    content: [{ type: 'text', text: transcript }],
    source: { kind: 'dsh-deepseek-chat-entry' },
  })]
  const callDeadline = withDeadline(signal, SUMMARY_TIMEOUT_MS)
  try {
    const call = await llm.prepareCall({ ...route, maxTokens: SUMMARY_MAX_OUTPUT_TOKENS }, callDeadline.signal)
    const options = {
      ...(call.config as object),
      messages,
      system: SYSTEM_PROMPT,
      sessionId: sessionId as GenerateOptions['sessionId'],
      purpose: 'deepseek-chat-summary',
      signal: callDeadline.signal,
    } as GenerateOptions
    const assembler = new BlockAssembler()
    for await (const chunk of call.stream(options)) {
      callDeadline.signal.throwIfAborted()
      assembler.push(chunk as never)
    }
    callDeadline.signal.throwIfAborted()
    const finish = assembler.finish
    if (finish.kind === 'error' || finish.kind === 'aborted') {
      throw new Error(finish.failure.message)
    }
    const text = assembler.blocks()
      .filter(b => b.type === 'text')
      .map(b => (b as { text: string }).text)
      .join('').trim()
    if (!text) throw new Error('模型未返回摘要。')
    return text
  } finally {
    callDeadline.dispose()
  }
}
