import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { HOST_ENTRY_ID, CHAT_PANEL, CHAT_SETTINGS_SECTION, CREDENTIAL_SCOPE, REMOTE_SERVICE_KEY } from '../src/identity.js'
import { translate, readHostLanguage } from '../src/i18n.js'

const root = process.cwd()
const manifest = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'))
const en = JSON.parse(readFileSync(path.join(root, 'locale', 'en.json'), 'utf8'))
const zh = JSON.parse(readFileSync(path.join(root, 'locale', 'zh-CN.json'), 'utf8'))

test('naming constants are unified', () => {
  assert.equal(HOST_ENTRY_ID, 'deepseek-chat-entry')
  assert.equal(CHAT_PANEL, 'dsh-deepseek-chat-entry.chat')
  assert.equal(CHAT_SETTINGS_SECTION, 'dsh-deepseek-chat-entry.chat-settings')
  assert.equal(CREDENTIAL_SCOPE, 'dsh-deepseek-chat-entry')
  assert.equal(REMOTE_SERVICE_KEY, 'dshDeepseekChatEntry')
})

test('manifest targets the 0.2.2 line only and keeps distribution rules', () => {
  assert.equal(manifest.name, 'dsh-deepseek-chat-entry')
  assert.equal(manifest.engines.dsh, '>=0.2.2-rc.1 <0.2.3-0')
  for (const peer of ['@deepseek-ai/dsh-credentials', '@deepseek-ai/dsh-typert-protocol', '@deepseek-ai/dsh-typert-registry']) {
    assert.equal(manifest.peerDependencies[peer], manifest.engines.dsh)
  }
  assert.equal(manifest.dsh.client.platform, 'web')
  assert.deepEqual(manifest.dsh.client.inject, [
    '@deepseek-ai/dsh-client-ui-renderer',
    '@deepseek-ai/dsh-client-ui-layout',
    '@deepseek-ai/dsh-client-ui-sidebar',
    '@deepseek-ai/dsh-api-gateway',
    '@deepseek-ai/dsh-client-ui-settings',
    '@deepseek-ai/dsh-client-ui-conversation',
    '@deepseek-ai/dsh-client-ui-input-trigger',
  ])
  assert.equal(manifest.exports['./client'].default, './lib/client.js')
  assert.equal(manifest.exports['./locale/*'], './locale/*')
  assert.deepEqual(manifest.files, ['lib', 'cordis.patch.yml', 'README.md', 'assets/icon.svg', 'locale'])
  for (const hook of ['build', 'prepare', 'prepack', 'postpack', 'prepublish', 'prepublishOnly', 'publish', 'preinstall', 'install', 'postinstall']) {
    assert.equal(manifest.scripts[hook], undefined)
  }
  assert.equal(manifest.dependencies.zod, '4.6.6')
})

test('cordis patch id equals HOST_ENTRY_ID', () => {
  const yml = readFileSync(path.join(root, 'cordis.patch.yml'), 'utf8')
  const match = yml.match(/- id: ([^\n]+)/)
  assert.ok(match)
  assert.equal(match[1].trim(), HOST_ENTRY_ID)
  assert.ok(yml.includes('name: dsh-deepseek-chat-entry'))
})

test('locale meta titles and key coverage', () => {
  assert.equal(en.meta.title, 'DeepSeek Chat')
  assert.equal(zh.meta.title, 'DeepSeek 聊天')
  for (const key of Object.keys(zh.ui)) assert.equal(typeof en.ui[key], 'string', 'missing en translation: ' + key)
})

test('i18n translate and host language detection', () => {
  assert.equal(translate('en', 'DeepSeek 聊天'), 'DeepSeek Chat')
  assert.equal(translate('zh-CN', 'DeepSeek 聊天'), 'DeepSeek 聊天')
  assert.equal(translate(null, '刷新'), '刷新')
  assert.equal(translate('en', '不存在的 key'), '不存在的 key')
  assert.equal(translate('en', ''), '')
  const doc = (lang: string) => ({ documentElement: { lang } }) as Document
  assert.equal(readHostLanguage(doc('zh-CN')), 'zh-CN')
  assert.equal(readHostLanguage(doc('en-US')), 'en')
  assert.equal(readHostLanguage(doc('fr')), null)
})

test('icon asset exists', () => {
  assert.ok(readFileSync(path.join(root, 'assets', 'icon.svg'), 'utf8').includes('<svg'))
})
