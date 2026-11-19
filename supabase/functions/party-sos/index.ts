import { withSupabase } from 'npm:@supabase/server@1.9.2'
import { parseServiceAccount, getFcmAccessToken, sendFcmMessage } from '../_shared/fcm.ts'

type SosEvent = {
  id: string
  party_id: string
  requester_id: string
  requester_name: string
  latitude: number
  longitude: number
  accuracy_m: number | null
  position_recorded_at: string
  occurred_at: string
  status: 'active' | 'resolved'
  resolved_at?: string | null
}

type AdminClient = { from: (table: string) => any }

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
}

const fail = (status: number, code: string, error: string, extra: Record<string, unknown> = {}) =>
  Response.json({ ok: false, code, error, ...extra }, { status })

async function createDeliveryClaim(
  admin: AdminClient,
  event: SosEvent,
  recipientId: string,
  deviceId: string | null,
  eventType: 'sos_created' | 'sos_resolved',
): Promise<string | null> {
  const suffix = deviceId || `no-device:${recipientId}`
  const dedupeKey = `${event.id}:${eventType}:${suffix}`
  const { data, error } = await admin.from('party_sos_notification_deliveries').insert({
    sos_event_id: event.id,
    recipient_id: recipientId,
    push_device_id: deviceId,
    event_type: eventType,
    dedupe_key: dedupeKey,
    status: 'pending',
  }).select('id').maybeSingle()
  if (error?.code === '23505') return null
  if (error || !data?.id) throw new Error('Notification delivery claim failed')
  return data.id
}

async function finishDelivery(
  admin: AdminClient,
  id: string,
  status: 'sent' | 'failed' | 'skipped',
  responseCode: number | null,
  errorMessage: string | null,
) {
  await admin.from('party_sos_notification_deliveries').update({
    status,
    response_code: responseCode,
    error_message: errorMessage?.slice(0, 500) || null,
    completed_at: new Date().toISOString(),
  }).eq('id', id)
}

async function dispatchPartyNotifications(
  admin: AdminClient,
  event: SosEvent,
  eventType: 'sos_created' | 'sos_resolved',
) {
  const { data: members, error: memberError } = await admin
    .from('party_members')
    .select('user_id')
    .eq('party_id', event.party_id)
    .neq('user_id', event.requester_id)
  if (memberError) throw new Error('Party recipient lookup failed')

  const recipientIds = [...new Set((members || []).map((row: { user_id: string }) => row.user_id).filter(Boolean))]
  if (!recipientIds.length) return { configured: Boolean(parseServiceAccount()), recipients: 0, sent: 0, failed: 0, skipped: 0, duplicates: 0 }

  const { data: devices, error: deviceError } = await admin
    .from('push_devices')
    .select('id,user_id,token')
    .in('user_id', recipientIds)
    .is('disabled_at', null)
  if (deviceError) throw new Error('Push device lookup failed')

  const account = parseServiceAccount()
  let accessToken = ''
  let configurationError = ''
  if (account) {
    try {
      accessToken = await getFcmAccessToken(account)
    } catch (error) {
      configurationError = error instanceof Error ? error.message : 'FCM authorization failed'
    }
  } else {
    configurationError = 'FIREBASE_SERVICE_ACCOUNT_JSON is not configured'
  }

  const deviceRows = (devices || []) as Array<{ id: string; user_id: string; token: string }>
  const devicesByUser = new Map<string, typeof deviceRows>()
  for (const device of deviceRows) {
    const list = devicesByUser.get(device.user_id) || []
    list.push(device)
    devicesByUser.set(device.user_id, list)
  }

  const result = { configured: Boolean(account && accessToken), recipients: recipientIds.length, sent: 0, failed: 0, skipped: 0, duplicates: 0 }
  for (const recipientId of recipientIds) {
    const recipientDevices = devicesByUser.get(recipientId) || []
    if (!recipientDevices.length) {
      const claimId = await createDeliveryClaim(admin, event, recipientId, null, eventType)
      if (!claimId) { result.duplicates += 1; continue }
      await finishDelivery(admin, claimId, 'skipped', null, 'No active push token')
      result.skipped += 1
      continue
    }

    for (const device of recipientDevices) {
      const claimId = await createDeliveryClaim(admin, event, recipientId, device.id, eventType)
      if (!claimId) { result.duplicates += 1; continue }
      if (!account || !accessToken) {
        await finishDelivery(admin, claimId, 'failed', null, configurationError)
        result.failed += 1
        continue
      }

      const resolved = eventType === 'sos_resolved'
      const title = resolved ? 'POWDERLINE SOS 종료' : 'POWDERLINE 긴급 SOS'
      const body = resolved
        ? `${event.requester_name}님의 SOS가 해제되었습니다.`
        : `${event.requester_name}님이 긴급 위치를 공유했습니다.`
      let response: Response
      try {
        response = await sendFcmMessage(account, accessToken, device.token, title, body, {
          type: 'party_sos',
          action: resolved ? 'resolved' : 'created',
          party_id: event.party_id,
          sos_id: event.id,
          latitude: String(event.latitude),
          longitude: String(event.longitude),
          occurred_at: event.occurred_at,
        }, { dataOnly: true })
      } catch {
        await finishDelivery(admin, claimId, 'failed', null, 'FCM network request failed')
        result.failed += 1
        continue
      }

      if (response.ok) {
        await finishDelivery(admin, claimId, 'sent', response.status, null)
        result.sent += 1
      } else {
        const responseText = await response.text()
        const unregistered = response.status === 404 || /UNREGISTERED/i.test(responseText)
        await finishDelivery(admin, claimId, 'failed', response.status, unregistered ? 'FCM token is unregistered' : `FCM request failed (${response.status})`)
        if (unregistered) {
          await admin.from('push_devices').update({ disabled_at: new Date().toISOString() }).eq('id', device.id)
        }
        result.failed += 1
      }
    }
  }
  return result
}

