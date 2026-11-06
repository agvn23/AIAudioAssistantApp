/**
 * Why the person is about to land on the login page, for the cases where the
 * route guard and another piece of code both redirect and must agree on the
 * result. "expired" is set by the 401 handler, "logout" by the Log out button,
 * "deleted" after the account was deleted. The login page clears it when it mounts.
 */
export type PendingReason = 'expired' | 'logout' | 'deleted'

let pending: PendingReason | null = null

export function setPendingReason(reason: PendingReason): void {
  pending = reason
}

export function getPendingReason(): PendingReason | null {
  return pending
}

export function clearPendingReason(): void {
  pending = null
}
