import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-api-gateway/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-input-trigger/client'
import type { DesktopBrowserBridge } from '@deepseek-ai/dsh-client-ui-sidebar-browser/types'
import type { ConfigForm } from '@deepseek-ai/dsh-client-ui-settings/client'
import { CHAT_PANEL, CHAT_SETTINGS_SECTION, HOST_ENTRY_ID } from './identity.js'
import { readHostLanguage, translate, type ChatLanguage } from './i18n.js'
import { authorizationSchema, CHAT_ENTRY_REMOTE_CONTRIBUTION } from './protocol.js'
import type { AuthorizationState, ChatEntryClientMetadata, WebsiteConversation } from './protocol.js'
import { createChatReferenceSource } from './chat-reference.js'
import type { ChatEntryBridge, ChatEntryViewState, WebsiteSurfaceState } from './bridge.js'
import { ChatPanel } from './chat-panel.js'
import { ChatEntryPanelIcon, ChatEntrySettingsIcon } from './icons.js'
import { ChatEntrySettingsSection } from './settings-section.js'

export const name = 'dsh-deepseek-chat-entry'
export const inject = ['slots', 'layout', 'remote']
const AUTHORIZATION_TIMEOUT_MS = 35_000

// Desktop-only runtime gate. package.json dsh.client.platform stays 'web'
// (the only value the official loader recognizes; there is no 'desktop' value
// and no install-time rejection of pure Web). On pure Web there is no
// window.dshDesktop bridge, so we register nothing and the entry stays hidden.
// hide-vs-notice on pure Web: the user has confirmed hide (plan UNCONFIRMED③,
// m00161). Keep "no bridge -> no registration".
function desktopBrowser(): DesktopBrowserBridge | undefined {
  const desktop = (globalThis as typeof globalThis & {
    dshDesktop?: { protocolVersion?: number; browser?: DesktopBrowserBridge }
  }).dshDesktop
  if (desktop?.protocolVersion !== 1) return undefined
  const browser = desktop.browser
  return browser && typeof browser.acquire === 'function' && typeof browser.release === 'function'
    && typeof browser.onOpenRequested === 'function' ? browser : undefined
}

