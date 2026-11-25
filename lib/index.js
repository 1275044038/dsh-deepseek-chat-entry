var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __knownSymbol = (name2, symbol) => (symbol = Symbol[name2]) ? symbol : Symbol.for("Symbol." + name2);
var __typeError = (msg) => {
  throw TypeError(msg);
};
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
var __decoratorStart = (base) => [, , , __create(base?.[__knownSymbol("metadata")] ?? null)];
var __decoratorStrings = ["class", "method", "getter", "setter", "accessor", "field", "value", "get", "set"];
var __expectFn = (fn) => fn !== void 0 && typeof fn !== "function" ? __typeError("Function expected") : fn;
var __decoratorContext = (kind, name2, done, metadata, fns) => ({ kind: __decoratorStrings[kind], name: name2, metadata, addInitializer: (fn) => done._ ? __typeError("Already initialized") : fns.push(__expectFn(fn || null)) });
var __decoratorMetadata = (array, target) => __defNormalProp(target, __knownSymbol("metadata"), array[3]);
var __runInitializers = (array, flags, self, value) => {
  for (var i = 0, fns = array[flags >> 1], n = fns && fns.length; i < n; i++) flags & 1 ? fns[i].call(self) : value = fns[i].call(self, value);
  return value;
};
var __decorateElement = (array, flags, name2, decorators, target, extra) => {
  var fn, it, done, ctx, access, k = flags & 7, s = !!(flags & 8), p = !!(flags & 16);
  var j = k > 3 ? array.length + 1 : k ? s ? 1 : 2 : 0, key = __decoratorStrings[k + 5];
  var initializers = k > 3 && (array[j - 1] = []), extraInitializers = array[j] || (array[j] = []);
  var desc = k && (!p && !s && (target = target.prototype), k < 5 && (k > 3 || !p) && __getOwnPropDesc(k < 4 ? target : { get [name2]() {
    return __privateGet(this, extra);
  }, set [name2](x) {
    return __privateSet(this, extra, x);
  } }, name2));
  k ? p && k < 4 && __name(extra, (k > 2 ? "set " : k > 1 ? "get " : "") + name2) : __name(target, name2);
  for (var i = decorators.length - 1; i >= 0; i--) {
    ctx = __decoratorContext(k, name2, done = {}, array[3], extraInitializers);
    if (k) {
      ctx.static = s, ctx.private = p, access = ctx.access = { has: p ? (x) => __privateIn(target, x) : (x) => name2 in x };
      if (k ^ 3) access.get = p ? (x) => (k ^ 1 ? __privateGet : __privateMethod)(x, target, k ^ 4 ? extra : desc.get) : (x) => x[name2];
      if (k > 2) access.set = p ? (x, y) => __privateSet(x, target, y, k ^ 4 ? extra : desc.set) : (x, y) => x[name2] = y;
    }
    it = (0, decorators[i])(k ? k < 4 ? p ? extra : desc[key] : k > 4 ? void 0 : { get: desc.get, set: desc.set } : target, ctx), done._ = 1;
    if (k ^ 4 || it === void 0) __expectFn(it) && (k > 4 ? initializers.unshift(it) : k ? p ? extra = it : desc[key] = it : target = it);
    else if (typeof it !== "object" || it === null) __typeError("Object expected");
    else __expectFn(fn = it.get) && (desc.get = fn), __expectFn(fn = it.set) && (desc.set = fn), __expectFn(fn = it.init) && initializers.unshift(fn);
  }
  return k || __decoratorMetadata(array, target), desc && __defProp(target, name2, desc), p ? k ^ 4 ? extra : desc : target;
};
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
var __accessCheck = (obj, member, msg) => member.has(obj) || __typeError("Cannot " + msg);
var __privateIn = (member, obj) => Object(obj) !== obj ? __typeError('Cannot use the "in" operator on this value') : member.has(obj);
var __privateGet = (obj, member, getter) => (__accessCheck(obj, member, "read from private field"), getter ? getter.call(obj) : member.get(obj));
var __privateSet = (obj, member, value, setter) => (__accessCheck(obj, member, "write to private field"), setter ? setter.call(obj, value) : member.set(obj, value), value);
var __privateMethod = (obj, member, method) => (__accessCheck(obj, member, "access private method"), method);

// src/index.ts
import schema from "@deepseek-ai/schemastery";

