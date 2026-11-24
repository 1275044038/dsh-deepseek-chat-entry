import { Context } from '@deepseek-ai/cordis';
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import { AuthorizationAuthority } from './authorization.js';
import type { AuthorizationState, ChatEntryClientMetadata, WebsiteSession } from './protocol.js';
/** Independent CHAT website session service scoped to the current DSH profile. */
export declare class ChatEntryController extends TypertRemoteService {
    static inject: string[];
    readonly authority: AuthorizationAuthority;
    private readonly websiteSessions;
    constructor(ctx: Context);
    authorization(metadata: ChatEntryClientMetadata, signal: AbortSignal): Promise<AuthorizationState>;
    watchAuthorization(metadata: ChatEntryClientMetadata, signal: AbortSignal): AsyncIterable<AuthorizationState>;
    private websiteFence;
    loadWebsiteSession(metadata: ChatEntryClientMetadata, epoch: string, signal: AbortSignal): Promise<WebsiteSession | null>;
    saveWebsiteSession(metadata: ChatEntryClientMetadata, epoch: string, session: WebsiteSession, signal: AbortSignal): Promise<boolean>;
    clearWebsiteSession(metadata: ChatEntryClientMetadata, epoch: string, signal: AbortSignal): Promise<boolean>;
}
declare module '@deepseek-ai/cordis' {
    interface Context {
        dshDeepseekChatEntry: ChatEntryController;
    }
}
