import { withSupabase } from 'npm:@supabase/server@1.9.2'
import { accountDeletionRuntime, accountDeletionCors } from '../_shared/account-deletion-runtime.ts'

// Service account deletion, NOT a party kick. Approved-admin checks run in Edge AND SQL.
// Explicit target email + administrator password required; protected parties/admins cannot be removed.
export default {
  fetch: withSupabase({ auth: 'user', cors: accountDeletionCors }, (request, { supabase, supabaseAdmin }) =>
    accountDeletionRuntime(supabase, supabaseAdmin, true)(request)),
}
