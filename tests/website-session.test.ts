import test from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import {
  adaptWebsiteSession, parseWebsiteSession, websiteSessionCaptureScript,
  websiteSessionClearScript, websiteSessionRestoreScript, websiteSessionScript,
} from '../src/website-session.js'

const UUID = '0b9d1c4e-2f3a-4b5c-8d9e-1a2b3c4d5e6f'
const SESSION = { token: 'website-token-1', userId: 'website-user-1', deviceId: UUID }
const tokenRaw = JSON.stringify({ value: SESSION.token, __version: '0' })
const userRaw = JSON.stringify({ value: { id: SESSION.userId }, __version: '0' })

interface FakeOptions { origin?: string; initial?: Record<string, string>; failSet?: string; failRemove?: boolean }
function fakeDoc(options: FakeOptions = {}) {
  const store = new Map<string, string>(Object.entries(options.initial ?? {}))
  const localStorage = {
    getItem: (key: string): string | null => store.has(key) ? store.get(key)! : null,
    setItem: (key: string, value: string): void => {
      if (options.failSet === key) throw new Error('quota')
      store.set(key, value)
    },
    removeItem: (key: string): void => {
      if (options.failRemove) throw new Error('denied')
      store.delete(key)
    },
  }
  const doc = { defaultView: { location: { origin: options.origin ?? 'https://chat.deepseek.com' }, localStorage } }
  return { doc: doc as unknown as Document, store }
}
const full = { userToken: tokenRaw, __appKit_userInfo: userRaw, 'deepseek-device-id:chat': UUID }

test('capture returns the three-key session only when every value is valid', () => {
  const { doc } = fakeDoc({ initial: full })
  assert.deepEqual(adaptWebsiteSession(doc, { type: 'capture' }), SESSION)
  assert.equal(adaptWebsiteSession(fakeDoc().doc, { type: 'capture' }), null)
  const badWrapper = fakeDoc({ initial: { ...full, userToken: JSON.stringify({ value: SESSION.token, __version: '1' }) } })
  assert.equal(adaptWebsiteSession(badWrapper.doc, { type: 'capture' }), null)
  const extraKey = fakeDoc({ initial: { ...full, __appKit_userInfo: JSON.stringify({ value: { id: SESSION.userId, name: 'x' }, __version: '0' }) } })
  assert.equal(adaptWebsiteSession(extraKey.doc, { type: 'capture' }), null)
  const padded = fakeDoc({ initial: { ...full, userToken: JSON.stringify({ value: ' ' + SESSION.token, __version: '0' }) } })
  assert.equal(adaptWebsiteSession(padded.doc, { type: 'capture' }), null)
  const badUuid = fakeDoc({ initial: { ...full, 'deepseek-device-id:chat': 'not-a-uuid' } })
  assert.equal(adaptWebsiteSession(badUuid.doc, { type: 'capture' }), null)
})

test('capture and clear refuse any origin other than the approved website', () => {
  const evil = fakeDoc({ origin: 'https://chat.deepseek.com.evil.example', initial: full })
  assert.equal(adaptWebsiteSession(evil.doc, { type: 'capture' }), null)
  assert.equal(adaptWebsiteSession(evil.doc, { type: 'clear' }), false)
  assert.equal(evil.store.size, 3)
})

test('restore writes deviceId then userInfo then token last', () => {
  const { doc, store } = fakeDoc()
  assert.equal(adaptWebsiteSession(doc, { type: 'restore', session: SESSION }), 'restored')
  assert.equal(store.get('userToken'), tokenRaw)
  assert.equal(store.get('__appKit_userInfo'), userRaw)
  assert.equal(store.get('deepseek-device-id:chat'), UUID)
  assert.equal(store.size, 3)
})

test('restore never overwrites an already valid website token', () => {
  const other = JSON.stringify({ value: 'another-account-token', __version: '0' })
  const { doc, store } = fakeDoc({ initial: { userToken: other } })
  assert.equal(adaptWebsiteSession(doc, { type: 'restore', session: SESSION }), 'present')
  assert.equal(store.get('userToken'), other)
  assert.equal(store.size, 1)
})

test('restore rejects an invalid session and rolls back a failed write', () => {
  const { doc } = fakeDoc()
  assert.equal(adaptWebsiteSession(doc, { type: 'restore', session: { ...SESSION, deviceId: 'bad' } }), 'failed')
  const failing = fakeDoc({ initial: { 'deepseek-device-id:chat': 'old-device' }, failSet: 'userToken' })
  assert.equal(adaptWebsiteSession(failing.doc, { type: 'restore', session: SESSION }), 'failed')
  assert.equal(failing.store.get('deepseek-device-id:chat'), 'old-device')
  assert.equal(failing.store.has('userToken'), false)
  assert.equal(failing.store.has('__appKit_userInfo'), false)
})

test('clear removes exactly the three fixed keys and reports failures', () => {
  const { doc, store } = fakeDoc({ initial: { ...full, unrelated: 'keep' } })
  assert.equal(adaptWebsiteSession(doc, { type: 'clear' }), true)
  assert.deepEqual([...store.keys()], ['unrelated'])
  const denied = fakeDoc({ initial: full, failRemove: true })
  assert.equal(adaptWebsiteSession(denied.doc, { type: 'clear' }), false)
})

test('parseWebsiteSession validates untrusted guest results strictly', () => {
  assert.deepEqual(parseWebsiteSession(SESSION), SESSION)
  assert.equal(parseWebsiteSession({ ...SESSION, extra: 1 }), null)
  assert.equal(parseWebsiteSession({ token: 'a', userId: 'b' }), null)
  assert.equal(parseWebsiteSession({ ...SESSION, deviceId: 'zzzzzzzz-2f3a-4b5c-8d9e-1a2b3c4d5e6f' }), null)
  assert.equal(parseWebsiteSession(null), null)
  assert.equal(parseWebsiteSession([SESSION]), null)
})

test('scripts serialize typed arguments and escape HTML-sensitive characters', () => {
  const capture = websiteSessionCaptureScript()
  assert.ok(capture.startsWith('(function adaptWebsiteSession('))
  assert.ok(capture.endsWith(')(document,{"type":"capture"})'))
  const restore = websiteSessionRestoreScript({ ...SESSION, token: 'a<b\u2028c' })
  assert.ok(restore.includes('a\\u003cb\\u2028c'))
  assert.throws(() => websiteSessionScript({ type: 'restore', session: { ...SESSION, token: '' } }), /Invalid website session/)
  assert.ok(websiteSessionClearScript().endsWith(')(document,{"type":"clear"})'))
})

test('the serialized capture script runs self-contained inside a fresh VM', () => {
  const { doc } = fakeDoc({ initial: full })
  const result = vm.runInNewContext(websiteSessionCaptureScript(), { document: doc })
  // The fresh VM realm has its own Object.prototype; normalize the cross-realm
  // result into a host object before the strict deep comparison.
  assert.deepEqual({ ...result }, SESSION)
  const empty = fakeDoc()
  const restored = vm.runInNewContext(websiteSessionRestoreScript(SESSION), { document: empty.doc })
  assert.equal(restored, 'restored')
  assert.equal(empty.store.get('userToken'), tokenRaw)
})

