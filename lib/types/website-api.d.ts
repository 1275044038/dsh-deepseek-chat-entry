import type { WebsiteSession, WebsiteConversation, ChatEntryClientMetadata } from './protocol.js';
export declare const WEBSITE_API_ORIGIN = "https://chat.deepseek.com";
export interface WebsiteMessage {
    role: 'USER' | 'ASSISTANT';
    text: string;
}
export type WebsiteApiErrorCode = 'token-expired' | 'unauthorized' | 'network' | 'shape' | 'empty';
export declare class WebsiteApiError extends Error {
    readonly code: WebsiteApiErrorCode;
    constructor(message: string, code: WebsiteApiErrorCode);
}
export interface FetchResponse {
    ok: boolean;
    status: number;
    json(): Promise<unknown>;
    text(): Promise<string>;
}
export type FetchLike = (url: string, init: {
    headers: Record<string, string>;
    signal: AbortSignal;
}) => Promise<FetchResponse>;
export declare function websiteHeaders(session: WebsiteSession, metadata: ChatEntryClientMetadata): Record<string, string>;
export declare function listWebsiteConversations(session: WebsiteSession, metadata: ChatEntryClientMetadata, signal: AbortSignal, fetchImpl?: FetchLike): Promise<WebsiteConversation[]>;
export declare function fetchWebsiteConversation(session: WebsiteSession, conversationId: string, metadata: ChatEntryClientMetadata, signal: AbortSignal, fetchImpl?: FetchLike): Promise<WebsiteMessage[]>;
export declare function renderTranscript(messages: WebsiteMessage[], maxBytes: number): string;