// src/server.ts
import "@deepseek-ai/cordis";
import { createHash } from "node:crypto";
import { isAbsolute, resolve } from "node:path";
import { Remote, RemoteError, TypertRemoteService } from "@deepseek-ai/dsh-typert-protocol";

// src/authorization.ts
import { randomUUID } from "node:crypto";
var WEBSITE_PROFILE_PREFIX = "chat-profile:";
var PROFILE_CONTEXT_UNAVAILABLE = "profile-context-unavailable";
var AuthorizationAuthority = class {
  constructor(profileId, issueEpoch = randomUUID) {
    this.issueEpoch = issueEpoch;
    const epoch = issueEpoch();
    this.state = {
      status: "authorized",
      accountId: profileId ?? `chat-volatile:${epoch}`,
      epoch,
      error: profileId === null ? PROFILE_CONTEXT_UNAVAILABLE : null
    };
  }
  state;
  listeners = /* @__PURE__ */ new Set();
  closed = false;
  getSnapshot() {
    return { ...this.state };
  }
  subscribe(listener) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  publish(next) {
    this.state = next;
    for (const listener of this.listeners) listener();
  }
  refresh(_metadata) {
    if (this.closed) return Promise.reject(new Error("CHAT session service is disposed."));
    return Promise.resolve(this.getSnapshot());
  }
  async *watch(_metadata, signal) {
    let dirty = true;
    let wake;
    const changed = () => {
      dirty = true;
      wake?.();
    };
    const unsubscribe = this.subscribe(changed);
    signal.addEventListener("abort", changed, { once: true });
    try {
      while (!signal.aborted && !this.closed) {
        if (dirty) {
          dirty = false;
          yield this.getSnapshot();
          continue;
        }
        await new Promise((resolve2) => {
          wake = resolve2;
          if (dirty || signal.aborted || this.closed) resolve2();
        });
      }
    } finally {
      unsubscribe();
      signal.removeEventListener("abort", changed);
    }
  }
  dispose() {
    if (this.closed) return;
    this.closed = true;
    this.publish({ status: "unauthorized", accountId: null, epoch: this.issueEpoch(), error: null });
    this.listeners.clear();
  }
};

