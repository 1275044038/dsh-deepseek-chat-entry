import assert from 'node:assert/strict'
import { test } from 'node:test'
import { dismissWebsiteEnvironmentNotice, websiteEnvironmentNoticeScript } from '../src/website-notice.js'

// Minimal fake DOM exercising only the selectors the dismissal uses.
interface El {
  tag: string; classes: Set<string>; attrs: Record<string, string>; text: string;
  parent: El | null; children: El[]; rect: { width: number; height: number };
  computed: { display: string; visibility: string }; isConnected: boolean;
  clicked: number;
}
function el(tag: string, opts: Partial<{ classes: string[]; attrs: Record<string, string>; text: string; rect: { width: number; height: number }; display: string; visibility: string; hidden: boolean }> = {}): El {
  return { tag, classes: new Set(opts.classes ?? []), attrs: opts.attrs ?? {}, text: opts.text ?? '',
    parent: null, children: [], rect: opts.rect ?? { width: 100, height: 40 },
    computed: { display: opts.display ?? 'block', visibility: opts.visibility ?? 'visible' },
    isConnected: opts.hidden !== true, clicked: 0 }
}
function add(parent: El, child: El): El { child.parent = parent; parent.children.push(child); return child }
function matchesCompound(node: El, compound: string): boolean {
  // compound like 'button', '.cls', '[attr]', '[attr="v"]', 'form' — combined without spaces.
  const parts = compound.match(/(^[a-zA-Z][\w-]*)|(\.[\w-]+)|(\[[^\]]+\])/g) ?? []
  return parts.every(part => {
    if (part.startsWith('.')) return node.classes.has(part.slice(1))
    if (part.startsWith('[')) {
      const m = part.slice(1, -1).match(/^([\w-]+)(?:=["']?([^"']*)["']?)?$/)
      if (!m) return false
      const [, name, value] = m
      if (!(name in node.attrs)) return false
      return value === undefined || node.attrs[name] === value
    }
    return node.tag === part
  })
}
function matchesSelector(node: El, selector: string): boolean {
  return selector.split(',').some(group => matchesCompound(node, group.trim()))
}
function descendants(node: El): El[] { return node.children.flatMap(c => [c, ...descendants(c)]) }
function queryAll(node: El, selector: string): El[] { return descendants(node).filter(d => matchesSelector(d, selector)) }
function closest(node: El, selector: string): El | null {
  let cur: El | null = node
  while (cur) { if (matchesSelector(cur, selector)) return cur; cur = cur.parent }
  return null
}
const wrapCache = new WeakMap<El, ReturnType<typeof buildWrapper>>()
function buildWrapper(node: El) {
  return {
    ...node,
    getBoundingClientRect: () => node.rect,
    hasAttribute: (n: string) => n in node.attrs,
    setAttribute: (n: string, v: string) => { node.attrs[n] = v },
    querySelector: (s: string) => { const r = queryAll(node, s); return r.length ? wrap(r[0]) : null },
    querySelectorAll: (s: string) => queryAll(node, s).map(wrap),
    closest: (s: string) => { const r = closest(node, s); return r ? wrap(r) : null },
    matches: (s: string) => matchesSelector(node, s),
    click: () => { node.clicked++ },
    get textContent() { return node.text },
    get isConnected() { return node.isConnected },
  }
}
// Stable identity per underlying node: the dismissal compares closest(...) === dialog.
function wrap(node: El) {
  let w = wrapCache.get(node)
  if (!w) { w = buildWrapper(node); wrapCache.set(node, w) }
  return w
}
function makeDoc(origin: string, root: El) {
  return { location: { origin }, defaultView: { getComputedStyle: (n: El) => n.computed },
    querySelectorAll: (s: string) => queryAll(root, s).map(wrap) } as unknown as Document
}
function noticeDialog(title: string, body: string, opts: { withInput?: boolean; attempted?: boolean; closeCount?: number } = {}) {
  const root = el('body')
  const dialog = add(root, el('div', { classes: ['ds-modal-content'], attrs: { role: 'dialog' } }))
  add(dialog, el('div', { classes: ['ds-modal-content__title'], text: title }))
  add(dialog, el('div', { classes: ['ds-modal-content__main'], text: body }))
  if (opts.withInput) add(dialog, el('input'))
  const closes = opts.closeCount ?? 1
  for (let i = 0; i < closes; i++) add(dialog, el('button', { classes: ['ds-modal-content__close'] }))
  if (opts.attempted) dialog.attrs['data-dsh-chat-entry-environment-notice-closed'] = ''
  return { root, dialog, closes: dialog.children.filter(c => c.classes.has('ds-modal-content__close')) }
}
const ZH = ['使用环境异常', '当前页面的使用环境可能存在数据和隐私泄露风险，为保障安全，建议您使用我们的官方产品。']

test('dismisses the exact zh environment notice via its own close button', () => {
  const { root, dialog, closes } = noticeDialog(ZH[0], ZH[1])
  dismissWebsiteEnvironmentNotice(makeDoc('https://chat.deepseek.com', root))
  assert.equal(closes[0].clicked, 1)
  assert.ok('data-dsh-chat-entry-environment-notice-closed' in dialog.attrs)
})
test('dismisses the en environment notice', () => {
  const { root, closes } = noticeDialog('Abnormal usage environment', 'The current usage environment may pose data and privacy risks. For your security, we recommend using our official product.')
  dismissWebsiteEnvironmentNotice(makeDoc('https://chat.deepseek.com', root))
  assert.equal(closes[0].clicked, 1)
})
test('ignores a foreign origin', () => {
  const { root, closes } = noticeDialog(ZH[0], ZH[1])
  dismissWebsiteEnvironmentNotice(makeDoc('https://evil.example.com', root))
  assert.equal(closes[0].clicked, 0)
})
test('never touches a dialog containing a form input (login)', () => {
  const { root, closes } = noticeDialog(ZH[0], ZH[1], { withInput: true })
  dismissWebsiteEnvironmentNotice(makeDoc('https://chat.deepseek.com', root))
  assert.equal(closes[0].clicked, 0)
})
test('ignores a non-matching title', () => {
  const { root, closes } = noticeDialog('别的标题', ZH[1])
  dismissWebsiteEnvironmentNotice(makeDoc('https://chat.deepseek.com', root))
  assert.equal(closes[0].clicked, 0)
})
test('is idempotent once attempted', () => {
  const { root, closes } = noticeDialog(ZH[0], ZH[1], { attempted: true })
  dismissWebsiteEnvironmentNotice(makeDoc('https://chat.deepseek.com', root))
  assert.equal(closes[0].clicked, 0)
})
test('script serializes the dismissal against document with no interpolated args', () => {
  const script = websiteEnvironmentNoticeScript()
  assert.ok(script.includes('dismissWebsiteEnvironmentNotice'))
  assert.ok(script.endsWith('(document)'))
})
