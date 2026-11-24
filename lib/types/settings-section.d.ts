import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import type { ConfigForm } from '@deepseek-ai/dsh-client-ui-settings/client';
import type { ChatEntryBridge } from './bridge.js';
export declare function ChatEntrySettingsSection({ bridge, close, form }: PropsRuntime<'settings.section'> & {
    readonly bridge: ChatEntryBridge;
    form: ConfigForm<Record<string, never>>;
}): import("react/jsx-runtime").JSX.Element;