export default {
  fetch: withSupabase(
    { auth: 'user', cors: { headers: corsHeaders } },
    async (request, { supabase, supabaseAdmin }) => {
      if (request.method !== 'POST') {
        return Response.json({ error: 'Method not allowed' }, { status: 405, headers: { Allow: 'POST' } })
      }

      const { data: userData, error: userError } = await supabase.auth.getUser()
      if (userError || !userData?.user?.id) return fail(401, 'UNAUTHORIZED', 'Authentication required')

      let body: Record<string, unknown>
      try {
        body = await request.json()
      } catch {
        return fail(400, 'BAD_REQUEST', 'Invalid JSON body')
      }

      const action = body.action
      let event: SosEvent | null = null
      let eventType: 'sos_created' | 'sos_resolved'
      if (action === 'create') {
        const { data, error } = await supabase.rpc('create_party_sos', {
          p_party_id: body.partyId,
          p_lat: body.latitude,
          p_lng: body.longitude,
          p_accuracy_m: body.accuracy ?? null,
          p_position_recorded_at: body.positionRecordedAt,
          p_client_request_id: body.clientRequestId,
        })
        if (error) {
          const status = error.code === '42501' ? 403 : error.code === '23505' ? 409 : 400
          return fail(status, error.code || 'SOS_STORE_FAILED', error.message || 'SOS could not be stored', { storage: { ok: false } })
        }
        event = data as SosEvent
        eventType = 'sos_created'
      } else if (action === 'resolve') {
        const { data, error } = await supabase.rpc('resolve_party_sos', { p_sos_id: body.sosId })
        if (error) {
          const status = error.code === '42501' ? 403 : error.code === 'P0002' ? 404 : 400
          return fail(status, error.code || 'SOS_RESOLVE_FAILED', error.message || 'SOS could not be resolved', { storage: { ok: false } })
        }
        event = data as SosEvent
        eventType = 'sos_resolved'
      } else {
        return fail(400, 'INVALID_ACTION', 'Action must be create or resolve')
      }

      if (!event?.id) return fail(500, 'SOS_STORE_FAILED', 'SOS storage returned no event', { storage: { ok: false } })

      let notifications: Record<string, unknown>
      try {
        notifications = await dispatchPartyNotifications(supabaseAdmin, event, eventType)
      } catch (error) {
        console.error('Party SOS notification dispatch failed', { eventId: event.id })
        notifications = { configured: Boolean(parseServiceAccount()), sent: 0, failed: 1, error: error instanceof Error ? error.message : 'Notification dispatch failed' }
      }

      return Response.json({ ok: true, storage: { ok: true }, notifications, event })
    },
  ),
}
