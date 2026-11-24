import test from 'node:test'
import assert from 'node:assert/strict'
import type { Context } from '@deepseek-ai/cordis'
import { apply } from '../src/client.js'
import type { ChatEntryBridge } from '../src/bridge.js'
import type { AuthorizationState, WebsiteSession } from '../src/protocol.js'
import { CHAT_PANEL, CHAT_SETTINGS_SECTION, HOST_ENTRY_ID } from '../src/identity.js'

const authorized = (id = 'A', epoch = 'grant-a'): AuthorizationState => ({ status: 'authorized', accountId: id, epoch, error: null })
const signedOut = (): AuthorizationState => ({ status: 'unauthorized', accountId: null, epoch: 'closed', error: null })
const flush = async () => { for (let index = 0; index < 12; index++) await Promise.resolve() }
type SessionResult<T> = { ok: true; value: T } | { ok: false; error: { code: string } }
type Metadata = { version: string; locale: string; timezoneOffsetSeconds: number }
const fictionalSession: WebsiteSession = {
  token: 'fictional-website-token', userId: 'fictional-website-user',
  deviceId: '00000000-0000-4000-8000-000000000001',
}
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail })
  return { promise, resolve, reject }
}
type Registration = { name: string; key?: string; id?: string; order?: number; label?: unknown; inject?: () => { bridge: ChatEntryBridge; form?: unknown }; component?: unknown }

/** Hand-written Cordis effect/inject/slots/remote fixtures; no native guest runs.
 *  The test.mjs esbuild fixture stubs chat-panel/icons/settings-section imports. */
