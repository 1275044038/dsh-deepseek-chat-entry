const STYLE_ID = 'dsh-chat-entry-styles'

const CSS = [
  '.dsh-chat-entry-panel{display:flex;flex-direction:column;height:100%;min-width:0;min-height:0;}',
  '.dsh-chat-entry-toolbar{display:flex;align-items:center;gap:8px;flex:0 0 auto;padding:8px 12px;border-bottom:1px solid rgba(128,128,128,.2);}',
  '.dsh-chat-entry-title{font-size:13px;font-weight:600;}',
  '.dsh-chat-entry-status{display:inline-flex;align-items:center;gap:6px;font-size:12px;opacity:.85;}',
  '.dsh-chat-entry-dot{width:8px;height:8px;border-radius:50%;background:currentColor;}',
  '.dsh-chat-entry-status[data-state="ready"]{color:#22c55e;}',
  '.dsh-chat-entry-status[data-state="loading"]{color:#eab308;}',
  '.dsh-chat-entry-status[data-state="signed-out"]{color:#94a3b8;}',
  '.dsh-chat-entry-status[data-state="offline"]{color:#ef4444;}',
  '.dsh-chat-entry-refresh{margin-left:auto;font-size:12px;padding:4px 10px;border-radius:8px;border:1px solid rgba(128,128,128,.3);background:transparent;color:inherit;cursor:pointer;}',
  '.dsh-chat-entry-error{flex:0 0 auto;margin:0;padding:6px 12px;font-size:12px;color:#ef4444;}',
  '.dsh-chat-entry-web{position:relative;flex:1 1 auto;min-height:0;display:flex;overflow:auto;}',
  '.dsh-chat-entry-webview{display:flex;flex:1 1 auto;width:100%;height:100%;min-width:1024px;border:0;}',
  '.dsh-chat-entry-web-status{display:flex;align-items:center;justify-content:center;height:100%;font-size:13px;opacity:.7;}',
  '.dsh-chat-entry-settings{display:flex;flex-direction:column;gap:10px;padding:12px;}',
  '.dsh-chat-entry-settings-head{display:flex;align-items:center;justify-content:space-between;}',
  '.dsh-chat-entry-settings-head h3{margin:0;font-size:14px;}',
  '.dsh-chat-entry-settings-desc{margin:0;font-size:12px;opacity:.8;}',
  '.dsh-chat-entry-settings-row{display:flex;align-items:center;gap:10px;font-size:13px;}',
  '.dsh-chat-entry-settings-row button{margin-left:auto;}',
].join('')

// Idempotent: the keyed main panel mounts/unmounts on every navigation, so the
// stylesheet is injected once per document and never duplicated.
export function ensureChatEntryStyles(doc: Document): void {
  if (doc.getElementById(STYLE_ID) !== null) return
  const style = doc.createElement('style')
  style.id = STYLE_ID
  style.textContent = CSS
  doc.head.appendChild(style)
}
