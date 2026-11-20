// Sends queued weather admin alerts (public.weather_admin_alerts, written by scripts/weather-model-watch-run.mjs)
// to the devices of approved admins. NOT deployed yet: deploy only after approval
//   supabase functions deploy dispatch-weather-admin-alert --use-api --no-verify-jwt
// and call it with the secret key (POST {}), e.g. from the watch workflow after a check that queued alerts.
// Duplicate protection: an alert is claimed with a conditional update (pending -> processing); only the claimer sends
// it, once. A row left in 'processing' (crash after claim) is never re-sent automatically.
import { withSupabase } from 'npm:@supabase/server@1.9.2'
import { getFcmAccessToken, parseServiceAccount, sendFcmMessage } from '../_shared/fcm.ts'

type Alert = { alert_key: string; kind: string; title: string; body: string; attempts: number }
const fail = (status: number, error: string) => Response.json({ ok: false, error }, { status })

export default {
  fetch: withSupabase(
    { auth: 'secret' },
    async (request, { supabaseAdmin }) => {
      if (request.method !== 'POST') return fail(405, 'POST required')
      const { data: pending, error } = await supabaseAdmin.from('weather_admin_alerts')
        .select('alert_key').eq('status', 'pending').order('created_at').limit(10)
      if (error) return fail(500, 'Alert lookup failed')
      if (!pending?.length) return Response.json({ ok: true, sent: 0 })

      const { data: admins, error: adminError } = await supabaseAdmin.from('profiles')
        .select('id').eq('role', 'admin').eq('status', 'approved')
      if (adminError) return fail(500, 'Admin lookup failed')
      const adminIds = (admins || []).map((a: { id: string }) => a.id)
      const { data: devices, error: deviceError } = adminIds.length
        ? await supabaseAdmin.from('push_devices').select('id,token').in('user_id', adminIds).is('disabled_at', null)
        : { data: [], error: null }
      if (deviceError) return fail(500, 'Push device lookup failed')

      const account = parseServiceAccount()
      if (!account) return fail(500, 'FIREBASE_SERVICE_ACCOUNT_JSON unavailable')
      const accessToken = devices?.length ? await getFcmAccessToken(account) : ''
      const out: Record<string, string> = {}
      for (const { alert_key } of pending as Array<{ alert_key: string }>) {
        // claim: only one worker moves pending -> processing
        const { data: claimed, error: claimError } = await supabaseAdmin.from('weather_admin_alerts')
          .update({ status: 'processing', attempts: 1 }).eq('alert_key', alert_key).eq('status', 'pending')
          .select('alert_key,kind,title,body,attempts').maybeSingle()
        if (claimError || !claimed) { out[alert_key] = 'not_claimed'; continue }
        const alert = claimed as Alert
        if (!devices?.length) {
          await supabaseAdmin.from('weather_admin_alerts').update({ status: 'skipped', last_error: 'No admin push device' }).eq('alert_key', alert_key)
          out[alert_key] = 'skipped'; continue
        }
        let sent = 0, failed = 0
        for (const d of devices as Array<{ id: string; token: string }>) {
          try {
            const r = await sendFcmMessage(account, accessToken, d.token, alert.title, alert.body,
              { type: 'weather_admin_alert', alert_kind: alert.kind, alert_key: alert.alert_key })
            if (r.ok) sent++; else failed++
          } catch { failed++ }
        }
        const status = sent ? 'sent' : 'failed'
        await supabaseAdmin.from('weather_admin_alerts').update({ status, sent_at: sent ? new Date().toISOString() : null,
          last_error: failed ? `${failed} device delivery failed` : null }).eq('alert_key', alert_key)
        out[alert_key] = status
      }
      return Response.json({ ok: true, results: out })
    },
  ),
}
