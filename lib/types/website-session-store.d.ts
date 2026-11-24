import { type CredentialProvider } from '@deepseek-ai/dsh-credentials';
import { type AuthorizationAuthority } from './authorization.js';
import type { WebsiteSession } from './protocol.js';
export interface WebsiteSessionFence {
    accountId: string;
    epoch: string;
}
type WebsiteCredentials = Pick<CredentialProvider, 'readRecord' | 'modifyRecord' | 'deleteRecord'>;
type WebsiteAuthority = Pick<AuthorizationAuthority, 'getSnapshot'>;
/** Derives a profile-specific key in the shared vault, independently of DSH's own login. */
export declare class WebsiteSessionStore {
    private readonly credentials;
    private readonly authority;
    private readonly profileId;
    private readonly profileKey;
    private pending;
    private writeRevision;
    private clearing;
    constructor(credentials: WebsiteCredentials, authority: WebsiteAuthority, profileId: string | null);
    /** Capture before the controller awaits its fence, so an already-issued RPC stays fenced. */
    captureRevision(): number;
    private current;
    private unchanged;
    private sessionFromRecord;
    private payload;
    /** Keep clearing and writes ordered; queued work checks its captured generation again. */
    private exclusive;
    load(fence: WebsiteSessionFence, signal: AbortSignal, revision?: number): Promise<WebsiteSession | null>;
    save(fence: WebsiteSessionFence, session: WebsiteSession, signal: AbortSignal, revision?: number): Promise<boolean>;
    clear(fence: WebsiteSessionFence, signal: AbortSignal): Promise<boolean>;
}
export {};
