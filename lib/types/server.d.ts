import { Context } from '@deepseek-ai/cordis';
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import { AuthorizationAuthority } from './authorization.js';
import type { AuthorizationState, ChatEntryClientMetadata, WebsiteConversation, WebsiteSession } from './protocol.js';
/** Independent CHAT website session service scoped to the current DSH profile. */
export declare class ChatEntryController extends TypertRemoteService {
    static inject: string[];
    readonly authority: AuthorizationAuthority;
    private readonly websiteSessions;
    private readonly hostCtx;
    constructor(ctx: Context);
    authorization(metadata: ChatEntryClientMetadata, signal: AbortSignal): Promise<AuthorizationState>;
    watchAuthorization(metadata: ChatEntryClientMetadata, signal: AbortSignal): AsyncIterable<AuthorizationState>;
    private websiteFence;
    loadWebsiteSession(metadata: ChatEntryClientMetadata, epoch: string, signal: AbortSignal): Promise<WebsiteSession | null>;
    saveWebsiteSession(metadata: ChatEntryClientMetadata, epoch: string, session: WebsiteSession, signal: AbortSignal): Promise<boolean>;
    clearWebsiteSession(metadata: ChatEntryClientMetadata, epoch: string, signal: AbortSignal): Promise<boolean>;
    /** Read the website conversation list for the @ reference picker; never exposes credentials. */
    listWebsiteConversations(metadata: ChatEntryClientMetadata, epoch: string, signal: AbortSignal): Promise<WebsiteConversation[]>;
    /** Fetch one chosen conversation on the Host, summarize it with the session model, return only the summary. */
    summarizeWebsiteConversation(metadata: ChatEntryClientMetadata, epoch: string, sessionId: string, conversationId: string, signal: AbortSignal): Promise<string>;
    private remoteFailure;
}
declare module '@deepseek-ai/cordis' {
    interface Context {
        dshDeepseekChatEntry: ChatEntryController;
    }
}
