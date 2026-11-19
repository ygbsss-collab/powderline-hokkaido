import { withSupabase } from 'npm:@supabase/server@1.9.2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
}

const fail = (status: number, code: string, error: string) =>
  Response.json({ ok: false, code, error }, { status })

export default {
  fetch: withSupabase(
    { auth: 'user', cors: { headers: corsHeaders } },
    async (request, { supabase, supabaseAdmin }) => {
      if (request.method !== 'POST') {
        return Response.json({ error: 'Method not allowed' }, { status: 405, headers: { Allow: 'POST' } })
      }

      const { data: userData, error: userError } = await supabase.auth.getUser()
      const userId = userData?.user?.id
      if (userError || !userId) return fail(401, 'UNAUTHORIZED', 'Authentication required')

      let token = ''
      let platform = ''
      try {
        const body = await request.json()
        token = typeof body?.token === 'string' ? body.token.trim() : ''
        platform = typeof body?.platform === 'string' ? body.platform.trim().toLowerCase() : ''
      } catch {
        return fail(400, 'BAD_REQUEST', 'Invalid JSON body')
      }

      if (token.length < 20 || token.length > 4096 || /\s/.test(token)) {
        return fail(400, 'INVALID_TOKEN', 'Invalid push token')
      }
      if (!['android', 'ios', 'web'].includes(platform)) {
        return fail(400, 'INVALID_PLATFORM', 'Invalid push platform')
      }

      const now = new Date().toISOString()
      const { error } = await supabaseAdmin.from('push_devices').upsert(
        {
          user_id: userId,
          token,
          platform,
          last_registered_at: now,
          disabled_at: null,
        },
        { onConflict: 'token' },
      )
      if (error) {
        console.error('Push token registration failed', { code: error.code })
        return fail(500, 'TOKEN_SAVE_FAILED', 'Push token could not be saved')
      }

      // Never return or log the registration token.
      return Response.json({ ok: true, registeredAt: now })
    },
  ),
}
