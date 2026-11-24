import schema from '@deepseek-ai/schemastery';
import type { Context } from '@deepseek-ai/cordis';
/**
 * Scheme B has no user-editable preferences: leaving the panel always releases
 * the guest, and the website keeps its own presentation. The empty object
 * trivially satisfies the "every Config field is .volatile()" convention.
 */
export declare const Config: schema<Schemastery.ObjectS<{}>, Schemastery.ObjectT<{}>, "plain">;
export declare const name = "dsh-deepseek-chat-entry";
/** Host-half entry. Browser UI is declared separately by the `dsh.client` manifest. */
export declare const inject: string[];
export declare function apply(ctx: Context): void;
