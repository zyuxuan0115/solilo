import type { ConnectedAccount } from '../../schemas/account.js'
import type { DeliveryReceipt, FediverseVisibility } from '../../schemas/post.js'
import { publishToMastodon } from './mastodon.js'
import { publishToMisskey } from './misskey.js'

export async function dispatchPostToAccounts(params: {
  postId: string
  content: string
  contentWarning: string | null
  fediverseVisibility: FediverseVisibility
  accounts: Array<ConnectedAccount & { accessToken: string }>
}): Promise<DeliveryReceipt[]> {
  const outcomes = await Promise.allSettled(
    params.accounts.map(async (account): Promise<DeliveryReceipt> => {
      const publishInput = {
        instanceOrigin: account.instanceOrigin,
        accessToken: account.accessToken,
        content: params.content,
        contentWarning: params.contentWarning,
        visibility: params.fediverseVisibility,
        idempotencyKey: `${params.postId}:${account.id}`,
      }

      try {
        const result =
          account.platform === 'mastodon'
            ? await publishToMastodon(publishInput)
            : await publishToMisskey(publishInput)

        return {
          accountId: account.id,
          platform: account.platform,
          acct: account.acct,
          status: 'published',
          remotePostId: result.remotePostId,
          remoteUrl: result.remoteUrl,
          error: null,
          deliveredAt: new Date().toISOString(),
        }
      } catch (err) {
        return {
          accountId: account.id,
          platform: account.platform,
          acct: account.acct,
          status: 'failed',
          remotePostId: null,
          remoteUrl: null,
          error: err instanceof Error ? err.message : 'Unknown delivery error',
          deliveredAt: null,
        }
      }
    }),
  )

  return outcomes.map((outcome, index) => {
    if (outcome.status === 'fulfilled') {
      return outcome.value
    }
    const fallbackAccount = params.accounts[index]!
    return {
      accountId: fallbackAccount.id,
      platform: fallbackAccount.platform,
      acct: fallbackAccount.acct,
      status: 'failed',
      remotePostId: null,
      remoteUrl: null,
      error: outcome.reason instanceof Error ? outcome.reason.message : 'Unexpected failure',
      deliveredAt: null,
    }
  })
}
