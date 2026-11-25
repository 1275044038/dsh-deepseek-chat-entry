declare module '@deepseek-ai/dsh-llm/types' {
    interface LlmRequestPurposeMap {
        'deepseek-chat-summary': true;
    }
}
import type { ContextFormed } from '@deepseek-ai/dsh-llm';
declare module '@deepseek-ai/dsh-llm' {
    interface MessageSourceMap {
        'dsh-deepseek-chat-entry': {
            kind: 'dsh-deepseek-chat-entry';
        } & ContextFormed;
    }
}
export declare const SUMMARY_MAX_INPUT_BYTES = 60000;
export declare const SUMMARY_MAX_OUTPUT_TOKENS = 600;
export declare const SUMMARY_TIMEOUT_MS = 60000;
export interface SummaryRoute {
    provider: string;
    model: string;
}
export declare function resolveSessionRoute(ctx: {
    get(name: string): unknown;
}, sessionId: string): SummaryRoute | null;
export declare function summarizeTranscript(ctx: {
    get(name: string): unknown;
}, sessionId: string, transcript: string, signal: AbortSignal): Promise<string>;
