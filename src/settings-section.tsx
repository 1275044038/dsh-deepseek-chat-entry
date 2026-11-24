import { useEffect, useState, useSyncExternalStore } from 'react'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type { ConfigForm } from '@deepseek-ai/dsh-client-ui-settings/client'
import type { ChatEntryBridge, WebsiteSessionInspection } from './bridge.js'
import { translate, type ChatLanguage } from './i18n.js'

const INSPECTION_KEYS: Record<WebsiteSessionInspection | 'loading', string> = {
  loading: '读取中…',
  stored: '已记忆',
  empty: '未记忆',
  unavailable: '不可用（当前 profile 不支持持久化）',
  error: '读取失败',
}

export function ChatEntrySettingsSection({ bridge, close, form }: PropsRuntime<'settings.section'> & {
  readonly bridge: ChatEntryBridge
  form: ConfigForm<Record<string, never>>
}) {
  const state = useSyncExternalStore(bridge.subscribe, bridge.getSnapshot, bridge.getSnapshot)
  const [formSnapshot, setFormSnapshot] = useState(() => form.getSnapshot())
  const [inspection, setInspection] = useState<WebsiteSessionInspection | 'loading'>('loading')
  const [clearing, setClearing] = useState(false)
  const [cleared, setCleared] = useState(false)
  const [clearError, setClearError] = useState<string | null>(null)
  useEffect(() => form.subscribe(() => setFormSnapshot(form.getSnapshot())), [form])
  useEffect(() => {
    let active = true
    setInspection('loading')
    void bridge.inspectWebsiteSession().then(value => { if (active) setInspection(value) })
    return () => { active = false }
  }, [bridge, state.authorizationGeneration])
  const onClear = () => {
    if (clearing) return
    setClearing(true)
    setCleared(false)
    setClearError(null)
    void bridge.clearWebsiteSession().then(ok => {
      if (ok) { setCleared(true); setInspection('empty') }
      else setClearError('无法清除 CHAT 登录。')
    }).catch(() => setClearError('无法清除 CHAT 登录。')).finally(() => setClearing(false))
  }
  const inspectionLabel = (language: ChatLanguage | null, value: WebsiteSessionInspection | 'loading'): string =>
    translate(language, INSPECTION_KEYS[value])
  return (
    <div className="dsh-chat-entry-settings">
      <div className="dsh-chat-entry-settings-head">
        <h3>{translate(state.language, 'DeepSeek 聊天')}</h3>
        <button type="button" onClick={close}>{translate(state.language, '关闭')}</button>
      </div>
      <p className="dsh-chat-entry-settings-desc">{translate(state.language, '在 DSH 内使用 DeepSeek 官网聊天。登录记忆只保存官网授权的三个固定 key，不读聊天正文、Cookie 或密码。')}</p>
      {formSnapshot.status === 'unavailable' ? (
        <p role="status">{translate(state.language, '设置不可用')}</p>
      ) : (
        <div className="dsh-chat-entry-settings-row">
          <span>{translate(state.language, '官网登录记忆')}</span>
          <span role="status">{inspectionLabel(state.language, inspection)}</span>
          <button type="button" onClick={onClear} disabled={clearing}>{translate(state.language, clearing ? '清除中…' : '清除登录')}</button>
        </div>
      )}
      {cleared && <p role="status">{translate(state.language, '已清除官网登录记忆。')}</p>}
      {clearError !== null && <p role="alert">{translate(state.language, clearError)}</p>}
    </div>
  )
}