function harness(withDesktop = true) {
  type Dispose = () => void | Promise<void>
  const rootEffects: Dispose[] = []
  let collector = rootEffects
  const setup: Promise<unknown>[] = []
  const order: string[] = []
  const registrations = new Map<string, Registration>()
  const requests: ReturnType<typeof deferred<{ ok: true; value: AuthorizationState }>>[] = []
  const sessionCalls: { method: 'load' | 'save' | 'clear'; epoch: string; signal: AbortSignal; session?: WebsiteSession; metadata?: Metadata }[] = []
  const sessionReplies: {
    load: (signal: AbortSignal) => Promise<SessionResult<WebsiteSession | null>>
    save: (signal: AbortSignal) => Promise<SessionResult<boolean>>
    clear: (signal: AbortSignal) => Promise<SessionResult<boolean>>
  } = {
    load: async () => ({ ok: true, value: null }),
    save: async () => ({ ok: true, value: true }),
    clear: async () => ({ ok: true, value: true }),
  }
  type Item = { value: AuthorizationState; signal: AbortSignal; accept: () => void }
  const queue: Item[] = []
  let waiting: ((result: IteratorResult<Item>) => void) | undefined
  let ended = false
  const stream = {
    [Symbol.asyncIterator]() {
      return {
        next(): Promise<IteratorResult<Item>> {
          if (queue.length) return Promise.resolve({ done: false, value: queue.shift()! })
          if (ended) return Promise.resolve({ done: true, value: undefined })
          return new Promise(resolve => { waiting = resolve })
        },
      }
    },
    async dispose() {
      ended = true
      waiting?.({ done: true, value: undefined }); waiting = undefined
      order.push('stream:dispose')
    },
  }
  const effect = (callback: () => unknown): Dispose => {
    const parent = collector
    const children: Dispose[] = []
    collector = children
    let result: unknown
    try { result = callback() } finally { collector = parent }
    const collect = (value: unknown) => {
      if (typeof value === 'function') children.push(value as Dispose)
      else if (value && typeof value === 'object' && Symbol.iterator in value) children.push(...value as Iterable<Dispose>)
    }
    if (result && typeof result === 'object' && 'then' in result) {
      const task = Promise.resolve(result).then(collect)
      setup.push(task)
      void task.catch(() => {})
    } else collect(result)
    let disposed = false
    const dispose = async () => {
      if (disposed) return
      disposed = true
      for (const cleanup of [...children].reverse()) await cleanup()
    }
    parent.push(dispose)
    return Object.assign(dispose, {
      then: (fulfilled: (cleanup: Dispose) => unknown, rejected: (reason: unknown) => unknown) =>
        Promise.resolve(result).then(() => fulfilled(() => dispose()), rejected),
    })
  }
  const formListeners = new Set<() => void>()
  const form = {
    getSnapshot: () => ({ status: 'ready', value: {}, base: {}, user: {}, revision: 0, writable: true }),
    subscribe: (fn: () => void) => { formListeners.add(fn); return () => { formListeners.delete(fn) } },
  }
  const ctx = {
    configForms: { get: (ns: string) => { assert.equal(ns, HOST_ENTRY_ID); return form } },
    effect,
    inject: (dependencies: string[], callback: (ctx: unknown) => unknown) => {
      assert.deepEqual(dependencies, dependencies[0] === 'configForms' ? ['configForms'] : ['remote', 'remote.dshDeepseekChatEntry'])
      const dispose = effect(() => callback(ctx))
      return { dispose, then: (fulfilled: () => unknown) => Promise.resolve().then(fulfilled) }
    },
    slots: {
      inject: (_name: string, callback: () => unknown) => effect(callback),
      register: (options: Registration, component: unknown) => {
        const key = options.name + ':' + (options.key ?? options.id ?? '')
        registrations.set(key, { ...options, component })
        return effect(() => () => { registrations.delete(key); order.push('unregister:' + key) })
      },
    },
    layout: {
      panelInfo: { getSnapshot: () => ({ activePanelId: null }), subscribe: () => () => {} },
      selectPanel: (next: string | null) => { order.push('panel:' + next) },
    },
    remote: {
      $mount: async () => { order.push('remote:mount'); return () => { order.push('remote:unmount') } },
      $stream: () => stream,
      dshDeepseekChatEntry: {
        authorization: () => { const value = deferred<{ ok: true; value: AuthorizationState }>(); requests.push(value); return value.promise },
        loadWebsiteSession: (metadata: Metadata, epoch: string, signal: AbortSignal) => {
          sessionCalls.push({ method: 'load', epoch, signal, metadata }); order.push('session:load')
          return sessionReplies.load(signal)
        },
        saveWebsiteSession: (metadata: Metadata, epoch: string, session: WebsiteSession, signal: AbortSignal) => {
          sessionCalls.push({ method: 'save', epoch, session, signal, metadata }); order.push('session:save')
          return sessionReplies.save(signal)
        },
        clearWebsiteSession: (metadata: Metadata, epoch: string, signal: AbortSignal) => {
          sessionCalls.push({ method: 'clear', epoch, signal, metadata }); order.push('session:clear')
          return sessionReplies.clear(signal)
        },
      },
    },
  }
  const product = globalThis as typeof globalThis & { dshDesktop?: unknown }
  const previousDesktop = product.dshDesktop
  const previousAdd = globalThis.addEventListener
  const previousRemove = globalThis.removeEventListener
  if (withDesktop) product.dshDesktop = { protocolVersion: 1, browser: { acquire: async () => ({ lease: 'unused', partition: 'unused' }), release: async () => {}, onOpenRequested: () => () => {} } }
  else delete product.dshDesktop
  globalThis.addEventListener = () => {}
  globalThis.removeEventListener = () => {}
  apply(ctx as unknown as Context)
  const bridge = registrations.get('main:' + CHAT_PANEL)?.inject?.().bridge
  let cleaned = false
  return {
    bridge, order, requests, sessionCalls, sessionReplies,
    registrations: () => [...registrations.keys()],
    registration: (key: string) => registrations.get(key),
    async ready() { await flush(); await Promise.all(setup); await flush() },
    emit(value: AuthorizationState, aborted = false) {
      const controller = new AbortController()
      if (aborted) controller.abort()
      const item = { value, signal: controller.signal, accept: () => { order.push('stream:accept') } }
      if (waiting) { const consume = waiting; waiting = undefined; consume({ done: false, value: item }) }
      else queue.push(item)
    },
    async dispose() {
      if (cleaned) return
      cleaned = true
      try { for (const cleanup of [...rootEffects].reverse()) await cleanup() }
      finally {
        if (previousDesktop === undefined) delete product.dshDesktop
        else product.dshDesktop = previousDesktop
        globalThis.addEventListener = previousAdd
        globalThis.removeEventListener = previousRemove
      }
    },
  }
}

