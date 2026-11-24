import { useEffect, useSyncExternalStore } from 'react'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type { ChatEntryBridge, ChatEntryViewState } from './bridge.js'
import { translate } from './i18n.js'
import { ensureChatEntryStyles } from './styles.js'
import { WebsiteSurface } from './web-surface.js'

function websiteStatus(state: ChatEntryViewState): { kind: 'loading' | 'ready' | 'signed-out' | 'offline'; label: string } {
  if (state.websiteError || state.authorization.status === 'unavailable') {
    return { kind: 'offline', label: translate(state.language, '离线') }
  }
  if (state.websiteLoading) return { kind: 'loading', label: translate(state.language, '加载中') }
  if (state.websiteSignedIn) return { kind: 'ready', label: translate(state.language, '就绪') }
  return { kind: 'signed-out', label: translate(state.language, '未登录') }
}

export function ChatPanel({ bridge }: PropsRuntime<'main'> & { readonly bridge: ChatEntryBridge }) {
  const state = useSyncExternalStore(bridge.subscribe, bridge.getSnapshot, bridge.getSnapshot)
  useEffect(() => { ensureChatEntryStyles(document) }, [])
  const status = websiteStatus(state)
  const errorText = state.websiteSessionError !== null
    ? translate(state.language, state.websiteSessionError)
    : state.connectionError
  return (
    <div className="dsh-chat-entry-panel">
      <div className="dsh-chat-entry-toolbar">
        <span className="dsh-chat-entry-title">{translate(state.language, 'DeepSeek 聊天')}</span>
        <span className="dsh-chat-entry-status" data-state={status.kind} role="status">
          <span className="dsh-chat-entry-dot" aria-hidden="true" />
          {status.label}
        </span>
        <button type="button" className="dsh-chat-entry-refresh" onClick={() => bridge.reloadWebsite()}>
          {translate(state.language, '刷新')}
        </button>
      </div>
      {errorText !== null && <p className="dsh-chat-entry-error" role="alert">{errorText}</p>}
      <WebsiteSurface bridge={bridge} />
    </div>
  )
}
