import test from 'node:test'
import assert from 'node:assert/strict'
import { createChatReferenceSource, CHAT_REFERENCE_SOURCE, type ChatReferenceOps } from '../src/chat-reference.js'
import type { WebsiteConversation } from '../src/protocol.js'
import type { InputTriggerCandidate, InputTriggerPick } from '@deepseek-ai/dsh-client-ui-input-trigger/client'

const rows: WebsiteConversation[] = [
  { id: 'conv-1', title: '插件设计讨论', updatedAt: 1735689600000 },
  { id: 'conv-2', title: '', updatedAt: 0 },
]
const session = { sessionId: 'session-fixture' as never }
const req = (query = '', signal = new AbortController().signal) => ({ query, position: 'leading' as const, drilled: false, signal })
const translate = (text: string) => text

function ops(overrides: Partial<ChatReferenceOps> = {}): ChatReferenceOps {
  return {
    list: async () => rows,
    summarize: async () => '摘要正文',
    translate,
    ...overrides,
  }
}
function pick(candidate: InputTriggerCandidate, action: 'pick' | 'drill' = 'pick'): InputTriggerPick {
  return { candidate, session, position: 'leading', via: 'menu', action, span: { start: 0, end: 1, draftRev: 0 } as never }
}

test('candidates carry a localized section heading, session icon and an opaque id payload', async () => {
  const source = createChatReferenceSource(ops())
  assert.equal(source.trigger, '@')
  assert.equal(source.name, CHAT_REFERENCE_SOURCE)
  assert.equal(source.showGroupTitle, false)
  const all = await source.candidates(session, req())
  assert.equal(all.length, 2)
  assert.equal(all[0].section, 'DeepSeek 对话')
  assert.equal(all[0].icon, 'session')
  assert.equal(all[0].label, '插件设计讨论')
  // an empty title falls back to the id so the row stays selectable
  assert.equal(all[1].name, 'conv-2')
  assert.deepEqual(JSON.parse(all[0].value!), { c: 'conv-1', t: '插件设计讨论' })
})

test('candidates filter by query against title and id', async () => {
  const source = createChatReferenceSource(ops())
  assert.equal((await source.candidates(session, req('设计'))).length, 1)
  assert.equal((await source.candidates(session, req('conv-2'))).length, 1)
  assert.equal((await source.candidates(session, req('不存在'))).length, 0)
})

test('a list failure or an aborted signal yields an empty menu', async () => {
  const failing = createChatReferenceSource(ops({ list: async () => { throw new Error('offline') } }))
  assert.deepEqual(await failing.candidates(session, req()), [])
  const controller = new AbortController(); controller.abort()
  const aborted = createChatReferenceSource(ops())
  assert.deepEqual(await aborted.candidates(session, req('', controller.signal)), [])
})

test('onPick inserts a session chip encoding session + conversation; drill is ignored', async () => {
  const source = createChatReferenceSource(ops())
  const [first] = await source.candidates(session, req())
  const outcome = source.onPick(pick(first))
  assert.ok(outcome && typeof outcome === 'object' && 'insert' in outcome)
  const insert = (outcome as { insert: { source: string; ref: string; label: string; appearance?: string; clipboardText: string } }).insert
  assert.equal(insert.source, CHAT_REFERENCE_SOURCE)
  assert.equal(insert.appearance, 'session')
  assert.equal(insert.label, '插件设计讨论')
  assert.equal(insert.clipboardText, '@DeepSeek 对话「插件设计讨论」')
  assert.deepEqual(JSON.parse(insert.ref), { s: 'session-fixture', c: 'conv-1', t: '插件设计讨论' })
  assert.equal(source.onPick(pick(first, 'drill')), undefined)
  assert.equal(source.onPick(pick({ name: 'x', value: 'bad' })), undefined)
})

test('codec.serialize forwards the encoded ids and rejects on failure or a bad ref', async () => {
  const calls: { s: string; c: string }[] = []
  const source = createChatReferenceSource(ops({
    summarize: async (s, c) => { calls.push({ s, c }); return '摘要正文' },
  }))
  const [first] = await source.candidates(session, req())
  const insert = (source.onPick(pick(first)) as { insert: { ref: string } }).insert
  assert.equal(await source.codec!.serialize(insert.ref, new AbortController().signal), '摘要正文')
  assert.deepEqual(calls, [{ s: 'session-fixture', c: 'conv-1' }])
  assert.equal(source.codec!.clipboardText(insert.ref), '@DeepSeek 对话「插件设计讨论」')
  await assert.rejects(() => source.codec!.serialize('not-json', new AbortController().signal))
  const failing = createChatReferenceSource(ops({ summarize: async () => { throw new Error('summary failed') } }))
  await assert.rejects(() => failing.codec!.serialize(insert.ref, new AbortController().signal), /summary failed/)
})
