import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { credentialKey, type CredentialRecord } from '@deepseek-ai/dsh-credentials'
import { AuthorizationAuthority, WEBSITE_PROFILE_PREFIX } from '../src/authorization.js'
import { WebsiteSessionStore } from '../src/website-session-store.js'
import type { WebsiteSession } from '../src/protocol.js'

const SESSION: WebsiteSession = {
  token: 'website-token-1', userId: 'website-user-1',
  deviceId: '0b9d1c4e-2f3a-4b5c-8d9e-1a2b3c4d5e6f',
}
const PROFILE_ID = WEBSITE_PROFILE_PREFIX + createHash('sha256').update('/profiles/chat-entry', 'utf8').digest('hex')
const EXPECTED_KEY = credentialKey('dsh-deepseek-chat-entry', 'website-' + PROFILE_ID.slice(WEBSITE_PROFILE_PREFIX.length))
const FENCE = { accountId: PROFILE_ID, epoch: 'epoch-1' }
const signal = new AbortController().signal

function memoryCredentials() {
  const records = new Map<string, CredentialRecord>()
  return {
    records,
    async readRecord(key: string): Promise<CredentialRecord | undefined> { return records.get(key) },
    async modifyRecord(
      key: string,
      mutate: (current: CredentialRecord | undefined) => Promise<CredentialRecord | undefined>,
    ): Promise<CredentialRecord | undefined> {
      const next = await mutate(records.get(key))
      if (next === undefined) return records.get(key)
      records.set(key, next)
      return next
    },
    async deleteRecord(key: string): Promise<void> { records.delete(key) },
  }
}
function scoped() {
  const creds = memoryCredentials()
  const authority = new AuthorizationAuthority(PROFILE_ID, () => 'epoch-1')
  return { creds, authority, store: new WebsiteSessionStore(creds, authority, PROFILE_ID) }
}
const grantPayload = (record: CredentialRecord | undefined) =>
  (record as { payload: { version: number; origin: string; profileId: string; websiteAccountId: string | null; session: WebsiteSession | null } }).payload

test('save derives the profile key and writes a version-2 grant; load roundtrips', async () => {
  const { creds, store } = scoped()
  assert.equal(await store.save(FENCE, SESSION, signal), true)
  const record = creds.records.get(EXPECTED_KEY)
  assert.equal(record?.kind, 'grant')
  assert.deepEqual(grantPayload(record), {
    version: 2, origin: 'https://chat.deepseek.com', profileId: PROFILE_ID,
    websiteAccountId: SESSION.userId, session: SESSION,
  })
  assert.deepEqual(await store.load(FENCE, signal), SESSION)
})

test('a volatile profile never touches the vault; clear only reports guest state', async () => {
  const creds = memoryCredentials()
  const authority = new AuthorizationAuthority(null, () => 'epoch-v')
  const store = new WebsiteSessionStore(creds, authority, null)
  const fence = { accountId: 'chat-volatile:epoch-v', epoch: 'epoch-v' }
  assert.equal(await store.save(fence, SESSION, signal), false)
  assert.equal(await store.load(fence, signal), null)
  assert.equal(await store.clear(fence, signal), true)
  assert.equal(creds.records.size, 0)
})

test('stale epoch, foreign account, abort and dispose all fence writes and reads', async () => {
  const { authority, store } = scoped()
  assert.equal(await store.save({ ...FENCE, epoch: 'stale' }, SESSION, signal), false)
  assert.equal(await store.save({ ...FENCE, accountId: WEBSITE_PROFILE_PREFIX + 'b'.repeat(64) }, SESSION, signal), false)
  const aborted = new AbortController()
  aborted.abort()
  assert.equal(await store.save(FENCE, SESSION, aborted.signal), false)
  assert.equal(await store.load(FENCE, aborted.signal), null)
  authority.dispose()
  assert.equal(await store.save(FENCE, SESSION, signal), false)
  assert.equal(await store.load(FENCE, signal), null)
})

