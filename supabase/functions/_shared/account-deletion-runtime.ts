import { createClient } from 'npm:@supabase/supabase-js@2.106.1'
import { createAccountDeletionHandler } from './account-deletion.ts'

export const accountDeletionCors = { headers: {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
} }

// Clients originate exclusively from withSupabase's verified user/service context.
export function accountDeletionRuntime(supabase: any, supabaseAdmin: any, admin = false) {
  return createAccountDeletionHandler({
    getUser: async () => {
      const { data, error } = await supabase.auth.getUser()
      return error ? null : data?.user ?? null
    },
    getProfile: async id => {
      const { data, error } = await supabaseAdmin.from('profiles').select('role,status').eq('id', id).maybeSingle()
      return error ? null : data
    },
    verifyPassword: async (user, password) => {
      const url = Deno.env.get('SUPABASE_URL'), key = Deno.env.get('SUPABASE_ANON_KEY')
      if (!url || !key) throw new Error('Auth configuration unavailable')
      const verifier = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } })
      const { data, error } = await verifier.auth.signInWithPassword({ email: user.email!, password })
      try { return !error && data?.user?.id === user.id }
      finally {
        // Re-auth creates a temporary session. Do not leave it alive after a blocked deletion.
        if (data?.session) await verifier.auth.signOut({ scope: 'local' })
      }
    },
    rpc: (name, args) => supabaseAdmin.rpc(name, args),
    removePhotos: paths => supabaseAdmin.storage.from('profile-photos').remove(paths),
  }, admin)
}