test('registers nav row, keyed main panel, settings section and icon without calling selectPanel', async () => {
  const h = harness()
  try {
    await h.ready()
    h.requests[0].resolve({ ok: true, value: authorized() }); await flush()
    assert(h.registrations().includes('sidebar.panellist:' + CHAT_PANEL))
    assert(h.registrations().includes('main:' + CHAT_PANEL))
    assert(h.registrations().includes('settings.section:' + CHAT_SETTINGS_SECTION))
    assert(h.registrations().includes('settings.section.icon:' + CHAT_SETTINGS_SECTION))
    const nav = h.registration('sidebar.panellist:' + CHAT_PANEL)!
    assert.equal(nav.order, 50)
    assert.equal(nav.id, CHAT_PANEL)
    assert.equal((nav.label as () => string)(), 'DeepSeek 聊天')
    assert.equal(h.order.some(entry => entry.startsWith('panel:')), false)
  } finally { await h.dispose() }
})

test('pure Web without a desktop bridge registers nothing', async () => {
  const h = harness(false)
  try {
    await h.ready()
    assert.deepEqual(h.registrations(), [])
    assert.equal(h.bridge, undefined)
    assert.equal(h.order.includes('remote:mount'), false)
  } finally { await h.dispose() }
})

test('account change bumps generation and resets website state; late reports are ignored', async () => {
  const h = harness()
  try {
    await h.ready()
    h.requests[0].resolve({ ok: true, value: authorized('A', 'e1') }); await flush()
    const bridge = h.bridge!
    const generation = bridge.getSnapshot().authorizationGeneration
    bridge.reportWebsiteState(generation, { loading: false, error: false, signedIn: true })
    assert.equal(bridge.getSnapshot().websiteSignedIn, true)
    h.emit(authorized('B', 'e2')); await flush()
    assert.equal(bridge.getSnapshot().authorizationGeneration, generation + 1)
    assert.equal(bridge.getSnapshot().websiteSignedIn, false)
    bridge.reportWebsiteState(generation, { loading: false, error: false, signedIn: true })
    assert.equal(bridge.getSnapshot().websiteSignedIn, false)
  } finally { await h.dispose() }
})

test('aborted stream items are ignored and a late HTTP snapshot cannot revive a signed-out account', async () => {
  const h = harness()
  try {
    await h.ready()
    h.requests[0].resolve({ ok: true, value: authorized() }); await flush()
    h.bridge!.refreshAuthorization(); await flush()
    const stale = h.requests[1]
    h.emit(signedOut()); await flush()
    stale.resolve({ ok: true, value: authorized() }); await flush()
    assert.equal(h.bridge!.getSnapshot().authorization.status, 'unauthorized')
    h.emit(authorized(), true); await flush()
    assert.equal(h.bridge!.getSnapshot().authorization.status, 'unauthorized')
  } finally { await h.dispose() }
})

test('session load/save/clear use the epoch fence and clear is single-flight', async () => {
  const h = harness()
  try {
    await h.ready()
    h.requests[0].resolve({ ok: true, value: authorized('A', 'e1') }); await flush()
    const bridge = h.bridge!
    const generation = bridge.getSnapshot().authorizationGeneration
    assert.equal(await bridge.loadWebsiteSession(generation + 99), null)
    h.sessionReplies.load = async () => ({ ok: true, value: fictionalSession })
    assert.deepEqual(await bridge.loadWebsiteSession(generation), fictionalSession)
    assert.equal(await bridge.saveWebsiteSession(generation, fictionalSession), true)
    assert.equal(await bridge.inspectWebsiteSession(), 'stored')
    let releaseClear!: () => void
    const gate = new Promise<void>(resolve => { releaseClear = resolve })
    h.sessionReplies.clear = async () => { await gate; return { ok: true, value: true } }
    const first = bridge.clearWebsiteSession()
    const second = bridge.clearWebsiteSession()
    assert.equal(first, second)
    releaseClear()
    assert.equal(await first, true)
    const clears = h.sessionCalls.filter(call => call.method === 'clear')
    assert.equal(clears.length, 1)
    assert.equal(clears[0].epoch, 'e1')
    assert.equal(clears[0].metadata!.version, '0.1.0')
  } finally { await h.dispose() }
})

test('dispose unmounts the remote, disposes the stream and unregisters every slot', async () => {
  const h = harness()
  try {
    await h.ready()
    h.requests[0].resolve({ ok: true, value: authorized() }); await flush()
    assert(h.registrations().length > 0)
  } finally { await h.dispose() }
  assert(h.order.includes('stream:dispose'))
  assert(h.order.includes('remote:unmount'))
  assert.deepEqual(h.registrations(), [])
})
