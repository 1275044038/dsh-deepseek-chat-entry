import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { baselineModules, clientRequests, inlineSafeModule } from '../scripts/client-contract.mjs'
import { checkArtifact } from '../scripts/check-artifact.mjs'
import { writeDistributionManifest, verifyDistributionManifest } from '../scripts/distribution-manifest.mjs'

test('client contract: baseline requests and inline-safe whitelist', () => {
  const requests = clientRequests({ dsh: { client: {} } })
  for (const mod of baselineModules) assert.ok(requests.has(mod))
  assert.ok(inlineSafeModule('@deepseek-ai/dsh-typert-protocol'))
  assert.ok(inlineSafeModule('@deepseek-ai/schemastery'))
  assert.ok(inlineSafeModule('@deepseek-ai/dsh-any-plugin/remote'))
  assert.equal(inlineSafeModule('@deepseek-ai/dsh-client-ui-sidebar'), false)
  assert.equal(inlineSafeModule('@deepseek-ai/dsh-credentials'), false)
})

test('client contract rejects invalid external declarations', () => {
  assert.throws(() => clientRequests({ dsh: { client: { external: ['react'] } } }), /Baseline module must not be repeated/)
  assert.throws(() => clientRequests({ dsh: { client: { external: ['a', 'a'] } } }), /duplicate/)
  assert.throws(() => clientRequests({ dsh: { client: { external: ['./x'] } } }), /Invalid module-table request/)
})

async function fixtureRoot(t) {
  const root = await mkdtemp(path.join(tmpdir(), 'dsh-chat-entry-gates-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  await mkdir(path.join(root, 'lib', 'types'), { recursive: true })
  const manifest = {
    name: 'dsh-deepseek-chat-entry', version: '0.1.0', scripts: {},
    dsh: { client: { platform: 'web' } },
    exports: { './client': { default: './lib/client.js' } },
  }
  await writeFile(path.join(root, 'package.json'), JSON.stringify(manifest))
  await writeFile(path.join(root, 'cordis.patch.yml'), '- insert:\n    - id: deepseek-chat-entry\n      name: dsh-deepseek-chat-entry\n')
  await writeFile(path.join(root, 'lib', 'index.js'), 'export {}\n')
  await writeFile(path.join(root, 'lib', 'types', 'index.d.ts'), 'export {}\n')
  await writeFile(path.join(root, 'lib', 'types', 'client.d.ts'), 'export {}\n')
  await writeFile(path.join(root, 'lib', 'client.js'), 'window.__ModuleLoader__.load({ id: "dsh-deepseek-chat-entry", factory: (require) => { var module = { exports: {} }; return module.exports; } });\n')
  return root
}

test('checkArtifact accepts one lazy registration and rejects a wrong id', async t => {
  const root = await fixtureRoot(t)
  assert.deepEqual(await checkArtifact(root), [])
  await writeFile(path.join(root, 'lib', 'client.js'), 'window.__ModuleLoader__.load({ id: "other-package", factory: () => ({}) });\n')
  await assert.rejects(() => checkArtifact(root))
})

test('checkArtifact rejects undeclared browser requires', async t => {
  const root = await fixtureRoot(t)
  await writeFile(path.join(root, 'lib', 'client.js'), 'window.__ModuleLoader__.load({ id: "dsh-deepseek-chat-entry", factory: (require) => { require("some-unknown-pkg"); return {}; } });\n')
  await assert.rejects(() => checkArtifact(root), /Undeclared browser require: some-unknown-pkg/)
})

test('distribution manifest roundtrip and staleness detection', async t => {
  const root = await fixtureRoot(t)
  for (const file of ['pnpm-lock.yaml', 'tsconfig.json', 'assets/icon.svg', 'scripts/build.mjs', 'scripts/client-contract.mjs', 'scripts/check-artifact.mjs', 'scripts/distribution-manifest.mjs', 'scripts/check-distribution.mjs', 'src/identity.ts', 'locale/en.json', 'locale/zh-CN.json']) {
    await mkdir(path.dirname(path.join(root, file)), { recursive: true })
    await writeFile(path.join(root, file), 'stub\n')
  }
  await writeDistributionManifest(root)
  const saved = await verifyDistributionManifest(root)
  assert.equal(saved.name, 'dsh-deepseek-chat-entry')
  assert.ok(saved.artifacts['lib/client.js'])
  assert.equal(saved.artifacts['lib/build-manifest.json'], undefined)
  await writeFile(path.join(root, 'src', 'identity.ts'), 'changed\n')
  await assert.rejects(() => verifyDistributionManifest(root), /Compiled files are stale or modified/)
})

