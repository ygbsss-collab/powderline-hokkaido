import { withSupabase } from 'npm:@supabase/server@1.9.2'
import { getFcmAccessToken, parseServiceAccount, sendFcmMessage } from '../_shared/fcm.ts'

type OutboxEvent = {
  id: string
  event_type: string
  recipient_id: string | null
  party_id: string | null
  title: string
  body: string
}

const fail = (status: number, error: string) => Response.json({ ok: false, error }, { status })
const IN_FLIGHT = 'FCM response not received' // delivery claimed, FCM result not stored yet
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default {
  fetch: withSupabase(
    { auth: 'secret' },
    async (request, { supabaseAdmin }) => {
      if (request.method !== 'POST') return fail(405, 'POST required')
      let body: Record<string, unknown>
      try { body = await request.json() } catch { return fail(400, 'Invalid JSON') }
      // Database webhook wraps the inserted row in record; a retry can pass id directly.
      const rawId = body?.record && typeof body.record === 'object'
        ? (body.record as Record<string, unknown>).id : body?.id
      if (typeof rawId !== 'string' || !uuid.test(rawId)) return fail(400, 'Valid outbox id required')

      const { data: claimed, error: claimError } = await supabaseAdmin
        .rpc('claim_fcm_notification', { p_id: rawId })
      if (claimError) return fail(500, 'Notification claim failed')
      if (!claimed) return Response.json({ ok: true, duplicateOrUnavailable: true })
      const event = claimed as OutboxEvent

      const finish = async (status: 'sent' | 'failed' | 'skipped', error: string | null = null) => {
        const { error: updateError } = await supabaseAdmin.from('fcm_notification_outbox').update({
          status, last_error: error?.slice(0, 500) || null, completed_at: new Date().toISOString(),
          locked_at: null,
        }).eq('id', event.id)
        if (updateError) throw new Error('Notification status update failed')
      }

      try {
        if (!event.recipient_id) {
          await finish('skipped', 'Recipient account no longer exists')
          return Response.json({ ok: true, status: 'skipped' })
        }
        const { data: devices, error: deviceError } = await supabaseAdmin
          .from('push_devices').select('id,token').eq('user_id', event.recipient_id)
          .is('disabled_at', null)
        if (deviceError) throw new Error('Push device lookup failed')
        if (!devices?.length) {
          await finish('skipped', 'No registered push token')
          return Response.json({ ok: true, status: 'skipped' })
        }
        const account = parseServiceAccount()
        if (!account) throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON unavailable')
        const accessToken = await getFcmAccessToken(account)
        let sent = 0
        let failed = 0
        let duplicates = 0
        for (const device of devices as Array<{ id: string; token: string }>) {
          // Claim before the network call: repeated webhook delivery cannot send twice.
          let { data: delivery, error: insertError } = await supabaseAdmin
            .from('fcm_notification_deliveries').insert({
              outbox_id: event.id, push_device_id: device.id, status: 'failed',
              error_message: IN_FLIGHT,
            }).select('id').single()
          if (insertError?.code === '23505') {
            // Earlier attempt for this device (retry of a failed outbox row; the outbox claim serializes workers).
            const { data: prior, error: priorError } = await supabaseAdmin.from('fcm_notification_deliveries')
              .select('id,status,error_message').eq('outbox_id', event.id).eq('push_device_id', device.id).maybeSingle()
            if (priorError) throw new Error('Delivery claim failed')
            if (prior?.status === 'sent') { duplicates += 1; continue } // never send the same notification twice
            if (!prior?.id || prior.error_message === IN_FLIGHT) { failed += 1; continue } // outcome unknown: not re-sent
            const { error: reclaimError } = await supabaseAdmin.from('fcm_notification_deliveries')
              .update({ error_message: IN_FLIGHT, response_code: null, attempted_at: new Date().toISOString() })
              .eq('id', prior.id)
            if (reclaimError) throw new Error('Delivery claim failed')
            delivery = { id: prior.id }
            insertError = null
          }
          if (insertError || !delivery?.id) throw new Error('Delivery claim failed')
          let response: Response
          try {
            response = await sendFcmMessage(account, accessToken, device.token,
              event.title, event.body, {
                type: event.event_type.startsWith('party_') ? 'party_notification' : 'account_notification',
                event_type: event.event_type,
                notification_id: event.id,
                party_id: event.party_id || '',
              })
          } catch {
            await supabaseAdmin.from('fcm_notification_deliveries')
              .update({ error_message: 'FCM network request failed' }).eq('id', delivery.id)
            failed += 1
            continue
          }
          if (response.ok) {
            const { error: saveError } = await supabaseAdmin.from('fcm_notification_deliveries')
              .update({ status: 'sent', response_code: response.status, error_message: null })
              .eq('id', delivery.id)
            if (saveError) throw new Error('Delivery result save failed')
            sent += 1
          } else {
            const responseText = await response.text()
            const unregistered = response.status === 404 || /UNREGISTERED/i.test(responseText)
            await supabaseAdmin.from('fcm_notification_deliveries')
              .update({ response_code: response.status,
                error_message: unregistered ? 'FCM token unregistered' : `FCM HTTP ${response.status}` })
              .eq('id', delivery.id)
            if (unregistered) await supabaseAdmin.from('push_devices')
              .update({ disabled_at: new Date().toISOString() }).eq('id', device.id)
            failed += 1
          }
        }
        // Devices already delivered on an earlier attempt count as sent, so a retry never downgrades to skipped.
        const status = failed ? 'failed' : (sent || duplicates) ? 'sent' : 'skipped'
        await finish(status, failed ? `${failed} device delivery failed` : null)
        return Response.json({ ok: true, status, sent, failed, duplicates })
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Notification dispatch failed'
        try { await finish('failed', message) } catch {
          console.error('FCM outbox finalization failed', { outboxId: event.id })
          return fail(500, 'Notification status update failed')
        }
        console.error('FCM notification dispatch failed', { outboxId: event.id, reason: message })
        return fail(503, message)
      }
    },
  ),
}
