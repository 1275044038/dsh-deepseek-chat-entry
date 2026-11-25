/**
 * Close only the fixed website environment notice ("使用环境异常") the website
 * shows when it detects an embedded guest. Ported from the reference project's
 * proven dismissal: it clicks the website's own close button on that one exact
 * dialog. It never overrides page globals, reads private state, or touches any
 * other modal (login forms, inputs and iframes are explicitly excluded).
 */
export declare function dismissWebsiteEnvironmentNotice(doc: Document): void;
/** Serialize the dismissal into the approved guest; no arguments are interpolated. */
export declare const websiteEnvironmentNoticeScript: () => string;