export function apply(ctx: Context): void {
  const nativeBrowser = desktopBrowser()
  // No desktop bridge (pure Web): do not register the nav row or any panel.
  if (!nativeBrowser) return
  const lifetime = new AbortController()
  const listeners = new Set<() => void>()
  let disposed = false
  let remoteContext: Context | null = null
  let connecting: Promise<void> | null = null
  let refreshing: Promise<void> | null = null
  let authorizationGeneration = 0
  let websiteReloadRevision = 0
  let websiteLoading = false
  let websiteError = false
  let websiteSignedIn = false
  let websiteSessionError: string | null = null
  let connectionError: string | null = null
  let language: ChatLanguage | null = typeof document === 'undefined' ? null : readHostLanguage(document)
  let authorization: AuthorizationState = { status: 'pending', accountId: null, epoch: 'client-pending', error: null }
  let pendingSessionClear: Promise<boolean> | null = null
  let preferencesForm: ConfigForm<Record<string, never>> | null = null
  let cached: ChatEntryViewState
  const metadata: ChatEntryClientMetadata = {
    version: '0.1.0', locale: globalThis.navigator?.language ?? 'und',
    timezoneOffsetSeconds: -new Date().getTimezoneOffset() * 60,
  }
  function publish(): void {
    if (disposed) return
    cached = {
      authorization, authorizationGeneration, connectionError,
      websiteLoading, websiteError, websiteSignedIn, websiteReloadRevision,
      websiteSessionError, language,
    }
    for (const listener of listeners) listener()
  }
  function acceptAuthorization(value: AuthorizationState): void {
    const next = authorizationSchema.parse(value)
    if (next.accountId !== authorization.accountId || next.epoch !== authorization.epoch) {
      authorizationGeneration++
      websiteLoading = false; websiteError = false; websiteSignedIn = false
      websiteSessionError = null
    }
    authorization = next
    connectionError = null
    publish()
  }
  function authorizationFailed(): void {
    if (disposed) return
    connectionError = translate(language, '未连接 DSH 服务。')
    // A transport failure cannot revoke an already confirmed account or imply sign-out.
    if (authorization.status === 'pending') authorization = { ...authorization, status: 'unavailable' }
    publish()
  }
  async function connectRemote(): Promise<void> {
    if (remoteContext || disposed) return
    if (!connecting) {
      connecting = Promise.resolve(ctx.effect(async () => {
        const unmount = await ctx.remote.$mount(CHAT_ENTRY_REMOTE_CONTRIBUTION)
        if (disposed) { await unmount(); return () => {} }
        // $mount publishes a separate Cordis service. Inject it only after
        // mounting, and call its methods from this dependency-aware Context.
        const consumer = ctx.inject(['remote', 'remote.dshDeepseekChatEntry'], remoteCtx => {
          remoteCtx.effect(() => {
            remoteContext = remoteCtx
            const stream = remoteCtx.remote.$stream<AuthorizationState>({
              name: 'dsh-deepseek-chat-entry.authorization',
              open: signal => remoteCtx.remote.dshDeepseekChatEntry.watchAuthorization(metadata, signal),
              ended: () => new Error('CHAT entry session service stream ended'),
              carrierFailed: () => { authorizationFailed() },
            })
            void (async () => {
              try {
                for await (const item of stream) {
                  if (disposed || remoteContext !== remoteCtx) break
                  if (item.signal.aborted) continue
                  acceptAuthorization(item.value); item.accept()
                }
              } catch { if (remoteContext === remoteCtx) authorizationFailed() }
            })()
            return () => {
              if (remoteContext === remoteCtx) remoteContext = null
              return stream.dispose()
            }
          }, 'dsh-deepseek-chat-entry website session observation')
        })
        try { await consumer }
        catch (error) { await consumer.dispose(); await unmount(); throw error }
        return async () => { await consumer.dispose(); await unmount() }
      }, 'dsh-deepseek-chat-entry website session remote')).then(() => {}).finally(() => { connecting = null })
    }
    await connecting
  }
  function refreshAuthorization(): Promise<void> {
    if (disposed) return Promise.resolve()
    if (refreshing) return refreshing
    refreshing = (async () => {
      const requestGeneration = authorizationGeneration
      const request = new AbortController()
      const cancel = () => { request.abort() }
      lifetime.signal.addEventListener('abort', cancel, { once: true })
      let timer: ReturnType<typeof setTimeout> | undefined
      const deadline = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => { request.abort(); reject(new Error('Authorization deadline exceeded')) }, AUTHORIZATION_TIMEOUT_MS)
        request.signal.addEventListener('abort', () => { reject(new Error('Authorization request cancelled')) }, { once: true })
      })
      try {
        const result = await Promise.race([
          (async () => {
            await connectRemote()
            if (request.signal.aborted || !remoteContext) throw new Error('Account remote unavailable')
            return remoteContext.remote.dshDeepseekChatEntry.authorization(metadata, request.signal)
          })(), deadline,
        ])
        if (disposed || request.signal.aborted || requestGeneration !== authorizationGeneration) return
        if (result.ok) acceptAuthorization(result.value)
        else authorizationFailed()
      } catch {
        if (!disposed && (requestGeneration === authorizationGeneration || authorization.status === 'pending')) authorizationFailed()
      } finally {
        clearTimeout(timer)
        lifetime.signal.removeEventListener('abort', cancel)
      }
    })().finally(() => { refreshing = null })
    return refreshing
  }
  // Authorization records travel only between our guest and the Host vault.
  // They never enter the published UI snapshot, settings, console or error text.
  function sessionFence(generation: number): { accountId: string; epoch: string } | null {
    return !disposed && generation === authorizationGeneration && authorization.status === 'authorized' && authorization.accountId
      ? { accountId: authorization.accountId, epoch: authorization.epoch } : null
  }
  function sameSessionFence(generation: number, fence: { accountId: string; epoch: string }): boolean {
    const current = sessionFence(generation)
    return current !== null && current.accountId === fence.accountId && current.epoch === fence.epoch
  }
  function sessionFailure(code: string = 'unknown'): void {
    // Only fixed carrier codes choose a product message. Never display error details.
    if (code === 'gateway/invocation-unavailable' || code === 'gateway/definition-unavailable' || code === 'gateway/method-unavailable') {
      websiteSessionError = translate(language, '当前 DSH 版本不支持官网登录记忆，请升级 DSH。')
    } else if (code === 'fence') {
      websiteSessionError = translate(language, '未连接 DSH 服务。')
    } else {
      websiteSessionError = translate(language, '官网登录记忆操作失败。')
    }
    publish()
  }
  async function websiteRequest<T>(
    operation: (signal: AbortSignal) => Promise<T>,
    timeoutMs = 12_000,
    externalSignal?: AbortSignal,
  ): Promise<T> {
    const request = new AbortController()
    const cancel = () => request.abort()
    lifetime.signal.addEventListener('abort', cancel, { once: true })
    externalSignal?.addEventListener('abort', cancel, { once: true })
    if (lifetime.signal.aborted || externalSignal?.aborted) request.abort()
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      return await Promise.race([operation(request.signal), new Promise<never>((_resolve, reject) => {
        const abort = () => reject(new Error('Website session request cancelled'))
        request.signal.addEventListener('abort', abort, { once: true })
        if (request.signal.aborted) abort()
        timer = setTimeout(() => request.abort(), timeoutMs)
      })])
    } finally {
      clearTimeout(timer)
      lifetime.signal.removeEventListener('abort', cancel)
      externalSignal?.removeEventListener('abort', cancel)
      request.abort()
    }
  }
  // @-reference data closures. Unlike the website-session bridge these never
  // touch the published UI snapshot: a list failure yields an empty menu, a
  // summarize failure rejects the codec and blocks the send.
  const LIST_CACHE_MS = 5_000
  let cachedList: readonly WebsiteConversation[] | null = null
  let cachedListAt = 0
  let cachedListGeneration = -1
  async function listConversations(signal: AbortSignal): Promise<readonly WebsiteConversation[]> {
    if (cachedList && cachedListGeneration === authorizationGeneration && Date.now() - cachedListAt < LIST_CACHE_MS) {
      return cachedList
    }
    const generation = authorizationGeneration
    const fence = sessionFence(generation)
    if (!fence) throw new Error(translate(language, '请先打开 DeepSeek 聊天面板登录官网。'))
    const result = await websiteRequest(async requestSignal => {
      await connectRemote()
      if (!remoteContext || requestSignal.aborted || !sameSessionFence(generation, fence)) throw new Error('Website session invalidated')
      return remoteContext.remote.dshDeepseekChatEntry.listWebsiteConversations(metadata, fence.epoch, requestSignal)
    }, 12_000, signal)
    if (!result.ok) throw new Error(result.error.message)
    cachedList = result.value; cachedListAt = Date.now(); cachedListGeneration = generation
    return result.value
  }
  async function summarizeConversation(sessionId: string, conversationId: string, signal: AbortSignal): Promise<string> {
    const generation = authorizationGeneration
    const fence = sessionFence(generation)
    if (!fence) throw new Error(translate(language, '请先打开 DeepSeek 聊天面板登录官网。'))
    const result = await websiteRequest(async requestSignal => {
      await connectRemote()
      if (!remoteContext || requestSignal.aborted || !sameSessionFence(generation, fence)) throw new Error('Website session invalidated')
      return remoteContext.remote.dshDeepseekChatEntry.summarizeWebsiteConversation(metadata, fence.epoch, sessionId, conversationId, requestSignal)
    }, 65_000, signal)
    if (!result.ok) throw new Error(result.error.message || translate(language, '官网对话摘要生成失败。'))
    return result.value
  }
  const bridge: ChatEntryBridge = {
    getSnapshot: () => cached,
    subscribe: listener => { listeners.add(listener); return () => { listeners.delete(listener) } },
    refreshAuthorization: () => { void refreshAuthorization() },
    reloadWebsite: () => { websiteReloadRevision++; publish() },
    reportWebsiteState: (generation, state: WebsiteSurfaceState) => {
      if (disposed || generation !== authorizationGeneration) return
      websiteLoading = state.loading; websiteError = state.error; websiteSignedIn = state.signedIn; publish()
    },
    reportWebsiteSessionError: (generation, message) => {
      if (!sessionFence(generation)) return
      if (websiteSessionError === message) return
      websiteSessionError = message; publish()
    },
    loadWebsiteSession: async generation => {
      const fence = sessionFence(generation)
      if (!fence) return null
      try {
        const result = await websiteRequest(async signal => {
          await connectRemote()
          if (!remoteContext || signal.aborted || !sameSessionFence(generation, fence)) throw new Error('Website session invalidated')
          return remoteContext.remote.dshDeepseekChatEntry.loadWebsiteSession(metadata, fence.epoch, signal)
        })
        if (!sameSessionFence(generation, fence)) return null
        if (!result.ok) { sessionFailure(result.error.code); return null }
        websiteSessionError = null; publish()
        return result.value
      } catch { if (sameSessionFence(generation, fence)) sessionFailure(); return null }
    },
    saveWebsiteSession: async (generation, session) => {
      const fence = sessionFence(generation)
      if (!fence) return false
      try {
        const result = await websiteRequest(async signal => {
          await connectRemote()
          if (!remoteContext || signal.aborted || !sameSessionFence(generation, fence)) throw new Error('Website session invalidated')
          return remoteContext.remote.dshDeepseekChatEntry.saveWebsiteSession(metadata, fence.epoch, session, signal)
        })
        if (!sameSessionFence(generation, fence)) return false
        if (!result.ok) { sessionFailure(result.error.code); return false }
        if (!result.value) { sessionFailure('fence'); return false }
        websiteSessionError = null; publish()
        return true
      } catch { if (sameSessionFence(generation, fence)) sessionFailure(); return false }
    },
    clearWebsiteSession: () => {
      if (pendingSessionClear) return pendingSessionClear
      const generation = authorizationGeneration
      const fence = sessionFence(generation)
      if (!fence) return Promise.resolve(false)
      const clearing = (async () => {
        try {
          const result = await websiteRequest(async signal => {
            await connectRemote()
            if (!remoteContext || signal.aborted || !sameSessionFence(generation, fence)) throw new Error('Website session invalidated')
            return remoteContext.remote.dshDeepseekChatEntry.clearWebsiteSession(metadata, fence.epoch, signal)
          })
          if (!sameSessionFence(generation, fence)) return false
          if (!result.ok || !result.value) { sessionFailure(result.ok ? 'fence' : result.error.code); return false }
          websiteSessionError = null; publish()
          return true
        } catch { if (sameSessionFence(generation, fence)) sessionFailure(); return false }
      })().finally(() => { if (pendingSessionClear === clearing) pendingSessionClear = null })
      pendingSessionClear = clearing
      return clearing
    },
    inspectWebsiteSession: async () => {
      const generation = authorizationGeneration
      const fence = sessionFence(generation)
      if (!fence) return 'unavailable'
      try {
        const result = await websiteRequest(async signal => {
          await connectRemote()
          if (!remoteContext || signal.aborted || !sameSessionFence(generation, fence)) throw new Error('Website session invalidated')
          return remoteContext.remote.dshDeepseekChatEntry.loadWebsiteSession(metadata, fence.epoch, signal)
        })
        if (!sameSessionFence(generation, fence)) return 'unavailable'
        if (!result.ok) return 'error'
        return result.value ? 'stored' : 'empty'
      } catch { return 'error' }
    },
  }
  publish()
  ctx.inject(['configForms'], child => {
    child.effect(() => {
      const form = child.configForms.get<Record<string, never>>(HOST_ENTRY_ID)
      preferencesForm = form
      const sync = () => { if (disposed || preferencesForm !== form) return; publish() }
      const stop = form.subscribe(sync); sync()
      return () => { stop(); if (preferencesForm === form) { preferencesForm = null; publish() } }
    })
  })
  // The @-reference source lives in its own injection so a missing input-trigger
  // service (older shell) never blocks the sidebar entry. registerSource returns
  // the effect disposer; the source closes over the data closures above.
  ctx.inject(['inputTriggers'], child => {
    child.effect(() => child.inputTriggers.registerSource(createChatReferenceSource({
      list: listConversations,
      summarize: summarizeConversation,
      translate: text => translate(language, text),
    })))
  })
  // The official sidebar wiring calls ctx.layout.selectPanel(id) when the row is
  // clicked; we never call selectPanel ourselves. The keyed main panel unmounts
  // automatically when another panel is selected, which releases the guest.
  ctx.effect(() => {
    ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
      name: 'sidebar.panellist', id: CHAT_PANEL, order: 50,
      label: () => translate(language, 'DeepSeek 聊天'),
    }, ChatEntryPanelIcon))
    ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: CHAT_PANEL, inject: () => ({ bridge }) }, ChatPanel))
    ctx.slots.inject('settings.section', () => {
      let label = ''
      let registeredForm: ConfigForm<Record<string, never>> | null | undefined = undefined
      let release = () => {}
      const syncSection = () => {
        const next = translate(language, 'DeepSeek 聊天')
        if (next === label && registeredForm === preferencesForm) return
        label = next
        registeredForm = preferencesForm
        release()
        const form = preferencesForm
        release = ctx.slots.register({ name: 'settings.section', id: CHAT_SETTINGS_SECTION, order: 80, label, inject: () => ({ bridge, form }) }, ChatEntrySettingsSection)
      }
      syncSection()
      listeners.add(syncSection)
      return () => { listeners.delete(syncSection); release() }
    })
    ctx.slots.inject('settings.section.icon', () => ctx.slots.register({ name: 'settings.section.icon', id: CHAT_SETTINGS_SECTION }, ChatEntrySettingsIcon))
    const syncLanguage = () => {
      const next = readHostLanguage(document)
      if (next === language) return
      language = next; publish()
    }
    const languageObserver = typeof document === 'undefined' ? null : new MutationObserver(syncLanguage)
    languageObserver?.observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] })
    if (languageObserver) syncLanguage()
    const refreshOnFocus = () => { void refreshAuthorization() }
    globalThis.addEventListener('focus', refreshOnFocus)
    void refreshAuthorization()
    return () => {
      languageObserver?.disconnect()
      disposed = true
      lifetime.abort()
      listeners.clear()
      globalThis.removeEventListener('focus', refreshOnFocus)
    }
  }, 'dsh-deepseek-chat-entry desktop chat UI')
}