// src/protocol.ts
import { z } from "zod";
var WEBSITE_SESSION_ORIGIN = "https://chat.deepseek.com";
var identifier = z.string().min(1).max(512);
var authorizationEpochSchema = identifier;
var clientMetadataSchema = z.strictObject({
  version: z.string().min(1).max(100),
  locale: z.string().min(1).max(100),
  timezoneOffsetSeconds: z.number().int().min(-86400).max(86400)
});
var authorizationSchema = z.strictObject({
  status: z.enum(["pending", "authorized", "unauthorized", "unavailable"]),
  accountId: identifier.nullable(),
  epoch: authorizationEpochSchema,
  error: z.string().max(100).nullable()
});
var websiteSessionSchema = z.strictObject({
  token: z.string().min(1).max(16384),
  userId: identifier,
  deviceId: z.string().uuid()
});
var chatIdentifierSchema = identifier;
var websiteConversationSchema = z.strictObject({
  id: z.string().min(1).max(512),
  title: z.string().max(2e3),
  updatedAt: z.number().int().min(0)
});
var strict = (name2, schema2) => ({
  mode: "strict",
  typeSymbol: `dsh-deepseek-chat-entry#${name2}`,
  create: () => schema2
});
var metadataParameter = {
  name: "metadata",
  wire: "metadata",
  source: "json",
  codec: strict("ChatEntryClientMetadata", clientMetadataSchema)
};
var epochParameter = {
  name: "epoch",
  wire: "epoch",
  source: "json",
  codec: strict("AuthorizationEpoch", authorizationEpochSchema)
};
var descriptor = (method, stream = false) => ({
  id: `dsh-deepseek-chat-entry#dshDeepseekChatEntry/${method}`,
  service: "dshDeepseekChatEntry",
  namespace: "dshDeepseekChatEntry",
  method,
  invocation: { kind: "direct" },
  parameters: [metadataParameter],
  cancellation: { parameter: "signal" },
  result: strict("AuthorizationState", authorizationSchema),
  ...stream ? { mode: "stream" } : {}
});
var websiteDescriptor = (method, save = false) => ({
  id: `dsh-deepseek-chat-entry#dshDeepseekChatEntry/${method}`,
  service: "dshDeepseekChatEntry",
  namespace: "dshDeepseekChatEntry",
  method,
  invocation: { kind: "direct" },
  parameters: [metadataParameter, epochParameter, ...save ? [{
    name: "session",
    wire: "session",
    source: "json",
    codec: strict("WebsiteSession", websiteSessionSchema)
  }] : []],
  cancellation: { parameter: "signal" },
  result: method === "loadWebsiteSession" ? strict("OptionalWebsiteSession", websiteSessionSchema.nullable()) : strict("WebsiteSessionOperationResult", z.boolean())
});
var sessionIdParameter = {
  name: "sessionId",
  wire: "sessionId",
  source: "json",
  codec: strict("DshSessionId", identifier)
};
var conversationIdParameter = {
  name: "conversationId",
  wire: "conversationId",
  source: "json",
  codec: strict("WebsiteConversationId", identifier)
};
var listConversationsDescriptor = {
  id: "dsh-deepseek-chat-entry#dshDeepseekChatEntry/listWebsiteConversations",
  service: "dshDeepseekChatEntry",
  namespace: "dshDeepseekChatEntry",
  method: "listWebsiteConversations",
  invocation: { kind: "direct" },
  parameters: [metadataParameter, epochParameter],
  cancellation: { parameter: "signal" },
  result: strict("WebsiteConversationList", z.array(websiteConversationSchema).max(200))
};
var summarizeConversationDescriptor = {
  id: "dsh-deepseek-chat-entry#dshDeepseekChatEntry/summarizeWebsiteConversation",
  service: "dshDeepseekChatEntry",
  namespace: "dshDeepseekChatEntry",
  method: "summarizeWebsiteConversation",
  invocation: { kind: "direct" },
  parameters: [metadataParameter, epochParameter, sessionIdParameter, conversationIdParameter],
  cancellation: { parameter: "signal" },
  result: strict("WebsiteConversationSummary", z.string().min(1).max(2e4))
};
var CHAT_ENTRY_DESCRIPTORS = [
  descriptor("authorization"),
  descriptor("watchAuthorization", true),
  websiteDescriptor("loadWebsiteSession"),
  websiteDescriptor("saveWebsiteSession", true),
  websiteDescriptor("clearWebsiteSession"),
  listConversationsDescriptor,
  summarizeConversationDescriptor
];
var CHAT_ENTRY_HOST_CONTRIBUTION = {
  package: "dsh-deepseek-chat-entry",
  face: "host",
  schemas: [],
  // Website credentials are never model-callable services or objects.
  model: { services: [], events: [], objects: [] },
  invocations: CHAT_ENTRY_DESCRIPTORS
};

