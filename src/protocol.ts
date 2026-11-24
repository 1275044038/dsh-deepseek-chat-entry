import { z } from 'zod'
import type {
  InvocationDescriptor, RemoteResult, RemoteStreamHandle, TypertRemoteContribution,
} from '@deepseek-ai/dsh-typert-protocol'
import type { TypertContribution } from '@deepseek-ai/dsh-typert-registry'

/** Credential-free identity of the UI using the plugin's own Host bridge. */
export interface ChatEntryClientMetadata {
  version: string
  locale: string
  timezoneOffsetSeconds: number
}

/** Host lifetime and profile scope; website login is observed separately in our guest. */
export interface AuthorizationState {
  status: 'pending' | 'authorized' | 'unauthorized' | 'unavailable'
  accountId: string | null
  /** Host-issued generation fence; it is an identifier, never an account credential. */
  epoch: string
  error: string | null
}

/** The website's own login result, transported only by the internal CHAT Client bridge. */
export interface WebsiteSession {
  token: string
  userId: string
  deviceId: string
}

export const WEBSITE_SESSION_ORIGIN = 'https://chat.deepseek.com' as const
const identifier = z.string().min(1).max(512)
export const authorizationEpochSchema = identifier
export const clientMetadataSchema = z.strictObject({
  version: z.string().min(1).max(100), locale: z.string().min(1).max(100),
  timezoneOffsetSeconds: z.number().int().min(-86_400).max(86_400),
}) satisfies z.ZodType<ChatEntryClientMetadata>
export const authorizationSchema = z.strictObject({
  status: z.enum(['pending', 'authorized', 'unauthorized', 'unavailable']),
  accountId: identifier.nullable(), epoch: authorizationEpochSchema, error: z.string().max(100).nullable(),
}) satisfies z.ZodType<AuthorizationState>
export const websiteSessionSchema = z.strictObject({
  token: z.string().min(1).max(16_384),
  userId: identifier,
  deviceId: z.string().uuid(),
}) satisfies z.ZodType<WebsiteSession>

const strict = (name: string, schema: z.ZodType) => ({
  mode: 'strict' as const, typeSymbol: `dsh-deepseek-chat-entry#${name}`, create: () => schema,
})
const metadataParameter = {
  name: 'metadata', wire: 'metadata', source: 'json' as const,
  codec: strict('ChatEntryClientMetadata', clientMetadataSchema),
}
const epochParameter = {
  name: 'epoch', wire: 'epoch', source: 'json' as const,
  codec: strict('AuthorizationEpoch', authorizationEpochSchema),
}
const descriptor = (method: string, stream = false): InvocationDescriptor => ({
  id: `dsh-deepseek-chat-entry#dshDeepseekChatEntry/${method}`, service: 'dshDeepseekChatEntry', namespace: 'dshDeepseekChatEntry', method,
  invocation: { kind: 'direct' }, parameters: [metadataParameter],
  cancellation: { parameter: 'signal' }, result: strict('AuthorizationState', authorizationSchema),
  ...(stream ? { mode: 'stream' as const } : {}),
})
const websiteDescriptor = (method: string, save = false): InvocationDescriptor => ({
  id: `dsh-deepseek-chat-entry#dshDeepseekChatEntry/${method}`, service: 'dshDeepseekChatEntry', namespace: 'dshDeepseekChatEntry', method,
  invocation: { kind: 'direct' },
  parameters: [metadataParameter, epochParameter, ...(save ? [{
    name: 'session', wire: 'session', source: 'json' as const,
    codec: strict('WebsiteSession', websiteSessionSchema),
  }] : [])],
  cancellation: { parameter: 'signal' },
  result: method === 'loadWebsiteSession'
    ? strict('OptionalWebsiteSession', websiteSessionSchema.nullable())
    : strict('WebsiteSessionOperationResult', z.boolean()),
})

/** Explicit strict descriptors use the public registry; no source-mode method discovery. */
export const CHAT_ENTRY_DESCRIPTORS: readonly InvocationDescriptor[] = [
  descriptor('authorization'), descriptor('watchAuthorization', true),
  websiteDescriptor('loadWebsiteSession'), websiteDescriptor('saveWebsiteSession', true),
  websiteDescriptor('clearWebsiteSession'),
]
export const CHAT_ENTRY_REMOTE_CONTRIBUTION: TypertRemoteContribution = {
  package: 'dsh-deepseek-chat-entry', descriptors: CHAT_ENTRY_DESCRIPTORS,
}
export const CHAT_ENTRY_HOST_CONTRIBUTION: TypertContribution = {
  package: 'dsh-deepseek-chat-entry', face: 'host', schemas: [],
  // Website credentials are never model-callable services or objects.
  model: { services: [], events: [], objects: [] }, invocations: CHAT_ENTRY_DESCRIPTORS,
}

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface TypertRemoteMap {
    'dshDeepseekChatEntry/authorization': (metadata: ChatEntryClientMetadata, signal?: AbortSignal) => Promise<RemoteResult<AuthorizationState>>
    'dshDeepseekChatEntry/watchAuthorization': (metadata: ChatEntryClientMetadata, signal?: AbortSignal) => RemoteStreamHandle<AuthorizationState, never>
    'dshDeepseekChatEntry/loadWebsiteSession': (metadata: ChatEntryClientMetadata, epoch: string, signal?: AbortSignal) => Promise<RemoteResult<WebsiteSession | null>>
    'dshDeepseekChatEntry/saveWebsiteSession': (metadata: ChatEntryClientMetadata, epoch: string, session: WebsiteSession, signal?: AbortSignal) => Promise<RemoteResult<boolean>>
    'dshDeepseekChatEntry/clearWebsiteSession': (metadata: ChatEntryClientMetadata, epoch: string, signal?: AbortSignal) => Promise<RemoteResult<boolean>>
  }
  interface TypertRemoteNamespaceMap {
    dshDeepseekChatEntry: import('@deepseek-ai/dsh-typert-protocol').TypertRemoteNamespace<'dshDeepseekChatEntry'>
  }
}
