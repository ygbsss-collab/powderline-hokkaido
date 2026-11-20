import { withSupabase } from 'npm:@supabase/server@1.9.2'
import { accountDeletionRuntime, accountDeletionCors } from '../_shared/account-deletion-runtime.ts'

// Self deletion only. JWT + password verification; the verified JWT supplies the target ID.
// Deploy after approval with --no-verify-jwt: withSupabase verifies modern session JWTs.
export default {
  fetch: withSupabase({ auth: 'user', cors: accountDeletionCors }, (request, { supabase, supabaseAdmin }) =>
    accountDeletionRuntime(supabase, supabaseAdmin)(request)),
}
