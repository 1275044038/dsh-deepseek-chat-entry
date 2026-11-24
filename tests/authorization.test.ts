import test from 'node:test'
import assert from 'node:assert/strict'
import { AuthorizationAuthority, PROFILE_CONTEXT_UNAVAILABLE, WEBSITE_PROFILE_PREFIX } from '../src/authorization.js'
import type { AuthorizationState, ChatEntryClientMetadata } from '../src/protocol.js'

const metadata: ChatEntryClientMetadata = { version: '0.1.0', locale: 'zh-CN', timezoneOffsetSeconds: -28_800 }
const PROFILE_ID = WEBSITE_PROFILE_PREFIX + 'a'.repeat(64)

test('a profile-scoped authority starts authorized with a Host-issued epoch', () => {
  const authority = new AuthorizationAuthority(PROFILE_ID, () => 'epoch-1')
  const state = authority.getSnapshot()
  assert.equal(state.status, 'authorized')
  assert.equal(state.accountId, PROFILE_ID)
  assert.equal(state.epoch, 'epoch-1')
  assert.equal(state.error, null)
  assert.notEqual(authority.getSnapshot(), state) // snapshot is a copy
})

test('without a profile the authority is volatile and reports the fixed error', () => {
  const authority = new AuthorizationAuthority(null, () => 'epoch-v')
  const state = authority.getSnapshot()
  assert.equal(state.accountId, 'chat-volatile:epoch-v')
  assert.equal(state.error, PROFILE_CONTEXT_UNAVAILABLE)
  assert.equal(state.status, 'authorized')
})

test('subscribe observes dispose, which revokes with a fresh epoch', async () => {
  const authority = new AuthorizationAuthority(PROFILE_ID, (() => { let n = 0; return () => 'epoch-' + ++n })())
  let notifications = 0
  const unsubscribe = authority.subscribe(() => { notifications++ })
  authority.dispose()
  assert.equal(notifications, 1)
  const state = authority.getSnapshot()
  assert.equal(state.status, 'unauthorized')
  assert.equal(state.accountId, null)
  assert.equal(state.epoch, 'epoch-2')
  assert.equal(state.error, null)
  authority.dispose() // idempotent
  assert.equal(notifications, 1)
  unsubscribe()
  await assert.rejects(() => authority.refresh(metadata), /CHAT session service is disposed\./)
})

test('watch yields the current snapshot and ends on abort', async () => {
  const authority = new AuthorizationAuthority(PROFILE_ID, () => 'epoch-1')
  const controller = new AbortController()
  const iterator = authority.watch(metadata, controller.signal)[Symbol.asyncIterator]()
  const first = await iterator.next()
  assert.equal(first.done, false)
  assert.equal((first.value as AuthorizationState).epoch, 'epoch-1')
  controller.abort()
  const end = await iterator.next()
  assert.equal(end.done, true)
})

test('watch ends when the authority is disposed mid-stream', async () => {
  const authority = new AuthorizationAuthority(PROFILE_ID, () => 'epoch-1')
  const controller = new AbortController()
  const iterator = authority.watch(metadata, controller.signal)[Symbol.asyncIterator]()
  const first = await iterator.next()
  assert.equal(first.done, false)
  authority.dispose()
  const end = await iterator.next()
  assert.equal(end.done, true)
  controller.abort()
})

test('refresh resolves the current snapshot while open', async () => {
  const authority = new AuthorizationAuthority(PROFILE_ID, () => 'epoch-1')
  assert.deepEqual(await authority.refresh(metadata), authority.getSnapshot())
})

