import type { InputTriggerSource } from '@deepseek-ai/dsh-client-ui-input-trigger/client';
import type { WebsiteConversation } from './protocol.js';
/** Unique @-source key. The group title row is hidden; candidates carry a
 * localized section heading instead, so no shared-locale registration is needed. */
export declare const CHAT_REFERENCE_SOURCE = "deepseek-chat";
export interface ChatReferenceOps {
    /** Recent official conversations (already bounded by the Host). */
    list(signal: AbortSignal): Promise<readonly WebsiteConversation[]>;
    /** Summarize one conversation with the current session model; throws to block send. */
    summarize(sessionId: string, conversationId: string, signal: AbortSignal): Promise<string>;
    translate(text: string): string;
}
/** Build the @-reference source. Pure data + callbacks; all RPC lives in ops. */
export declare function createChatReferenceSource(ops: ChatReferenceOps): InputTriggerSource;
