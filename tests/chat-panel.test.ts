import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { ChatPanel } from '../src/chat-panel.js'
import { ChatEntryPanelIcon, ChatEntrySettingsIcon } from '../src/icons.js'
import { ChatEntrySettingsSection } from '../src/settings-section.js'
import type { ChatEntryBridge, ChatEntryViewState } from '../src/bridge.js'

function viewState(overrides: Partial<ChatEntryViewState> = {}): ChatEntryViewState {
  return {
    authorization: { status: 'authorized', accountId: 'chat-profile:abc', epoch: 'e1', error: null },
    authorizationGeneration: 1,
    connectionError: null,
    websiteLoading: false,
    websiteError: false,
    websiteSignedIn: false,
    websiteReloadRevision: 0,
    websiteSessionError: null,
    language: null,
    ...overrides,
  }
}

function stubBridge(state: ChatEntryViewState): ChatEntryBridge {
  return {
    getSnapshot: () => state,
    subscribe: () => () => {},
    refreshAuthorization: () => {},
    reloadWebsite: () => {},
    reportWebsiteState: () => {},
    reportWebsiteSessionError: () => {},
    loadWebsiteSession: async () => null,
    saveWebsiteSession: async () => true,
    clearWebsiteSession: async () => true,
    inspectWebsiteSession: async () => 'empty',
  }
}

function stubForm(status: 'loading' | 'ready' | 'unavailable') {
  return {
    getSnapshot: () => ({ status, value: {}, base: {}, user: {}, revision: 0, writable: true }),
    subscribe: () => () => {},
    mutate: async () => true,
    set: async () => true,
    unset: async () => true,
  }
}

test('ChatPanel renders the toolbar with title, status and refresh, and no open-in-new-window control', () => {
  const html = renderToString(createElement(ChatPanel, { bridge: stubBridge(viewState()) }))
  assert.match(html, /DeepSeek 聊天/)
  assert.match(html, /刷新/)
  assert.match(html, /role="status"/)
  assert.match(html, /正在加载 DeepSeek 官网…/)
  assert.doesNotMatch(html, /在新窗口打开/)
  assert.doesNotMatch(html, /New window/)
})

test('ChatPanel derives the ready status dot from a signed-in website', () => {
  const html = renderToString(createElement(ChatPanel, { bridge: stubBridge(viewState({ websiteSignedIn: true })) }))
  assert.match(html, /data-state="ready"/)
  assert.match(html, /就绪/)
})

test('ChatPanel derives the offline status dot from a website error', () => {
  const html = renderToString(createElement(ChatPanel, { bridge: stubBridge(viewState({ websiteError: true })) }))
  assert.match(html, /data-state="offline"/)
  assert.match(html, /离线/)
})

test('panel and settings icons render sized currentColor SVGs', () => {
  const panel = renderToString(createElement(ChatEntryPanelIcon, { size: 18, active: false }))
  assert.match(panel, /width="18"/)
  assert.match(panel, /stroke="currentColor"/)
  const settings = renderToString(createElement(ChatEntrySettingsIcon, { size: 16, active: true }))
  assert.match(settings, /width="16"/)
  assert.match(settings, /stroke="currentColor"/)
})

test('ChatEntrySettingsSection shows the sign-in memory row and clear button when settings are ready', () => {
  const html = renderToString(createElement(ChatEntrySettingsSection, {
    bridge: stubBridge(viewState()), close: () => {}, form: stubForm('ready'),
  }))
  assert.match(html, /官网登录记忆/)
  assert.match(html, /清除登录/)
  assert.match(html, /读取中…/)
})

test('ChatEntrySettingsSection reports unavailable settings without a clear button', () => {
  const html = renderToString(createElement(ChatEntrySettingsSection, {
    bridge: stubBridge(viewState()), close: () => {}, form: stubForm('unavailable'),
  }))
  assert.match(html, /设置不可用/)
  assert.doesNotMatch(html, /清除登录/)
})
