# dsh-deepseek-chat-entry

在 DSH 桌面版左侧导航添加「DeepSeek 聊天」入口：主内容区嵌入真实 DeepSeek 官网（https://chat.deepseek.com），
保留 DSH 原生会话列表、右栏与输入框。

## 功能
- 左侧导航行 + 主面板工具条（标题 / 状态点：加载中、就绪、未登录、离线 / 刷新）。
- 官网登录记忆：只保存官网授权的三个固定 key（userToken、__appKit_userInfo、deepseek-device-id:chat），
  经 DSH 官方 credentials 按 profile 加密保存；重启 DSH 自动恢复登录。
- 设置页「DeepSeek 聊天」：显示登录记忆状态，一键清除登录。
- 离开入口即释放网页 guest（不占用主窗 F12）；网页分区存储保留，回来免重复登录。
- **@ 引用官网对话**：在 DSH 输入框打 `@` → 「DeepSeek 对话」分组列出你的官网会话标题（可按关键词过滤）；
  选中插入一个会话 chip，发送时自动用**当前会话模型**把该对话压缩成摘要并注入模型上下文，让 DSH agent 带着官网讨论的结论执行任务。

## @ 引用官网对话
1. 先在「DeepSeek 聊天」面板登录官网（捕获授权 token）。
2. 在 DSH 输入框输入 `@`，选择「DeepSeek 对话」分组里的一条会话。
3. 写上你的任务并发送：宿主用已捕获的 token 调官网 API 读取**你选中的那一条**对话正文，
   用当前会话模型生成摘要（保留关键事实/决定/代码/待办，使用原语言），仅把摘要文本注入上下文。
4. 未登录或 token 过期时会优雅报错并阻止发送，提示打开聊天面板刷新登录。

## 安装
在 DSH 桌面版（0.2.2 线）插件管理中安装 npm 包 `dsh-deepseek-chat-entry`。

## 限制
- 仅 DSH 桌面版可用；纯 Web 环境不显示入口（运行时门控，官方无安装期拒绝机制）。
- 官网原样呈现，不隐藏官网侧栏/顶部；面板最小宽度 1024px。
- 网页内 window.open 被壳拒绝，本插件不处理外链（不会跳转系统浏览器）；下载与敏感权限被壳禁止。

## 隐私
- 嵌入面板本身不读聊天正文、Cookie、密码或应用私有状态；不注入 preload/IPC；不覆盖网页全局 API。
- 登录记忆只保存官网授权的三个固定 key，经 DSH 官方 credentials 按 profile 加密保存。
- **@ 引用功能**只读取你**主动选中的那一条**官网对话正文用于生成摘要，不读取其它会话；
  注入模型上下文的只有摘要文本。官网 token 仅对宿主可见，**绝不暴露给模型**，也不读 Cookie/密码。

---

# English

Adds a "DeepSeek Chat" row to the DSH Desktop sidebar. The main area embeds the real
https://chat.deepseek.com website while keeping the native DSH session list, right bar and composer.

- Sign-in memory stores only the three fixed website authorization keys via official DSH credentials,
  scoped per profile; sign-in is restored automatically after a DSH restart.
- Settings section shows sign-in memory status and provides "Clear sign-in".
- Leaving the panel releases the webview guest immediately (no F12 capture); partition storage persists.
- **@-reference official conversations**: type `@` in the DSH composer to list your website conversation
  titles (filterable); picking one inserts a session chip. On send, the Host reads **only that selected**
  conversation via the website API, summarizes it with the **current session model**, and injects just the
  summary text into the model context. Missing/expired sign-in fails gracefully and blocks the send.
- Desktop only: the entry is hidden in pure Web environments (runtime gate).
- The website is shown as-is (min width 1024px). window.open is denied by the shell; external links,
  downloads and sensitive permissions are not handled by this plugin.
- The embedded panel never reads chat content, cookies, passwords, or private app state. The optional
  @-reference feature reads only the single conversation you explicitly select to produce a summary; the
  website token stays Host-side and is never exposed to the model.

Install `dsh-deepseek-chat-entry` from the DSH Desktop (0.2.2 line) plugin manager.

## License
MIT © 1275044038
