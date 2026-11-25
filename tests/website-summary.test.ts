import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveSessionRoute, summarizeTranscript, SUMMARY_MAX_OUTPUT_TOKENS } from '../src/website-summary.js'

function fakeCtx(route: { provider: string; model: string } | null, streamText = '这是摘要') {
  const calls: any[] = []
  const llm = {
    prepareCall: async (config: any) => {
      calls.push(config)
      return {
        config,
        stream: async function* () {
          yield { type: 'block-start', index: 0, blockType: 'text' }
          yield { type: 'text-delta', index: 0, text: streamText }
          yield { type: 'finish', reason: { kind: 'stop' } }
        },
      }
    },
  }
  const sessions = { list: () => [{ id: 's1' }] }
  const sessionProjections = {
    snapshot: () => ({ values: { modelSelection: route ? { lastUsed: route } : undefined } }),
  }
  const map: Record<string, unknown> = { llm, sessions, sessionProjections }
  const ctx = { get: (name: string) => map[name] } as any
  return { ctx, calls }
}
const signal = () => new AbortController().signal

test('resolveSessionRoute reads modelSelection.lastUsed', () => {
  const { ctx } = fakeCtx({ provider: 'deepseek', model: 'deepseek-chat' })
  assert.deepEqual(resolveSessionRoute(ctx, 's1'), { provider: 'deepseek', model: 'deepseek-chat' })
})

test('resolveSessionRoute returns null without route', () => {
  const { ctx } = fakeCtx(null)
  assert.equal(resolveSessionRoute(ctx, 's1'), null)
})

test('summarizeTranscript streams text and passes route + maxTokens', async () => {
  const { ctx, calls } = fakeCtx({ provider: 'deepseek', model: 'deepseek-chat' }, '摘要正文')
  const out = await summarizeTranscript(ctx, 's1', '用户：你好\n助手：hi', signal())
  assert.equal(out, '摘要正文')
  assert.equal(calls[0].provider, 'deepseek')
  assert.equal(calls[0].model, 'deepseek-chat')
  assert.equal(calls[0].maxTokens, SUMMARY_MAX_OUTPUT_TOKENS)
})

test('summarizeTranscript throws when no route', async () => {
  const { ctx } = fakeCtx(null)
  await assert.rejects(() => summarizeTranscript(ctx, 's1', 'x', signal()))
})

test('summarizeTranscript throws when llm service absent', async () => {
  const ctx = { get: () => undefined } as any
  await assert.rejects(() => summarizeTranscript(ctx, 's1', 'x', signal()))
})