test('load rejects grants of another profile or a mismatched website account', async () => {
  const { creds, store } = scoped()
  const base = { version: 2, origin: 'https://chat.deepseek.com', websiteAccountId: SESSION.userId, session: SESSION }
  creds.records.set(EXPECTED_KEY, { kind: 'grant', payload: { ...base, profileId: WEBSITE_PROFILE_PREFIX + 'c'.repeat(64) } })
  assert.equal(await store.load(FENCE, signal), null)
  creds.records.set(EXPECTED_KEY, { kind: 'grant', payload: { ...base, profileId: PROFILE_ID, websiteAccountId: 'someone-else' } })
  assert.equal(await store.load(FENCE, signal), null)
  creds.records.set(EXPECTED_KEY, { kind: 'api-key', key: 'not-a-grant' })
  assert.equal(await store.load(FENCE, signal), null)
})

test('clear writes a durable empty grant, then the barrier lifts for new saves', async () => {
  const { creds, store } = scoped()
  await store.save(FENCE, SESSION, signal)
  assert.equal(await store.clear(FENCE, signal), true)
  const record = creds.records.get(EXPECTED_KEY)
  assert.equal(record?.kind, 'grant') // empty grant, not a deletion
  assert.equal(grantPayload(record).session, null)
  assert.equal(grantPayload(record).websiteAccountId, null)
  assert.equal(await store.load(FENCE, signal), null)
  assert.equal(await store.save(FENCE, SESSION, signal), true)
})

test('a revision captured before clear fences late saves and loads', async () => {
  const { store } = scoped()
  const revision = store.captureRevision()
  await store.clear(FENCE, signal)
  assert.equal(await store.save(FENCE, SESSION, signal, revision), false)
  assert.equal(await store.load(FENCE, signal, revision), null)
})

test('clear barrier synchronously declines an in-flight late save', async () => {
  const { creds, store } = scoped()
  let enterSave!: () => void
  const saveEntered = new Promise<void>(resolve => { enterSave = resolve })
  let releaseSave!: () => void
  const saveGate = new Promise<void>(resolve => { releaseSave = resolve })
  const originalModify = creds.modifyRecord.bind(creds)
  let first = true
  creds.modifyRecord = async (key, mutate) => {
    if (first) { first = false; enterSave(); await saveGate }
    return originalModify(key, mutate)
  }
  const savePromise = store.save(FENCE, SESSION, signal)
  await saveEntered
  const clearPromise = store.clear(FENCE, signal) // clearing=true + writeRevision++ happen synchronously
  releaseSave()
  assert.equal(await savePromise, false)
  assert.equal(await clearPromise, true)
  assert.equal(grantPayload(creds.records.get(EXPECTED_KEY)).session, null)
})

test('vault failures surface the fixed Chinese error messages', async () => {
  const { creds, store } = scoped()
  creds.readRecord = async () => { throw new Error('vault down') }
  await assert.rejects(() => store.load(FENCE, signal), /无法读取 CHAT 登录。/)
  creds.modifyRecord = async () => { throw new Error('vault down') }
  await assert.rejects(() => store.save(FENCE, SESSION, signal), /无法保存 CHAT 登录。/)
  await assert.rejects(() => store.clear(FENCE, signal), /无法清除 CHAT 登录。/)
  // clearing barrier must be lifted even after a failed clear
  const healthy = memoryCredentials()
  const authority = new AuthorizationAuthority(PROFILE_ID, () => 'epoch-1')
  const recovered = new WebsiteSessionStore(healthy, authority, PROFILE_ID)
  assert.equal(await recovered.save(FENCE, SESSION, signal), true)
})

test('a malformed profile id falls back to volatile behavior', async () => {
  const creds = memoryCredentials()
  const authority = new AuthorizationAuthority('chat-profile:not-hex', () => 'epoch-1')
  const store = new WebsiteSessionStore(creds, authority, 'chat-profile:not-hex')
  assert.equal(await store.save({ accountId: 'chat-profile:not-hex', epoch: 'epoch-1' }, SESSION, signal), false)
  assert.equal(creds.records.size, 0)
})
