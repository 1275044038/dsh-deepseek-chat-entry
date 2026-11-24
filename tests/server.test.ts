import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import type {} from '../src/protocol.js'
import type {} from '../src/server.js'

// Compile only our Service; load the real published packages at runtime so
// Cordis, the Typert registry and the Gateway keep their runtime identities.
const require = createRequire(path.join(process.cwd(), 'package.json'))
const { build } = require('esbuild')
const { Context } = require('@deepseek-ai/cordis')
const { default: TypertRegistry } = require('@deepseek-ai/dsh-typert-registry')
const { default: TypertGateway } = require('@deepseek-ai/dsh-api-gateway')
const metadata = { version: '0.1.0', locale: 'zh-CN', timezoneOffsetSeconds: -28_800 }
const fictionalSession = {
  token: 'fictional-website-token', userId: 'fictional-website-user',
  deviceId: '00000000-0000-4000-8000-000000000001',
}
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => { resolve = done })
  return { promise, resolve }
}
async function compile(t: { after: (fn: () => Promise<void>) => void }) {
  const cache = path.join(process.cwd(), 'node_modules', '.cache')
  await mkdir(cache, { recursive: true })
  const output = await mkdtemp(path.join(cache, 'dsh-chat-entry-service-test-'))
  t.after(async () => { await rm(output, { recursive: true, force: true }) })
  for (const entry of ['server', 'protocol']) {
    await build({
      absWorkingDir: process.cwd(), entryPoints: ['src/' + entry + '.ts'],
      outfile: path.join(output, entry + '.mjs'),
      bundle: true, packages: 'external', format: 'esm', platform: 'node', target: 'es2022',
    })
  }
  const { ChatEntryController } = await import(pathToFileURL(path.join(output, 'server.mjs')).href)
  const { CHAT_ENTRY_REMOTE_CONTRIBUTION } = await import(pathToFileURL(path.join(output, 'protocol.mjs')).href)
  return { ChatEntryController, CHAT_ENTRY_REMOTE_CONTRIBUTION }
}
function memoryVault() {
  type Record = { kind: 'grant'; payload: unknown }
  const records = new Map<string, Record>()
  const calls: { method: 'read' | 'modify' | 'delete'; key: string }[] = []
  let failWrite = false
  let modifyGate: { entered: () => void; wait: Promise<void> } | undefined
  const provider = {
    readRecord: async (key: string) => { calls.push({ method: 'read', key }); return records.get(key) },
    modifyRecord: async (key: string, mutate: (current: Record | undefined) => Promise<Record | undefined>) => {
      calls.push({ method: 'modify', key })
      const gate = modifyGate; modifyGate = undefined
      if (gate) { gate.entered(); await gate.wait }
      if (failWrite) throw new Error('fictional-vault-write-detail')
      const replacement = await mutate(records.get(key))
      // Official seam semantics: undefined is a declined mutation, not deletion.
      if (replacement !== undefined) records.set(key, replacement)
      return records.get(key)
    },
    deleteRecord: async (key: string) => { calls.push({ method: 'delete', key }); records.delete(key) },
  }
  return {
    records, calls, provider,
    setFailWrite: (value: boolean) => { failWrite = value },
    setModifyGate: (gate: typeof modifyGate) => { modifyGate = gate },
  }
}

// The published 0.2.2-rc.1 Gateway injects `remoteAccess` and never activates
// without it, and `InvokeRemoteRequest.peer` is required and never defaulted
// ("every carrier and in-process caller names it explicitly", gateway
// lib/types/types.d.ts). The REF-style harness this plan transcribed predates
// both requirements, so provide an in-memory access fixture and an owner Peer
// here. Owner calls bypass resource resolution and access decisions, so
// `decide` is never reached; the fixture only satisfies the inject and names
// the calling Peer. No business assertion below depends on this fixture.
function hostAccess(ctx: { provide: (name: string, value: unknown) => unknown }) {
  ctx.provide('remoteAccess', { decide: () => ({ kind: 'allow' }) })
  const abort = new AbortController()
  return {
    id: 'fixture-owner-peer',
    ctx,
    principal: { kind: 'owner' },
    signal: abort.signal,
    interactions: 'none',
    dispose: async () => { abort.abort() },
  }
}