// src/website-session-store.ts
import { credentialKey } from "@deepseek-ai/dsh-credentials";
import { z as z2 } from "zod";
var grantSchema = z2.strictObject({
  version: z2.literal(2),
  origin: z2.literal(WEBSITE_SESSION_ORIGIN),
  profileId: z2.string().regex(/^chat-profile:[a-f0-9]{64}$/),
  websiteAccountId: z2.string().min(1).max(512).nullable(),
  session: websiteSessionSchema.nullable()
});
var WebsiteSessionStore = class {
  constructor(credentials, authority, profileId) {
    this.credentials = credentials;
    this.authority = authority;
    this.profileId = profileId;
    this.profileKey = profileId !== null && /^chat-profile:[a-f0-9]{64}$/.test(profileId) ? credentialKey("dsh-deepseek-chat-entry", `website-${profileId.slice(WEBSITE_PROFILE_PREFIX.length)}`) : null;
  }
  profileKey;
  pending = Promise.resolve();
  writeRevision = 0;
  clearing = false;
  /** Capture before the controller awaits its fence, so an already-issued RPC stays fenced. */
  captureRevision() {
    return this.writeRevision;
  }
  current(fence, signal) {
    const state = this.authority.getSnapshot();
    return !signal.aborted && state.status === "authorized" && state.error === (this.profileKey === null ? PROFILE_CONTEXT_UNAVAILABLE : null) && (this.profileKey === null || fence.accountId === this.profileId) && state.accountId === fence.accountId && state.epoch === fence.epoch;
  }
  unchanged(fence, signal, revision) {
    return !this.clearing && revision === this.writeRevision && this.current(fence, signal);
  }
  sessionFromRecord(payload) {
    const grant = grantSchema.safeParse(payload);
    if (!grant.success || grant.data.profileId !== this.profileId || !grant.data.session || grant.data.session.userId !== grant.data.websiteAccountId) return null;
    return { ...grant.data.session };
  }
  payload(session) {
    return {
      version: 2,
      origin: WEBSITE_SESSION_ORIGIN,
      profileId: this.profileId,
      websiteAccountId: session?.userId ?? null,
      session
    };
  }
  /** Keep clearing and writes ordered; queued work checks its captured generation again. */
  async exclusive(operation) {
    const previous = this.pending;
    let release;
    this.pending = new Promise((resolve2) => {
      release = resolve2;
    });
    await previous;
    try {
      return await operation();
    } finally {
      release();
    }
  }
  async load(fence, signal, revision = this.writeRevision) {
    const profileKey = this.profileKey;
    if (profileKey === null) return null;
    try {
      return await this.exclusive(async () => {
        if (!this.unchanged(fence, signal, revision)) return null;
        const record = await this.credentials.readRecord(profileKey);
        if (!this.unchanged(fence, signal, revision)) return null;
        if (record !== void 0) {
          return record.kind === "grant" ? this.sessionFromRecord(record.payload) : null;
        }
        return null;
      });
    } catch {
      throw new Error("\u65E0\u6CD5\u8BFB\u53D6 CHAT \u767B\u5F55\u3002");
    }
  }
  async save(fence, session, signal, revision = this.writeRevision) {
    const profileKey = this.profileKey;
    if (profileKey === null) return false;
    const parsed = websiteSessionSchema.safeParse(session);
    if (!parsed.success || !this.unchanged(fence, signal, revision)) return false;
    try {
      return await this.exclusive(async () => {
        if (!this.unchanged(fence, signal, revision)) return false;
        let accepted = false;
        await this.credentials.modifyRecord(profileKey, async () => {
          if (!this.unchanged(fence, signal, revision)) return void 0;
          accepted = true;
          return { kind: "grant", payload: this.payload(parsed.data) };
        });
        return accepted && this.unchanged(fence, signal, revision);
      });
    } catch {
      throw new Error("\u65E0\u6CD5\u4FDD\u5B58 CHAT \u767B\u5F55\u3002");
    }
  }
  async clear(fence, signal) {
    const profileKey = this.profileKey;
    if (profileKey === null) return this.current(fence, signal);
    if (this.clearing || !this.current(fence, signal)) return false;
    this.clearing = true;
    this.writeRevision++;
    try {
      return await this.exclusive(async () => {
        if (!this.current(fence, signal)) return false;
        let cleared = false;
        await this.credentials.modifyRecord(profileKey, async () => {
          if (!this.current(fence, signal)) return void 0;
          cleared = true;
          return { kind: "grant", payload: this.payload(null) };
        });
        return cleared && this.current(fence, signal);
      });
    } catch {
      throw new Error("\u65E0\u6CD5\u6E05\u9664 CHAT \u767B\u5F55\u3002");
    } finally {
      this.clearing = false;
    }
  }
};

