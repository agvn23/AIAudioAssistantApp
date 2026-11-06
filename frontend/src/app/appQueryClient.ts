import { createQueryClient } from './queryClient'

/** The one client for the running app. Tests create their own with createQueryClient. */
export const queryClient = createQueryClient()
