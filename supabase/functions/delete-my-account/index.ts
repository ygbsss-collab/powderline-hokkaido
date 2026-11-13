import { withSupabase } from 'npm:@supabase/server@1.9.2'
import { createClient } from 'npm:@supabase/supabase-js@2'

// 회원탈퇴: lets a signed-in user delete THEIR OWN account and nothing else.
//   1. The caller's JWT is verified by Supabase (withSupabase auth: 'user') and again with auth.getUser().
//   2. The user id comes ONLY from that verified JWT. The request body can never name another user.
//   3. Re-authentication: the caller must send their current password; it is checked with a separate, non-persisting
//      client against the email of the verified user (a stolen/old session alone is not enough).
//   4. The actual deletion is ONE atomic SQL function (public.delete_own_account, executable by service_role only).
//      It refuses when other members would be affected and rolls back completely on any error, so a failure never
//      leaves a half-deleted account.
// The service_role key is only used here, inside the Edge runtime (supabaseAdmin) and never reaches the browser.
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
}

const BLOCKING_CODES: Record<string, number> = {
  LAST_ADMIN: 409,
  PARTY_LEADER: 409,
  ROUTE_IN_USE: 409,
}

const fail = (status: number, code: string, error: string) => Response.json({ ok: false, code, error }, { status })

export default {
  fetch: withSupabase(
    { auth: 'user', cors: { headers: corsHeaders } },
    async (request, { supabase, supabaseAdmin }) => {
      if (request.method !== 'POST') {
        return Response.json({ error: 'Method not allowed' }, { status: 405, headers: { Allow: 'POST' } })
      }

      // Who is calling? (verified against the Auth server, not just decoded)
      const { data: userData, error: userError } = await supabase.auth.getUser()
      const user = userData?.user
      if (userError || !user?.id || !user.email) return fail(401, 'UNAUTHORIZED', 'Authentication required')

      let password = ''
      try {
        const body = await request.json()
        if (body?.confirm !== true) return fail(400, 'CONFIRM_REQUIRED', 'Explicit confirmation required')
        password = typeof body?.password === 'string' ? body.password : ''
      } catch {
        return fail(400, 'BAD_REQUEST', 'Invalid JSON body')
      }
      if (!password || password.length > 256) return fail(400, 'PASSWORD_REQUIRED', 'Password required')

      // Re-authentication with the account's own credentials (does not touch the caller's session).
      const url = Deno.env.get('SUPABASE_URL') ?? ''
      const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
      if (!url || !anonKey) {
        console.error('SUPABASE_URL / SUPABASE_ANON_KEY missing in the Edge runtime')
        return fail(500, 'NOT_CONFIGURED', 'Server is not configured')
      }
      const verifier = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } })
      const { data: signIn, error: signInError } = await verifier.auth.signInWithPassword({ email: user.email, password })
      if (signInError || signIn?.user?.id !== user.id) return fail(401, 'PASSWORD_INVALID', 'Password is incorrect')

      // Atomic deletion; target = the verified user id only.
      const { data, error } = await supabaseAdmin.rpc('delete_own_account', { target_user: user.id })
      if (error) {
        console.error('delete_own_account failed (rolled back)', error)
        return fail(500, 'DELETE_FAILED', 'Deletion failed; nothing was changed')
      }
      if (data?.ok !== true) {
        const code = typeof data?.code === 'string' ? data.code : 'DELETE_FAILED'
        return fail(BLOCKING_CODES[code] ?? 500, code, 'Deletion was not performed; nothing was changed')
      }
      return Response.json({ ok: true })
    },
  ),
}
