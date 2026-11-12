import { withSupabase } from 'npm:@supabase/server@1.9.2'
import { DEFAULT_REPOSITORY, planDispatch, REGION_ID, sendRepositoryDispatch } from './logic.ts'

// Called by the admin web UI right after a region was saved. It verifies the caller is an administrator,
// checks that the region is really waiting (pending) and then asks GitHub Actions to collect just that region.
// The GitHub token (secret GITHUB_DISPATCH_TOKEN) never leaves this function. A failure here is harmless:
// the region stays `pending` and the hourly scheduled run collects it.
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
}

export default {
  fetch: withSupabase(
    { auth: 'user', cors: { headers: corsHeaders } },
    async (request, { supabase, supabaseAdmin }) => {
      if (request.method !== 'POST') {
        return Response.json({ error: 'Method not allowed' }, { status: 405, headers: { Allow: 'POST' } })
      }

      const { data: isAdmin, error: adminError } = await supabase.rpc('is_admin')
      if (adminError || isAdmin !== true) {
        return Response.json({ error: 'Administrator access required' }, { status: 403 })
      }

      let regionId = ''
      try {
        const body = await request.json()
        regionId = typeof body?.regionId === 'string' ? body.regionId.trim() : ''
      } catch {
        return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
      }
      if (!REGION_ID.test(regionId)) {
        return Response.json({ error: 'Invalid regionId' }, { status: 400 })
      }

      const { data: row, error: rowError } = await supabaseAdmin.from('powderline_regions')
        .select('id,ski_data_status,bbox').eq('id', regionId).maybeSingle()
      if (rowError) {
        console.error('Could not read region', rowError)
        return Response.json({ error: 'Could not read region' }, { status: 500 })
      }

      const plan = planDispatch(row)
      if (!plan.dispatch) {
        return Response.json({ dispatched: false, reason: plan.reason, status: row?.ski_data_status ?? null }, { status: plan.code })
      }

      const token = Deno.env.get('GITHUB_DISPATCH_TOKEN')?.trim() ?? ''
      if (!token) {
        console.error('GITHUB_DISPATCH_TOKEN is not configured')
        return Response.json({ dispatched: false, reason: 'not-configured' }, { status: 503 })
      }
      const repository = Deno.env.get('GITHUB_REPOSITORY')?.trim() || DEFAULT_REPOSITORY

      try {
        const result = await sendRepositoryDispatch(fetch, token, repository, regionId)
        if (!result.ok) {
          console.error(`GitHub dispatch rejected for ${regionId}: HTTP ${result.status}`)
          return Response.json({ dispatched: false, reason: 'github-rejected' }, { status: 502 })
        }
      } catch (error) {
        console.error(`GitHub dispatch failed for ${regionId}`, error instanceof Error ? error.message : error)
        return Response.json({ dispatched: false, reason: 'github-unreachable' }, { status: 502 })
      }
      return Response.json({ dispatched: true, regionId }, { status: 202 })
    },
  ),
}
