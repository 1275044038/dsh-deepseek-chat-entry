import assert from 'node:assert/strict'
import test from 'node:test'
import {
  listWebsiteConversations, fetchWebsiteConversation, renderTranscript,
  WebsiteApiError, type FetchLike,
} from '../src/website-api.js'
import type { WebsiteSession, ChatEntryClientMetadata } from '../src/protocol.js'

const session: WebsiteSession = { token: 'tok', userId: 'u', deviceId: '0b9d1c4e-2f3a-4b5c-8d9e-1a2b3c4d5e6f' }
const metadata: ChatEntryClientMetadata = { version: '0.1.0', locale: 'zh-CN', timezoneOffsetSeconds: -28800 }

function fakeFetch(body: unknown, status = 200): FetchLike {
  return async () => ({ ok: status < 400, status, json: async () => body, text: async () => JSON.stringify(body) })
}
const envelope = (biz_data: unknown, code = 0) => ({ code, msg: '', data: { biz_code: 0, biz_data } })
const signal = () => new AbortController().signal

test('list maps rows and normalizes updated_at seconds to ms', async () => {
  const fetchImpl = fakeFetch(envelope({ chat_sessions: [
    { id: 'a', title: '甲', updated_at: 1700000000 },
    { id: 'b', title: '', updated_at: 1700000000000 },
  ] }))
  const rows = await listWebsiteConversations(session, metadata, signal(), fetchImpl)
  assert.equal(rows.length, 2)
  assert.equal(rows[0].updatedAt, 1700000000000)
  assert.equal(rows[1].title, '未命名对话')
})

test('list throws token-expired on code 40003', async () => {
  const fetchImpl = fakeFetch({ code: 40003, msg: 'invalid', data: null })
  await assert.rejects(
    () => listWebsiteConversations(session, metadata, signal(), fetchImpl),
    (e: unknown) => e instanceof WebsiteApiError && e.code === 'token-expired',
  )
})

test('list throws network on fetch rejection', async () => {
  const fetchImpl: FetchLike = async () => { throw new Error('offline') }
  await assert.rejects(
    () => listWebsiteConversations(session, metadata, signal(), fetchImpl),
    (e: unknown) => e instanceof WebsiteApiError && e.code === 'network',
  )
})

test('fetch extracts USER/ASSISTANT fragment text', async () => {
  const fetchImpl = fakeFetch(envelope({ chat_messages: [
    { role: 'USER', fragments: [{ type: 'REQUEST', content: '你好' }] },
    { role: 'ASSISTANT', fragments: [{ type: 'RESPONSE', content: ' hi ' }] },
    { role: 'SYSTEM', fragments: [{ content: 'skip' }] },
  ] }))
  const msgs = await fetchWebsiteConversation(session, 'a', metadata, signal(), fetchImpl)
  assert.deepEqual(msgs, [{ role: 'USER', text: '你好' }, { role: 'ASSISTANT', text: 'hi' }])
})

test('fetch throws empty when no readable content', async () => {
  const fetchImpl = fakeFetch(envelope({ chat_messages: [] }))
  await assert.rejects(
    () => fetchWebsiteConversation(session, 'a', metadata, signal(), fetchImpl),
    (e: unknown) => e instanceof WebsiteApiError && e.code === 'empty',
  )
})

test('renderTranscript keeps tail within byte budget', () => {
  const msgs = [{ role: 'USER' as const, text: 'x'.repeat(100) }, { role: 'ASSISTANT' as const, text: 'y'.repeat(100) }]
  const out = renderTranscript(msgs, 150)
  assert.ok(Buffer.byteLength(out, 'utf8') <= 200)
  assert.ok(out.includes('y'))
})