// src/website-api.ts
var WEBSITE_API_ORIGIN = "https://chat.deepseek.com";
var BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
var WebsiteApiError = class extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
    this.name = "WebsiteApiError";
  }
};
function toMillis(value) {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return n < 1e12 ? Math.round(n * 1e3) : Math.round(n);
}
function websiteHeaders(session, metadata) {
  return {
    "Authorization": `Bearer ${session.token}`,
    "x-device-id": session.deviceId,
    "x-client-platform": "web",
    "x-client-version": "2.0.0",
    "x-client-locale": metadata.locale.startsWith("zh") ? "zh_CN" : "en_US",
    "x-client-timezone-offset": String(metadata.timezoneOffsetSeconds),
    "Accept": "application/json",
    "User-Agent": BROWSER_UA,
    "Referer": WEBSITE_API_ORIGIN + "/",
    "Origin": WEBSITE_API_ORIGIN
  };
}
async function callApi(path, query, session, metadata, signal, fetchImpl) {
  const url = new URL(path, WEBSITE_API_ORIGIN);
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  let res;
  try {
    res = await fetchImpl(url.toString(), { headers: websiteHeaders(session, metadata), signal });
  } catch {
    throw new WebsiteApiError("\u65E0\u6CD5\u8FDE\u63A5 DeepSeek \u5B98\u7F51\uFF0C\u8BF7\u68C0\u67E5\u7F51\u7EDC\u3002", "network");
  }
  if (res.status === 401 || res.status === 403) throw new WebsiteApiError("\u5B98\u7F51\u767B\u5F55\u5DF2\u5931\u6548\uFF0C\u8BF7\u6253\u5F00 DeepSeek \u804A\u5929\u9762\u677F\u91CD\u65B0\u767B\u5F55\u3002", "unauthorized");
  let body;
  try {
    body = await res.json();
  } catch {
    throw new WebsiteApiError("\u5B98\u7F51\u8FD4\u56DE\u4E86\u65E0\u6CD5\u89E3\u6790\u7684\u54CD\u5E94\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5\u3002", "shape");
  }
  const envelope = body;
  if (envelope.code === 40003) throw new WebsiteApiError("\u5B98\u7F51\u767B\u5F55\u5DF2\u8FC7\u671F\uFF0C\u8BF7\u6253\u5F00 DeepSeek \u804A\u5929\u9762\u677F\u5237\u65B0\u767B\u5F55\u3002", "token-expired");
  if (envelope.code !== 0 || !envelope.data || envelope.data.biz_code !== 0) {
    throw new WebsiteApiError("\u5B98\u7F51\u63A5\u53E3\u8FD4\u56DE\u9519\u8BEF\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5\u3002", "shape");
  }
  return envelope.data.biz_data;
}
async function listWebsiteConversations(session, metadata, signal, fetchImpl = globalThis.fetch) {
  const data = await callApi("/api/v0/chat_session/fetch_page", { count: "50", mode: "lte" }, session, metadata, signal, fetchImpl);
  const rows = Array.isArray(data?.chat_sessions) ? data.chat_sessions : [];
  const out = [];
  for (const row of rows) {
    const r = row;
    if (typeof r.id !== "string" || r.id.length === 0) continue;
    out.push({
      id: r.id.slice(0, 512),
      title: (typeof r.title === "string" && r.title.trim() ? r.title.trim() : "\u672A\u547D\u540D\u5BF9\u8BDD").slice(0, 2e3),
      updatedAt: toMillis(r.updated_at)
    });
    if (out.length >= 50) break;
  }
  return out;
}
async function fetchWebsiteConversation(session, conversationId, metadata, signal, fetchImpl = globalThis.fetch) {
  const data = await callApi("/api/v0/chat/history_messages", { chat_session_id: conversationId }, session, metadata, signal, fetchImpl);
  const rows = Array.isArray(data?.chat_messages) ? data.chat_messages : [];
  const messages = [];
  for (const row of rows) {
    const r = row;
    const role = r.role === "USER" ? "USER" : r.role === "ASSISTANT" ? "ASSISTANT" : null;
    if (!role) continue;
    const fragments = Array.isArray(r.fragments) ? r.fragments : [];
    const text = fragments.map((f) => {
      const c = f.content;
      return typeof c === "string" ? c : "";
    }).join("").trim();
    if (text) messages.push({ role, text });
  }
  if (messages.length === 0) throw new WebsiteApiError("\u8BE5\u5BF9\u8BDD\u6CA1\u6709\u53EF\u8BFB\u53D6\u7684\u5185\u5BB9\u3002", "empty");
  return messages;
}
function renderTranscript(messages, maxBytes) {
  const lines = messages.map((m) => `${m.role === "USER" ? "\u7528\u6237" : "\u52A9\u624B"}\uFF1A${m.text}`);
  const kept = [];
  let bytes = 0;
  for (let i = lines.length - 1; i >= 0; i--) {
    const lineBytes = Buffer.byteLength(lines[i], "utf8") + 1;
    if (bytes + lineBytes > maxBytes && kept.length > 0) break;
    kept.unshift(lines[i]);
    bytes += lineBytes;
  }
  const truncated = kept.length < lines.length;
  const body = kept.join("\n");
  return truncated ? `\uFF08\u524D\u6587\u5DF2\u7701\u7565\uFF09
${body}` : body;
}

