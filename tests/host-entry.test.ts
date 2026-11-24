import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

// Same seam as tests/server.test.ts: compile only our entry, keep the real
// published Cordis/Typert packages at runtime.
const require = createRequire(path.join(process.cwd(), 'package.json'))
const { build } = require('esbuild')
const { Context } = require('@deepseek-ai/cordis')
const { default: TypertRegistry } = require('@deepseek-ai/dsh-typert-registry')

test('host entry exports the module contract, validates empty config and wires manual settings', async t => {
  const cache = path.join(process.cwd(), 'node_modules', '.cache')
  await mkdir(cache, { recursive: true })
  const output = await mkdtemp(path.join(cache, 'dsh-chat-entry-host-test-'))
  t.after(async () => { await rm(output, { recursive: true, force: true }) })
  await build({
    absWorkingDir: process.cwd(), entryPoints: ['src/index.ts'],
    outfile: path.join(output, 'index.mjs'),
    bundle: true, packages: 'external', format: 'esm', platform: 'node', target: 'es2022',
  })
  const entry = await import(pathToFileURL(path.join(output, 'index.mjs')).href)
  assert.equal(entry.name, 'dsh-deepseek-chat-entry')
  assert.deepEqual(entry.inject, ['typert', 'credentials'])
  assert.equal(typeof entry.apply, 'function')
  // Standard Schema seam (cordis resolveConfig uses exactly this call).
  const validated = entry.Config['~standard'].validate({}) as { value?: unknown; issues?: unknown[] }
  assert.equal(validated.issues, undefined)
  assert.deepEqual(validated.value, {})

  const profileDir = path.join(process.cwd(), 'node_modules', '.cache', 'fixture-profile')
  const records = new Map<string, { kind: 'grant'; payload: unknown }>()
  const ctx = new Context()
  ctx.provide('profileContext', { dir: profileDir })
  ctx.provide('credentials', {
    readRecord: async (key: string) => records.get(key),
    modifyRecord: async (key: string, mutate: (current: { kind: 'grant'; payload: unknown } | undefined) => Promise<{ kind: 'grant'; payload: unknown } | undefined>) => {
      const replacement = await mutate(records.get(key))
      if (replacement !== undefined) records.set(key, replacement)
      return records.get(key)
    },
    deleteRecord: async (key: string) => { records.delete(key) },
  })
  const configureCalls: { options: unknown; fiber: unknown }[] = []
  let settingsDisposals = 0
  ctx.provide('settings', {
    configure: (options: unknown, fiber: unknown) => {
      configureCalls.push({ options, fiber })
      return () => { settingsDisposals += 1 }
    },
  })
  const registry = ctx.plugin(TypertRegistry); await registry
  const plugin = ctx.plugin(entry); await plugin
  t.after(async () => { await plugin.dispose(); await registry.dispose() })
  // apply() registered the controller: its descriptors are live in the registry.
  assert.ok(ctx.typert.local.get('dshDeepseekChatEntry/authorization'))
  assert.ok(ctx.typert.local.get('dshDeepseekChatEntry/clearWebsiteSession'))
  assert.equal(configureCalls.length, 1)
  assert.deepEqual(configureCalls[0].options, { auto: false })
  assert.ok(configureCalls[0].fiber)
  await plugin.dispose()
  assert.equal(settingsDisposals, 1)
  assert.equal(ctx.typert.local.get('dshDeepseekChatEntry/authorization'), undefined)
})
