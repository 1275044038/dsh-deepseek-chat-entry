import { Context } from '@deepseek-ai/cordis'
import { createHash } from 'node:crypto'
import { isAbsolute, resolve } from 'node:path'
import { Remote, RemoteError, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type {} from '@deepseek-ai/dsh-credentials'
import type {} from '@deepseek-ai/dsh-typert-registry'
import {
  AuthorizationAuthority, PROFILE_CONTEXT_UNAVAILABLE, WEBSITE_PROFILE_PREFIX,
} from './authorization.js'
import {
  CHAT_ENTRY_HOST_CONTRIBUTION, authorizationEpochSchema, clientMetadataSchema, websiteSessionSchema,
} from './protocol.js'
import type { AuthorizationState, ChatEntryClientMetadata, WebsiteSession } from './protocol.js'
import { WebsiteSessionStore, type WebsiteSessionFence } from './website-session-store.js'

/** Independent CHAT website session service scoped to the current DSH profile. */
export class ChatEntryController extends TypertRemoteService {
  static inject = ['credentials', 'typert']
  readonly authority: AuthorizationAuthority
  private readonly websiteSessions: WebsiteSessionStore
  constructor(ctx: Context) {
    super(ctx, 'dshDeepseekChatEntry')
    // Public launcher-owned metadata, never a Client-selected path or an account login.
    const profile: unknown = ctx.get('profileContext')
    const dir = profile !== null && typeof profile === 'object' && 'dir' in profile
      ? profile.dir : undefined
    const profileId = typeof dir === 'string' && dir.length <= 16_384 && isAbsolute(dir)
      && !dir.includes('\0')
      ? `${WEBSITE_PROFILE_PREFIX}${createHash('sha256').update(resolve(dir), 'utf8').digest('hex')}`
      : null
    this.authority = new AuthorizationAuthority(profileId)
    this.websiteSessions = new WebsiteSessionStore(ctx.credentials, this.authority, profileId)
    ctx.typert.register(CHAT_ENTRY_HOST_CONTRIBUTION)
    ctx.effect(() => () => { this.authority.dispose() }, 'dsh-deepseek-chat-entry profile session lifetime')
  }

  @Remote
  async authorization(metadata: ChatEntryClientMetadata, signal: AbortSignal): Promise<AuthorizationState> {
    try {
      signal.throwIfAborted()
      const state = await this.authority.refresh(clientMetadataSchema.parse(metadata))
      signal.throwIfAborted()
      return state
    } catch {
      throw new RemoteError('gateway/internal', '无法连接 CHAT 登录保存服务，请检查 DSH 服务。', {})
    }
  }
  @Remote({ mode: 'stream' })
  async *watchAuthorization(metadata: ChatEntryClientMetadata, signal: AbortSignal): AsyncIterable<AuthorizationState> {
    try { yield* this.authority.watch(clientMetadataSchema.parse(metadata), signal) }
    catch { throw new RemoteError('gateway/internal', '无法连接 CHAT 登录保存服务，请检查 DSH 服务。', {}) }
  }

  private async websiteFence(metadata: ChatEntryClientMetadata, epoch: string, signal: AbortSignal): Promise<WebsiteSessionFence | null> {
    signal.throwIfAborted()
    const expectedEpoch = authorizationEpochSchema.parse(epoch)
    const state = await this.authority.refresh(clientMetadataSchema.parse(metadata))
    signal.throwIfAborted()
    const current = this.authority.getSnapshot()
    if (state.status !== 'authorized'
      || (state.error !== null && state.error !== PROFILE_CONTEXT_UNAVAILABLE) || !state.accountId
      || state.accountId.length > 512 || state.epoch !== expectedEpoch
      || current.status !== 'authorized' || current.error !== state.error
      || current.accountId !== state.accountId || current.epoch !== expectedEpoch) return null
    return { accountId: state.accountId, epoch: expectedEpoch }
  }

  @Remote
  async loadWebsiteSession(metadata: ChatEntryClientMetadata, epoch: string, signal: AbortSignal): Promise<WebsiteSession | null> {
    try {
      const revision = this.websiteSessions.captureRevision()
      const fence = await this.websiteFence(metadata, epoch, signal)
      return fence ? await this.websiteSessions.load(fence, signal, revision) : null
    } catch { throw new RemoteError('gateway/internal', '无法恢复 CHAT 登录，请重试。', {}) }
  }

  @Remote
  async saveWebsiteSession(metadata: ChatEntryClientMetadata, epoch: string, session: WebsiteSession, signal: AbortSignal): Promise<boolean> {
    try {
      const revision = this.websiteSessions.captureRevision()
      const parsed = websiteSessionSchema.parse(session)
      const fence = await this.websiteFence(metadata, epoch, signal)
      return fence ? await this.websiteSessions.save(fence, parsed, signal, revision) : false
    } catch { throw new RemoteError('gateway/internal', '无法保存 CHAT 登录，请重试。', {}) }
  }

  @Remote
  async clearWebsiteSession(metadata: ChatEntryClientMetadata, epoch: string, signal: AbortSignal): Promise<boolean> {
    try {
      const fence = await this.websiteFence(metadata, epoch, signal)
      return fence ? await this.websiteSessions.clear(fence, signal) : false
    } catch { throw new RemoteError('gateway/internal', '无法清除 CHAT 登录，请重试。', {}) }
  }
}

declare module '@deepseek-ai/cordis' { interface Context { dshDeepseekChatEntry: ChatEntryController } }
