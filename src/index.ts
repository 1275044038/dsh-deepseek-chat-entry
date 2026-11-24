import schema from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-settings'
import type { Context } from '@deepseek-ai/cordis'
import { ChatEntryController } from './server.js'

/**
 * Scheme B has no user-editable preferences: leaving the panel always releases
 * the guest, and the website keeps its own presentation. The empty object
 * trivially satisfies the "every Config field is .volatile()" convention.
 */
export const Config = schema.object({})

export const name = 'dsh-deepseek-chat-entry'

/** Host-half entry. Browser UI is declared separately by the `dsh.client` manifest. */
export const inject = ['typert', 'credentials']

export function apply(ctx: Context): void {
  new ChatEntryController(ctx)
  ctx.inject(['settings'], child => {
    child.effect(() => child.settings.configure({ auto: false }, ctx.fiber))
  })
}
