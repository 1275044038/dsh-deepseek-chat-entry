import test from 'node:test'
import assert from 'node:assert/strict'
import {
  CHAT_ENTRY_DESCRIPTORS, CHAT_ENTRY_HOST_CONTRIBUTION, CHAT_ENTRY_REMOTE_CONTRIBUTION,
  WEBSITE_SESSION_ORIGIN, authorizationSchema, clientMetadataSchema, websiteSessionSchema,
} from '../src/protocol.js'

const metadata = { version: '0.1.0', locale: 'zh-CN', timezoneOffsetSeconds: -28_800 }
const session = {
  token: 'website-token-1', userId: 'website-user-1',
  deviceId: '0b9d1c4e-2f3a-4b5c-8d9e-1a2b3c4d5e6f',
}

test('client metadata schema is strict and bounded', () => {
  assert.deepEqual(clientMetadataSchema.parse(metadata), metadata)
  assert.equal(clientMetadataSchema.safeParse({ ...metadata, extra: 1 }).success, false)
  assert.equal(clientMetadataSchema.safeParse({ ...metadata, timezoneOffsetSeconds: 90_000 }).success, false)
  assert.equal(clientMetadataSchema.safeParse({ ...metadata, version: '' }).success, false)
})

test('authorization schema accepts the four statuses and rejects extras', () => {
  const state = { status: 'authorized', accountId: 'chat-profile:x', epoch: 'epoch-1', error: null }
  assert.deepEqual(authorizationSchema.parse(state), state)
  assert.equal(authorizationSchema.safeParse({ ...state, status: 'signed-in' }).success, false)
  assert.equal(authorizationSchema.safeParse({ ...state, extra: true }).success, false)
  assert.equal(authorizationSchema.safeParse({ ...state, error: 'x'.repeat(101) }).success, false)
})

test('website session schema enforces the three fixed fields', () => {
  assert.equal(WEBSITE_SESSION_ORIGIN, 'https://chat.deepseek.com')
  assert.deepEqual(websiteSessionSchema.parse(session), session)
  assert.equal(websiteSessionSchema.safeParse({ ...session, cookie: 'a' }).success, false)
  assert.equal(websiteSessionSchema.safeParse({ ...session, deviceId: 'not-a-uuid' }).success, false)
  assert.equal(websiteSessionSchema.safeParse({ ...session, token: '' }).success, false)
  assert.equal(websiteSessionSchema.safeParse({ ...session, token: 'x'.repeat(16_385) }).success, false)
})

test('descriptors use the entry package, service key and strict codecs', () => {
  assert.equal(CHAT_ENTRY_DESCRIPTORS.length, 5)
  const byMethod = new Map(CHAT_ENTRY_DESCRIPTORS.map(d => [d.method, d]))
  assert.deepEqual([...byMethod.keys()].sort(), [
    'authorization', 'clearWebsiteSession', 'loadWebsiteSession', 'saveWebsiteSession', 'watchAuthorization',
  ])
  for (const d of CHAT_ENTRY_DESCRIPTORS) {
    assert.equal(d.id, `dsh-deepseek-chat-entry#dshDeepseekChatEntry/${d.method}`)
    assert.equal(d.service, 'dshDeepseekChatEntry')
    assert.equal(d.namespace, 'dshDeepseekChatEntry')
    assert.deepEqual(d.invocation, { kind: 'direct' })
    assert.deepEqual(d.cancellation, { parameter: 'signal' })
    assert.equal(d.result.mode, 'strict')
    assert.ok(d.result.typeSymbol.startsWith('dsh-deepseek-chat-entry#'))
    assert.equal(typeof d.result.create, 'function')
  }
  assert.equal(byMethod.get('watchAuthorization')?.mode, 'stream')
  assert.equal(byMethod.get('authorization')?.mode, undefined)
  assert.deepEqual(byMethod.get('authorization')?.parameters.map(p => p.name), ['metadata'])
  assert.deepEqual(byMethod.get('loadWebsiteSession')?.parameters.map(p => p.name), ['metadata', 'epoch'])
  assert.deepEqual(byMethod.get('saveWebsiteSession')?.parameters.map(p => p.name), ['metadata', 'epoch', 'session'])
  assert.deepEqual(byMethod.get('clearWebsiteSession')?.parameters.map(p => p.name), ['metadata', 'epoch'])
  assert.equal(byMethod.get('loadWebsiteSession')?.result.typeSymbol, 'dsh-deepseek-chat-entry#OptionalWebsiteSession')
  assert.equal(byMethod.get('saveWebsiteSession')?.result.typeSymbol, 'dsh-deepseek-chat-entry#WebsiteSessionOperationResult')
  for (const p of byMethod.get('saveWebsiteSession')!.parameters) {
    assert.equal(p.source, 'json')
    assert.equal(p.codec.mode, 'strict')
  }
})

test('contributions never expose website credentials to the model', () => {
  assert.equal(CHAT_ENTRY_REMOTE_CONTRIBUTION.package, 'dsh-deepseek-chat-entry')
  assert.equal(CHAT_ENTRY_REMOTE_CONTRIBUTION.descriptors, CHAT_ENTRY_DESCRIPTORS)
  assert.equal(CHAT_ENTRY_HOST_CONTRIBUTION.package, 'dsh-deepseek-chat-entry')
  assert.equal(CHAT_ENTRY_HOST_CONTRIBUTION.face, 'host')
  assert.deepEqual(CHAT_ENTRY_HOST_CONTRIBUTION.schemas, [])
  assert.deepEqual(CHAT_ENTRY_HOST_CONTRIBUTION.model, { services: [], events: [], objects: [] })
  assert.equal(CHAT_ENTRY_HOST_CONTRIBUTION.invocations, CHAT_ENTRY_DESCRIPTORS)
})