// src/website-summary.ts
import { createUserMessage, BlockAssembler } from "@deepseek-ai/dsh-llm";
var SUMMARY_MAX_INPUT_BYTES = 6e4;
var SUMMARY_MAX_OUTPUT_TOKENS = 600;
var SUMMARY_TIMEOUT_MS = 6e4;
var SYSTEM_PROMPT = "\u4F60\u662F\u5BF9\u8BDD\u6458\u8981\u52A9\u624B\u3002\u8BF7\u628A\u4E0B\u9762\u8FD9\u6BB5\u7528\u6237\u4E0E DeepSeek \u5B98\u7F51\u52A9\u624B\u7684\u5BF9\u8BDD\u538B\u7F29\u6210\u7B80\u6D01\u6458\u8981\uFF0C\u4FDD\u7559\u5173\u952E\u4E8B\u5B9E\u3001\u51B3\u5B9A\u3001\u4EE3\u7801\u7247\u6BB5\u4E0E\u5F85\u529E\u4E8B\u9879\uFF0C\u7701\u7565\u5BD2\u6684\u4E0E\u91CD\u590D\u3002\u4F7F\u7528\u5BF9\u8BDD\u539F\u672C\u7684\u8BED\u8A00\u8F93\u51FA\u3002\u53EA\u8F93\u51FA\u6458\u8981\u6B63\u6587\uFF0C\u4E0D\u8981\u989D\u5916\u89E3\u91CA\u3002";
function resolveSessionRoute(ctx, sessionId) {
  const sessions = ctx.get("sessions");
  const projections = ctx.get("sessionProjections");
  if (!sessions || !projections) return null;
  const session = sessions.list().find((s) => s.id === sessionId);
  if (!session) return null;
  const snapshot = projections.snapshot(session, ["modelSelection"]);
  const selection = snapshot.values.modelSelection;
  const route = selection?.next ?? selection?.lastUsed;
  return route && typeof route.provider === "string" && typeof route.model === "string" ? { provider: route.provider, model: route.model } : null;
}
function withDeadline(signal, ms) {
  const controller = new AbortController();
  const onAbort = () => controller.abort(signal.reason);
  if (signal.aborted) controller.abort(signal.reason);
  else signal.addEventListener("abort", onAbort, { once: true });
  const timer = setTimeout(() => controller.abort(new Error("DEEPSEEK_CHAT_SUMMARY_TIMEOUT")), ms);
  return {
    signal: controller.signal,
    dispose() {
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
    }
  };
}
async function summarizeTranscript(ctx, sessionId, transcript, signal) {
  const llm = ctx.get("llm");
  if (!llm) throw new Error("DSH \u6A21\u578B\u670D\u52A1\u4E0D\u53EF\u7528\u3002");
  const route = resolveSessionRoute(ctx, sessionId);
  if (!route) throw new Error("\u65E0\u6CD5\u786E\u5B9A\u5F53\u524D\u4F1A\u8BDD\u6A21\u578B\uFF0C\u8BF7\u5148\u5728\u8BE5\u4F1A\u8BDD\u53D1\u9001\u4E00\u6761\u6D88\u606F\u3002");
  const messages = [createUserMessage({
    content: [{ type: "text", text: transcript }],
    source: { kind: "dsh-deepseek-chat-entry" }
  })];
  const callDeadline = withDeadline(signal, SUMMARY_TIMEOUT_MS);
  try {
    const call = await llm.prepareCall({ ...route, maxTokens: SUMMARY_MAX_OUTPUT_TOKENS }, callDeadline.signal);
    const options = {
      ...call.config,
      messages,
      system: SYSTEM_PROMPT,
      sessionId,
      purpose: "deepseek-chat-summary",
      signal: callDeadline.signal
    };
    const assembler = new BlockAssembler();
    for await (const chunk of call.stream(options)) {
      callDeadline.signal.throwIfAborted();
      assembler.push(chunk);
    }
    callDeadline.signal.throwIfAborted();
    const finish = assembler.finish;
    if (finish.kind === "error" || finish.kind === "aborted") {
      throw new Error(finish.failure.message);
    }
    const text = assembler.blocks().filter((b) => b.type === "text").map((b) => b.text).join("").trim();
    if (!text) throw new Error("\u6A21\u578B\u672A\u8FD4\u56DE\u6458\u8981\u3002");
    return text;
  } finally {
    callDeadline.dispose();
  }
}

