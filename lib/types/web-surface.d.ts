import type { DesktopBrowserReservation } from '@deepseek-ai/dsh-client-ui-sidebar-browser/types';
import type { ChatEntryBridge } from './bridge.js';
export declare function websiteWorkspaceKey(accountId: string): string;
export declare function websiteGuestAttributes(reservation: DesktopBrowserReservation): {
    name: string;
    partition: string;
    src: string;
    allowpopups: string;
    'data-sidebar-browser-frame': string;
};
export declare function WebsiteSurface({ bridge }: {
    bridge: ChatEntryBridge;
}): import("react").DetailedReactHTMLElement<{
    className: string;
}, HTMLElement>;
