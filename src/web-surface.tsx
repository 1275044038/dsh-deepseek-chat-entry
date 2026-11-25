import { createElement, useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { DesktopBrowserBridge, DesktopBrowserReservation } from '@deepseek-ai/dsh-client-ui-sidebar-browser/types'
import type { ChatEntryBridge } from './bridge.js'
import { translate } from './i18n.js'
import {
  parseWebsiteSession,
  websiteSessionCaptureScript,
  websiteSessionRestoreScript,
} from './website-session.js'
import { websiteEnvironmentNoticeScript } from './website-notice.js'

const WEBSITE_URL = 'https://chat.deepseek.com/'
const WEBSITE_ORIGIN = 'https://chat.deepseek.com'
const SCRIPT_TIMEOUT_MS = 8_000

interface WebsiteWebview extends HTMLElement {
  loadURL(url: string): Promise<void>
  getURL(): string
  reload(): void
  executeJavaScript(code: string): Promise<unknown>
}

function getDesktopBrowserBridge(): DesktopBrowserBridge | undefined {
  const desktop = (globalThis as typeof globalThis & {
    dshDesktop?: { protocolVersion?: number; browser?: DesktopBrowserBridge }
  }).dshDesktop
  if (desktop?.protocolVersion !== 1) return undefined
  const browser = desktop.browser
  if (typeof browser?.acquire !== 'function' || typeof browser?.release !== 'function'
    || typeof browser?.onOpenRequested !== 'function') return undefined
  return browser
}

// The shell caches one partition per workspace string for the whole process, so
// releasing the guest keeps the website storage; the 3-key vault restores login.
export function websiteWorkspaceKey(accountId: string): string {
  return 'dsh-deepseek-chat-entry:' + accountId
}

export function websiteGuestAttributes(reservation: DesktopBrowserReservation): {
  name: string
  partition: string
  src: string
  allowpopups: string
  'data-sidebar-browser-frame': string
} {
  return {
    name: reservation.lease,
    partition: reservation.partition,
    src: 'about:blank#' + reservation.lease,
    allowpopups: '',
    'data-sidebar-browser-frame': 'webview',
  }
}

interface GuestReservation {
  native: DesktopBrowserReservation
  generation: number
  workspace: string
}

export function WebsiteSurface({ bridge }: { bridge: ChatEntryBridge }) {
  const state = useSyncExternalStore(bridge.subscribe, bridge.getSnapshot, bridge.getSnapshot)
  const nativeBrowser = getDesktopBrowserBridge()
  const [reservation, setReservation] = useState<GuestReservation | null>(null)
  const [recoveryRevision, setRecoveryRevision] = useState(0)
  const guest = useRef<WebsiteWebview | null>(null)
  const guestEvents = useRef<AbortController | null>(null)
  const reloadGuest = useRef<(() => void) | null>(null)
  const lastReload = useRef(state.websiteReloadRevision)

  const accountId = state.authorization.accountId
  const authorized = state.authorization.status === 'authorized' && accountId !== null

  useEffect(() => {
    let stopped = false
    let held: DesktopBrowserReservation | undefined
    setReservation(null)
    if (nativeBrowser === undefined || !authorized || accountId === null) return
    const generation = state.authorizationGeneration
    const workspace = websiteWorkspaceKey(accountId)
    bridge.reportWebsiteState(generation, { loading: true, error: false, signedIn: false })
    const release = (value: DesktopBrowserReservation) => {
      void nativeBrowser.release(value.lease).catch(() => {
        console.warn('dsh-deepseek-chat-entry: website guest release failed')
      })
    }
    void nativeBrowser.acquire(workspace).then(value => {
      if (stopped) { release(value); return }
      held = value
      setReservation({ native: value, generation, workspace })
    }).catch(() => {
      if (!stopped) bridge.reportWebsiteState(generation, { loading: false, error: true, signedIn: false })
    })
    return () => {
      stopped = true
      guestEvents.current?.abort()
      guestEvents.current = null
      guest.current = null
      reloadGuest.current = null
      // DevTools lesson (REF src/website-guest.ts:14-25): a packaged shell disables
      // guest devTools and Electron getFocusedWebContents prefers a webview, so a
      // retained guest would steal the main window F12. Leaving the panel unmounts
      // this component and must release the lease immediately.
      if (held !== undefined) release(held)
    }
  }, [bridge, nativeBrowser, authorized, accountId, state.authorizationGeneration, recoveryRevision])

  const attachGuest = useCallback((element: HTMLElement | null) => {
    guestEvents.current?.abort()
    guestEvents.current = null
    guest.current = null
    reloadGuest.current = null
    if (element === null || reservation === null || nativeBrowser === undefined) return
    const current = element as WebsiteWebview
    const events = new AbortController()
    guestEvents.current = events
    guest.current = current
    const generation = reservation.generation
    let bootstrapped = false
    let documentReady = false
    let documentRevision = 0
    let restorationAttempted = false
    let savedSessionFingerprint: string | null = null
    let pendingSessionCapture: Promise<void> | null = null
    let lastError = false
    let signedIn = false

    const active = () => {
      const snapshot = bridge.getSnapshot()
      return !events.signal.aborted && snapshot.authorizationGeneration === generation
        && snapshot.authorization.status === 'authorized'
    }
    const approvedOrigin = () => {
      try { return new URL(current.getURL()).origin === WEBSITE_ORIGIN } catch { return false }
    }
    const report = (loading: boolean, error = false) => {
      if (loading) lastError = false
      else if (error) lastError = true
      if (!events.signal.aborted) bridge.reportWebsiteState(generation, { loading, error: lastError, signedIn })
    }
    const executeScript = (script: string): Promise<unknown> => {
      let timer: ReturnType<typeof setTimeout> | undefined
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('website script timed out')), SCRIPT_TIMEOUT_MS)
      })
      return Promise.race([Promise.resolve(current.executeJavaScript(script)), timeout])
        .finally(() => { if (timer !== undefined) clearTimeout(timer) })
    }
    const navigate = (url: string) => {
      report(true)
      void current.loadURL(url).catch((error: unknown) => {
        if (events.signal.aborted) return
        if (typeof error === 'object' && error !== null && 'code' in error
          && (error as { code?: unknown }).code === 'ERR_ABORTED') return
        report(false, true)
      })
    }
    const reloadDocument = () => {
      if (events.signal.aborted) return
      documentReady = false
      restorationAttempted = false
      report(true)
      if (current.getURL().startsWith('about:blank')) navigate(WEBSITE_URL)
      else current.reload()
    }
    reloadGuest.current = () => {
      try { reloadDocument() } catch { report(false, true) }
    }
    const prepareSession = async (): Promise<boolean> => {
      if (restorationAttempted) return true
      restorationAttempted = true
      const recoveryDocument = documentRevision
      const sameRecovery = () => active() && recoveryDocument === documentRevision
      try {
        const present = parseWebsiteSession(await executeScript(websiteSessionCaptureScript()))
        if (!active()) return false
        if (present || !sameRecovery()) return true
        const saved = await bridge.loadWebsiteSession(generation)
        if (!active() || !approvedOrigin()) return false
        if (saved === null || !sameRecovery()) return true
        const result = await executeScript(websiteSessionRestoreScript(saved))
        if (!active()) return false
        if (!sameRecovery()) return true
        if (result === 'restored') { reloadDocument(); return false }
        if (result !== 'present') bridge.reportWebsiteSessionError(generation, '官网登录记忆操作失败。')
        return true
      } catch {
        if (sameRecovery()) bridge.reportWebsiteSessionError(generation, '官网登录记忆操作失败。')
        return active()
      }
    }
    const captureSession = () => {
      if (pendingSessionCapture !== null) return
      const requestDocument = documentRevision
      const sameLogin = () => active() && requestDocument === documentRevision
      pendingSessionCapture = (async () => {
        try {
          const session = parseWebsiteSession(await executeScript(websiteSessionCaptureScript()))
          if (!sameLogin()) return
          signedIn = session !== null
          report(false)
          if (session === null) return
          // The fingerprint comparison stays private to the guest owner; it never
          // enters UI state and never reads chat content, cookies or passwords.
          const fingerprint = JSON.stringify(session)
          if (fingerprint !== savedSessionFingerprint
            && await bridge.saveWebsiteSession(generation, session) && sameLogin()) {
            savedSessionFingerprint = fingerprint
          }
        } catch {
          if (sameLogin()) bridge.reportWebsiteSessionError(generation, '官网登录记忆操作失败。')
        }
      })().finally(() => { pendingSessionCapture = null })
    }
    const syncSession = () => {
      if (!active() || !approvedOrigin() || !documentReady) return
      void (async () => {
        const ok = await prepareSession()
        if (!ok || !active() || !approvedOrigin()) return
        dismissEnvironmentNotice()
        captureSession()
      })()
    }
    // The website renders its environment notice after the document boots, so a
    // single dom-ready pass can miss it. Retry on a short bounded schedule; the
    // dismissal is idempotent and stops once the document revision changes.
    const dismissEnvironmentNotice = () => {
      if (!active() || !approvedOrigin() || !documentReady) return
      void executeScript(websiteEnvironmentNoticeScript()).catch(() => {})
    }
    const scheduleNoticeDismissal = () => {
      const revision = documentRevision
      for (const delay of [0, 700, 1800, 3500]) {
        setTimeout(() => {
          if (events.signal.aborted || revision !== documentRevision) return
          dismissEnvironmentNotice()
        }, delay)
      }
    }

    current.addEventListener('dom-ready', () => {
      if (!bootstrapped) { bootstrapped = true; navigate(WEBSITE_URL); return }
      if (!approvedOrigin()) return
      documentReady = true
      syncSession()
      scheduleNoticeDismissal()
    }, { signal: events.signal })
    current.addEventListener('did-finish-load', () => {
      if (!documentReady || !approvedOrigin()) return
      syncSession()
    }, { signal: events.signal })
    current.addEventListener('did-start-navigation', event => {
      const navigation = event as Event & { readonly isMainFrame?: boolean; readonly isInPlace?: boolean }
      // Only a new main document loses its session markers; subframe activity must
      // not clear an already ready page.
      if (navigation.isMainFrame !== true || navigation.isInPlace !== false) return
      documentRevision++
      documentReady = false
      restorationAttempted = false
      savedSessionFingerprint = null
      signedIn = false
      report(true)
    }, { signal: events.signal })
    current.addEventListener('did-navigate-in-page', event => {
      if ((event as Event & { readonly isMainFrame?: boolean }).isMainFrame !== true || !approvedOrigin()) return
      // Login may return to the app through SPA routing; re-run the session pipeline.
      syncSession()
    }, { signal: events.signal })
    current.addEventListener('did-stop-loading', () => {
      if (bootstrapped && approvedOrigin()) report(false)
    }, { signal: events.signal })
    current.addEventListener('did-fail-load', event => {
      const failure = event as Event & { readonly isMainFrame?: boolean; readonly errorCode?: number }
      // -3 is ERR_ABORTED (a superseded navigation), not a real load failure.
      if (failure.isMainFrame === true && failure.errorCode !== -3) report(false, true)
    }, { signal: events.signal })
    current.addEventListener('render-process-gone', () => {
      report(false, true)
      setRecoveryRevision(value => value + 1)
    }, { signal: events.signal })
    // Plan B deliberately does NOT subscribe onOpenRequested: the shell always
    // denies guest window.open and external links are ignored (no system-browser
    // branch). Same-site navigation happens inside the guest on its own.
  }, [bridge, nativeBrowser, reservation])

  useEffect(() => {
    if (lastReload.current === state.websiteReloadRevision) return
    lastReload.current = state.websiteReloadRevision
    if (guest.current === null || reservation === null) {
      if (nativeBrowser !== undefined && authorized) setRecoveryRevision(value => value + 1)
      return
    }
    reloadGuest.current?.()
  }, [bridge, nativeBrowser, reservation, authorized, state.websiteReloadRevision])

  useEffect(() => () => { guestEvents.current?.abort() }, [])

  const activeReservation = reservation !== null && reservation.generation === state.authorizationGeneration
    && authorized ? reservation : null
  if (activeReservation === null) {
    return createElement('div', { className: 'dsh-chat-entry-web-status', role: 'status' },
      translate(state.language, '正在加载 DeepSeek 官网…'))
  }
  return createElement('div', { className: 'dsh-chat-entry-web' },
    createElement('webview', {
      key: activeReservation.native.lease,
      ref: attachGuest,
      className: 'dsh-chat-entry-webview',
      ...websiteGuestAttributes(activeReservation.native),
      'aria-label': translate(state.language, 'DeepSeek 官网聊天'),
    }))
}