// src/server.ts
var _summarizeWebsiteConversation_dec, _listWebsiteConversations_dec, _clearWebsiteSession_dec, _saveWebsiteSession_dec, _loadWebsiteSession_dec, _watchAuthorization_dec, _authorization_dec, _a, _init;
var ChatEntryController = class extends (_a = TypertRemoteService, _authorization_dec = [Remote], _watchAuthorization_dec = [Remote({ mode: "stream" })], _loadWebsiteSession_dec = [Remote], _saveWebsiteSession_dec = [Remote], _clearWebsiteSession_dec = [Remote], _listWebsiteConversations_dec = [Remote], _summarizeWebsiteConversation_dec = [Remote], _a) {
  constructor(ctx) {
    super(ctx, "dshDeepseekChatEntry");
    __runInitializers(_init, 5, this);
    __publicField(this, "authority");
    __publicField(this, "websiteSessions");
    __publicField(this, "hostCtx");
    this.hostCtx = ctx;
    const profile = ctx.get("profileContext");
    const dir = profile !== null && typeof profile === "object" && "dir" in profile ? profile.dir : void 0;
    const profileId = typeof dir === "string" && dir.length <= 16384 && isAbsolute(dir) && !dir.includes("\0") ? `${WEBSITE_PROFILE_PREFIX}${createHash("sha256").update(resolve(dir), "utf8").digest("hex")}` : null;
    this.authority = new AuthorizationAuthority(profileId);
    this.websiteSessions = new WebsiteSessionStore(ctx.credentials, this.authority, profileId);
    ctx.typert.register(CHAT_ENTRY_HOST_CONTRIBUTION);
    ctx.effect(() => () => {
      this.authority.dispose();
    }, "dsh-deepseek-chat-entry profile session lifetime");
  }
  async authorization(metadata, signal) {
    try {
      signal.throwIfAborted();
      const state = await this.authority.refresh(clientMetadataSchema.parse(metadata));
      signal.throwIfAborted();
      return state;
    } catch {
      throw new RemoteError("gateway/internal", "\u65E0\u6CD5\u8FDE\u63A5 CHAT \u767B\u5F55\u4FDD\u5B58\u670D\u52A1\uFF0C\u8BF7\u68C0\u67E5 DSH \u670D\u52A1\u3002", {});
    }
  }
  async *watchAuthorization(metadata, signal) {
    try {
      yield* this.authority.watch(clientMetadataSchema.parse(metadata), signal);
    } catch {
      throw new RemoteError("gateway/internal", "\u65E0\u6CD5\u8FDE\u63A5 CHAT \u767B\u5F55\u4FDD\u5B58\u670D\u52A1\uFF0C\u8BF7\u68C0\u67E5 DSH \u670D\u52A1\u3002", {});
    }
  }
  async websiteFence(metadata, epoch, signal) {
    signal.throwIfAborted();
    const expectedEpoch = authorizationEpochSchema.parse(epoch);
    const state = await this.authority.refresh(clientMetadataSchema.parse(metadata));
    signal.throwIfAborted();
    const current = this.authority.getSnapshot();
    if (state.status !== "authorized" || state.error !== null && state.error !== PROFILE_CONTEXT_UNAVAILABLE || !state.accountId || state.accountId.length > 512 || state.epoch !== expectedEpoch || current.status !== "authorized" || current.error !== state.error || current.accountId !== state.accountId || current.epoch !== expectedEpoch) return null;
    return { accountId: state.accountId, epoch: expectedEpoch };
  }
  async loadWebsiteSession(metadata, epoch, signal) {
    try {
      const revision = this.websiteSessions.captureRevision();
      const fence = await this.websiteFence(metadata, epoch, signal);
      return fence ? await this.websiteSessions.load(fence, signal, revision) : null;
    } catch {
      throw new RemoteError("gateway/internal", "\u65E0\u6CD5\u6062\u590D CHAT \u767B\u5F55\uFF0C\u8BF7\u91CD\u8BD5\u3002", {});
    }
  }
  async saveWebsiteSession(metadata, epoch, session, signal) {
    try {
      const revision = this.websiteSessions.captureRevision();
      const parsed = websiteSessionSchema.parse(session);
      const fence = await this.websiteFence(metadata, epoch, signal);
      return fence ? await this.websiteSessions.save(fence, parsed, signal, revision) : false;
    } catch {
      throw new RemoteError("gateway/internal", "\u65E0\u6CD5\u4FDD\u5B58 CHAT \u767B\u5F55\uFF0C\u8BF7\u91CD\u8BD5\u3002", {});
    }
  }
  async clearWebsiteSession(metadata, epoch, signal) {
    try {
      const fence = await this.websiteFence(metadata, epoch, signal);
      return fence ? await this.websiteSessions.clear(fence, signal) : false;
    } catch {
      throw new RemoteError("gateway/internal", "\u65E0\u6CD5\u6E05\u9664 CHAT \u767B\u5F55\uFF0C\u8BF7\u91CD\u8BD5\u3002", {});
    }
  }
  async listWebsiteConversations(metadata, epoch, signal) {
    try {
      const revision = this.websiteSessions.captureRevision();
      const fence = await this.websiteFence(metadata, epoch, signal);
      const session = fence ? await this.websiteSessions.load(fence, signal, revision) : null;
      if (!session) throw new RemoteError("gateway/internal", "\u8BF7\u5148\u6253\u5F00 DeepSeek \u804A\u5929\u9762\u677F\u767B\u5F55\u5B98\u7F51\u3002", {});
      return await listWebsiteConversations(session, clientMetadataSchema.parse(metadata), signal);
    } catch (error) {
      throw this.remoteFailure(error, "\u65E0\u6CD5\u8BFB\u53D6\u5B98\u7F51\u5BF9\u8BDD\u5217\u8868\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5\u3002");
    }
  }
  async summarizeWebsiteConversation(metadata, epoch, sessionId, conversationId, signal) {
    try {
      const revision = this.websiteSessions.captureRevision();
      const fence = await this.websiteFence(metadata, epoch, signal);
      const session = fence ? await this.websiteSessions.load(fence, signal, revision) : null;
      if (!session) throw new RemoteError("gateway/internal", "\u8BF7\u5148\u6253\u5F00 DeepSeek \u804A\u5929\u9762\u677F\u767B\u5F55\u5B98\u7F51\u3002", {});
      const parsedMetadata = clientMetadataSchema.parse(metadata);
      const sid = chatIdentifierSchema.parse(sessionId);
      const cid = chatIdentifierSchema.parse(conversationId);
      const messages = await fetchWebsiteConversation(session, cid, parsedMetadata, signal);
      const transcript = renderTranscript(messages, SUMMARY_MAX_INPUT_BYTES);
      try {
        return await summarizeTranscript(this.hostCtx, sid, transcript, signal);
      } catch (error) {
        throw new RemoteError("gateway/internal", error instanceof Error && error.message ? error.message : "\u5B98\u7F51\u5BF9\u8BDD\u6458\u8981\u751F\u6210\u5931\u8D25\u3002", {});
      }
    } catch (error) {
      throw this.remoteFailure(error, "\u65E0\u6CD5\u751F\u6210\u5B98\u7F51\u5BF9\u8BDD\u6458\u8981\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5\u3002");
    }
  }
  remoteFailure(error, fallback) {
    if (error instanceof RemoteError) return error;
    if (error instanceof WebsiteApiError) return new RemoteError("gateway/internal", error.message, {});
    return new RemoteError("gateway/internal", fallback, {});
  }
};
_init = __decoratorStart(_a);
__decorateElement(_init, 1, "authorization", _authorization_dec, ChatEntryController);
__decorateElement(_init, 1, "watchAuthorization", _watchAuthorization_dec, ChatEntryController);
__decorateElement(_init, 1, "loadWebsiteSession", _loadWebsiteSession_dec, ChatEntryController);
__decorateElement(_init, 1, "saveWebsiteSession", _saveWebsiteSession_dec, ChatEntryController);
__decorateElement(_init, 1, "clearWebsiteSession", _clearWebsiteSession_dec, ChatEntryController);
__decorateElement(_init, 1, "listWebsiteConversations", _listWebsiteConversations_dec, ChatEntryController);
__decorateElement(_init, 1, "summarizeWebsiteConversation", _summarizeWebsiteConversation_dec, ChatEntryController);
__decoratorMetadata(_init, ChatEntryController);
__publicField(ChatEntryController, "inject", ["credentials", "typert"]);

// src/index.ts
var Config = schema.object({});
var name = "dsh-deepseek-chat-entry";
var inject = ["typert", "credentials"];
function apply(ctx) {
  new ChatEntryController(ctx);
  ctx.inject(["settings"], (child) => {
    child.effect(() => child.settings.configure({ auto: false }, ctx.fiber));
  });
}
export {
  Config,
  apply,
  inject,
  name
};
