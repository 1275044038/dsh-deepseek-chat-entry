import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import {
  WebsiteSurface,
  websiteWorkspaceKey,
  websiteGuestAttributes,
} from '../src/web-surface.js'
import type { ChatEntryBridge, ChatEntryViewState } from '../src/bridge.js'
import type { DesktopBrowserReservation } from '@deepseek-ai/dsh-client-ui-sidebar-browser/types'

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

test('websiteWorkspaceKey prefixes the account id with the plugin scope', () => {
  assert.equal(websiteWorkspaceKey('chat-profile:abc'), 'dsh-deepseek-chat-entry:chat-profile:abc')
})

test('websiteGuestAttributes matches the shell webview contract', () => {
  const reservation = { lease: 'lease-1', partition: 'dsh-sidebar-browser-x' } as DesktopBrowserReservation
  const attrs = websiteGuestAttributes(reservation)
  assert.equal(attrs.name, 'lease-1')
  assert.equal(attrs.partition, 'dsh-sidebar-browser-x')
  assert.equal(attrs.src, 'about:blank#lease-1')
  assert.equal(attrs.allowpopups, '')
  assert.equal(attrs['data-sidebar-browser-frame'], 'webview')
})

test('WebsiteSurface renders the loading status when no guest is reserved', () => {
  const html = renderToString(createElement(WebsiteSurface, { bridge: stubBridge(viewState()) }))
  assert.match(html, /正在加载 DeepSeek 官网…/)
  assert.match(html, /role="status"/)
})

test('WebsiteSurface honours the host language for the loading status', () => {
  const html = renderToString(createElement(WebsiteSurface, { bridge: stubBridge(viewState({ language: 'en' })) }))
  assert.match(html, /Loading the DeepSeek website…/)
})