test('profile-scoped Host service binds strict methods, fences epochs and withdraws on disposal', async t => {
  const { ChatEntryController, CHAT_ENTRY_REMOTE_CONTRIBUTION } = await compile(t)
  const profileDir = path.join(process.cwd(), 'node_modules', '.cache', 'fixture-profile')
  const profileId = 'chat-profile:' + createHash('sha256').update(path.resolve(profileDir), 'utf8').digest('hex')
  const expectedKey = 'dsh-deepseek-chat-entry/website-' + profileId.slice('chat-profile:'.length)
  const vault = memoryVault()
  const ctx = new Context()
  ctx.provide('profileContext', { dir: profileDir })
  ctx.provide('credentials', vault.provider)
  const peer = hostAccess(ctx)
  const registry = ctx.plugin(TypertRegistry); await registry
  const gateway = ctx.plugin(TypertGateway); await gateway
  const controller = ctx.plugin(ChatEntryController); await controller
  let disposed = false
  t.after(async () => {
    if (!disposed) await controller.dispose()
    await gateway.dispose(); await registry.dispose()
  })
  const invoke = (method: string, args: object, signal?: AbortSignal) => ctx.typertGateway.invoke({
    namespace: 'dshDeepseekChatEntry', method, args, peer, ...(signal ? { signal } : {}),
  })
  const invokeSession = (method: string, epoch: string, session?: object) =>
    invoke(method, { metadata, epoch, ...(session ? { session } : {}) })

  assert.equal(ctx.typert.local.get('dshDeepseekChatEntry/authorization').parameters[0].codec.mode, 'strict')
  const authorized = await invoke('authorization', { metadata })
  assert.equal(authorized.status, 'authorized')
  assert.equal(authorized.accountId, profileId)
  assert.ok(authorized.epoch)
  assert.equal(authorized.error, null)
  assert.equal('token' in authorized, false)
  await assert.rejects(invoke('authorization', { metadata: { ...metadata, cookie: 'fixture-only' } }),
    (error: { code?: string }) => error.code === 'gateway/input-invalid')
  await assert.rejects(invoke('authorization', { metadata }, AbortSignal.abort()),
    (error: { code?: string }) => error.code === 'gateway/cancelled')

  await t.test('website grants use the profile key, strict payload and official origin', async () => {
    assert.equal(await invokeSession('loadWebsiteSession', authorized.epoch), null)
    assert.equal(await invokeSession('saveWebsiteSession', authorized.epoch, fictionalSession), true)
    assert.deepEqual(vault.records.get(expectedKey), { kind: 'grant', payload: {
      version: 2, origin: 'https://chat.deepseek.com', profileId,
      websiteAccountId: fictionalSession.userId, session: fictionalSession,
    } })
    assert.deepEqual(await invokeSession('loadWebsiteSession', authorized.epoch), fictionalSession)
    for (const extra of ['cookie', 'password', 'origin', 'accountId', 'credentialKey']) {
      await assert.rejects(invokeSession('saveWebsiteSession', authorized.epoch, { ...fictionalSession, [extra]: 'fixture-only' }),
        (error: { code?: string }) => error.code === 'gateway/input-invalid')
    }
    await assert.rejects(invoke('clearWebsiteSession', {
      metadata, epoch: authorized.epoch, accountId: 'fixture-other', credentialKey: 'other/default',
    }), (error: { code?: string }) => error.code === 'gateway/arguments-invalid')
    assert.equal(vault.calls.every(call => call.key === expectedKey), true)
  })

  await t.test('a stale epoch cannot load, overwrite or clear', async () => {
    const before = vault.calls.length
    assert.equal(await invokeSession('loadWebsiteSession', 'epoch-stale'), null)
    assert.equal(await invokeSession('saveWebsiteSession', 'epoch-stale', fictionalSession), false)
    assert.equal(await invokeSession('clearWebsiteSession', 'epoch-stale'), false)
    assert.equal(vault.calls.length, before)
  })

  await t.test('provider write failures keep the grant and expose only fixed gateway errors', async () => {
    const retained = vault.records.get(expectedKey)
    vault.setFailWrite(true)
    await assert.rejects(invokeSession('saveWebsiteSession', authorized.epoch, { ...fictionalSession, token: 'rejected-token' }),
      (error: { code?: string; message?: string }) => error.code === 'gateway/internal'
        && !String(error.message).includes('fictional-vault-write-detail'))
    await assert.rejects(invokeSession('clearWebsiteSession', authorized.epoch),
      (error: { code?: string }) => error.code === 'gateway/internal')
    vault.setFailWrite(false)
    assert.deepEqual(vault.records.get(expectedKey), retained)
    assert.deepEqual(await invokeSession('loadWebsiteSession', authorized.epoch), fictionalSession)
  })

  await t.test('real Client remote mounts, invokes, streams and withdraws', async () => {
    let ClientGateway: object | undefined
    // The published browser Client artifact is the lazyCJS bundle (window.__ModuleLoader__.load);
    // require.resolve('.../client') selects the Node ESM condition, so resolve the browser file explicitly.
    const clientPackage = require.resolve('@deepseek-ai/dsh-api-gateway/package.json')
    const clientArtifact = await readFile(path.join(path.dirname(clientPackage), 'lib/client.browser.js'), 'utf8')
    new Function('window', clientArtifact)({
      __ModuleLoader__: { load: (contribution: { factory: (load: typeof require) => object }) => {
        ClientGateway = contribution.factory(require)
      } },
    })
    assert.ok(ClientGateway)
    const clientCtx = new Context()
    let carrierCalls = 0
    clientCtx.provide('connection', {
      start: () => ({ stop: () => {} }),
      registerGenerationSource: () => () => {},
      rpc: {
        call: async (_path: string, endpoint: string, payload: { args: object }, signal: AbortSignal) => {
          carrierCalls++
          const [namespace, method] = endpoint.split('/')
          return { ok: true, value: await ctx.typertGateway.invoke({ namespace, method, args: payload.args, peer, signal }) }
        },
        async *open(_path: string, endpoint: string, payload: { args: object }, signal: AbortSignal) {
          const [namespace, method] = endpoint.split('/')
          yield* await ctx.typertGateway.stream({ namespace, method, args: payload.args, peer, signal })
        },
      },
    })
    const clientRegistry = clientCtx.plugin(TypertRegistry); await clientRegistry
    const clientGateway = clientCtx.plugin(ClientGateway); await clientGateway
    const unmount = await clientCtx.remote.$mount(CHAT_ENTRY_REMOTE_CONTRIBUTION)
    const captured = clientCtx.remote.dshDeepseekChatEntry.authorization
    const auth = await clientCtx.remote.dshDeepseekChatEntry.authorization(metadata)
    assert.equal(auth.ok, true)
    assert.equal(auth.value.accountId, profileId)
    assert.deepEqual(await clientCtx.remote.dshDeepseekChatEntry.loadWebsiteSession(metadata, auth.value.epoch), { ok: true, value: fictionalSession })
    assert.deepEqual(await clientCtx.remote.dshDeepseekChatEntry.clearWebsiteSession(metadata, auth.value.epoch), { ok: true, value: true })
    assert.deepEqual(await clientCtx.remote.dshDeepseekChatEntry.loadWebsiteSession(metadata, auth.value.epoch), { ok: true, value: null })
    assert.deepEqual(await clientCtx.remote.dshDeepseekChatEntry.saveWebsiteSession(metadata, auth.value.epoch, fictionalSession), { ok: true, value: true })
    const stream = clientCtx.remote.dshDeepseekChatEntry.watchAuthorization(metadata)
    const iterator = stream[Symbol.asyncIterator]()
    assert.equal((await iterator.next()).value.status, 'authorized')
    stream.dispose()
    await iterator.return?.()
    const missing = clientCtx.plugin({
      name: 'fixture-missing-namespace-dependency', inject: ['remote'],
      apply: (child: typeof clientCtx) => child.remote.dshDeepseekChatEntry.authorization(metadata),
    })
    await assert.rejects(Promise.resolve(missing), /remote\.dshDeepseekChatEntry.*without inject/)
    await missing.dispose()
    await unmount()
    assert.equal(clientCtx.get('remote.dshDeepseekChatEntry'), undefined)
    const callsBefore = carrierCalls
    assert.equal((await captured(metadata)).ok, false)
    assert.equal(carrierCalls, callsBefore)
    await clientGateway.dispose()
    await clientRegistry.dispose()
  })

  await t.test('disposal fences a write waiting for the credential lock and withdraws methods', async () => {
    const entered = deferred<void>()
    const release = deferred<void>()
    vault.setModifyGate({ entered: () => entered.resolve(), wait: release.promise })
    const retained = vault.records.get(expectedKey)
    const saving = invokeSession('saveWebsiteSession', authorized.epoch, { ...fictionalSession, token: 'fictional-stale-write-token' })
    await entered.promise
    ctx.dshDeepseekChatEntry.authority.dispose() // epoch changes while the mutate callback is still waiting
    release.resolve()
    assert.equal(await saving, false)
    assert.deepEqual(vault.records.get(expectedKey), retained)
    await controller.dispose()
    disposed = true
    for (const method of ['authorization', 'watchAuthorization', 'loadWebsiteSession', 'saveWebsiteSession', 'clearWebsiteSession']) {
      assert.equal(ctx.typert.local.get('dshDeepseekChatEntry/' + method), undefined)
    }
    await assert.rejects(invoke('authorization', { metadata }),
      (error: { code?: string }) => error.code === 'gateway/definition-unavailable')
  })
})

