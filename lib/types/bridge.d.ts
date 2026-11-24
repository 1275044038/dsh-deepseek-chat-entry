import type { AuthorizationState, WebsiteSession } from './protocol.js';
import type { ChatLanguage } from './i18n.js';
/** State reported by the webview surface; the generation fence drops late reports. */
export interface WebsiteSurfaceState {
    loading: boolean;
    error: boolean;
    signedIn: boolean;
}
/** Client-visible projection consumed by useSyncExternalStore. Never carries a token. */
export interface ChatEntryViewState {
    authorization: AuthorizationState;
    authorizationGeneration: number;
    connectionError: string | null;
    websiteLoading: boolean;
    websiteError: boolean;
    websiteSignedIn: boolean;
    websiteReloadRevision: number;
    websiteSessionError: string | null;
    language: ChatLanguage | null;
}
export type WebsiteSessionInspection = 'stored' | 'empty' | 'unavailable' | 'error';
/** The single face every React component receives through slot inject(). */
export interface ChatEntryBridge {
    getSnapshot(): ChatEntryViewState;
    subscribe(listener: () => void): () => void;
    refreshAuthorization(): void;
    reloadWebsite(): void;
    reportWebsiteState(generation: number, state: WebsiteSurfaceState): void;
    reportWebsiteSessionError(generation: number, message: string | null): void;
    loadWebsiteSession(generation: number): Promise<WebsiteSession | null>;
    saveWebsiteSession(generation: number, session: WebsiteSession): Promise<boolean>;
    clearWebsiteSession(): Promise<boolean>;
    inspectWebsiteSession(): Promise<WebsiteSessionInspection>;
}