test('without profileContext the service is volatile and never touches the vault', async t => {
  const { ChatEntryController } = await compile(t)
  const vault = memoryVault()
  const ctx = new Context()
  ctx.provide('credentials', vault.provider)
  const peer = hostAccess(ctx)
  const registry = ctx.plugin(TypertRegistry); await registry
  const gateway = ctx.plugin(TypertGateway); await gateway
  const controller = ctx.plugin(ChatEntryController); await controller
  t.after(async () => { await controller.dispose(); await gateway.dispose(); await registry.dispose() })
  const invoke = (method: string, args: object) => ctx.typertGateway.invoke({ namespace: 'dshDeepseekChatEntry', method, args, peer })
  const state = await invoke('authorization', { metadata })
  assert.equal(state.status, 'authorized')
  assert.ok(String(state.accountId).startsWith('chat-volatile:'))
  assert.equal(state.error, 'profile-context-unavailable')
  assert.equal(await invoke('loadWebsiteSession', { metadata, epoch: state.epoch }), null)
  assert.equal(await invoke('saveWebsiteSession', { metadata, epoch: state.epoch, session: fictionalSession }), false)
  assert.equal(await invoke('clearWebsiteSession', { metadata, epoch: state.epoch }), true)
  assert.equal(vault.calls.length, 0)
})
