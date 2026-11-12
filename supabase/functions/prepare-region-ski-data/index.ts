import { withSupabase } from 'npm:@supabase/server@1.9.2'

const STORAGE_BUCKET = 'ski-data'
const MAX_BBOX_WIDTH = 0.5
const MAX_BBOX_HEIGHT = 0.5
const MAX_BBOX_AREA = 0.05
const MAX_BBOX_LATITUDE = 85
const MAX_OVERPASS_BYTES = 12 * 1024 * 1024
const MAX_GEOJSON_BYTES = 6 * 1024 * 1024
// Public Overpass instances often queue requests for 20s+ before answering.
// Worst case 4 x 30s + backoff stays under the Edge Function 150s wall clock.
const OVERPASS_QUERY_TIMEOUT_SEC = 25
const OVERPASS_CLIENT_TIMEOUT_MS = 30_000
const OVERPASS_USER_AGENT = 'Powderline-Hokkaido/1.0 (ski-data-preparer; Supabase Edge Function)'
const STALE_PROCESSING_MS = 5 * 60 * 1000
const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://lz4.overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
] as const

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
}

type Bbox = [number, number, number, number]
type OverpassElement = {
  type?: string
  id?: number
  tags?: Record<string, string>
  geometry?: Array<{ lat: number; lon: number }>
}

function parseBbox(value: unknown, centerLngValue: unknown, centerLatValue: unknown): Bbox | null {
  if (!Array.isArray(value) || value.length !== 4) return null
  const bbox = value.map(Number) as Bbox
  const [west, south, east, north] = bbox
  const centerLng = Number(centerLngValue)
  const centerLat = Number(centerLatValue)
  if (!bbox.every(Number.isFinite) || !Number.isFinite(centerLng) || !Number.isFinite(centerLat) ||
      west < -180 || east > 180 || south < -MAX_BBOX_LATITUDE || north > MAX_BBOX_LATITUDE ||
      west >= east || south >= north) return null
  const width = east - west
  const height = north - south
  if (width > MAX_BBOX_WIDTH || height > MAX_BBOX_HEIGHT || width * height > MAX_BBOX_AREA) return null
  if (centerLng < west || centerLng > east || centerLat < south || centerLat > north) return null
  return bbox
}

function overpassQuery([west, south, east, north]: Bbox) {
  const bounds = `${south},${west},${north},${east}`
  return `[out:json][timeout:${OVERPASS_QUERY_TIMEOUT_SEC}];(` +
    `way["aerialway"](${bounds});` +
    `way["piste:type"](${bounds});` +
    `);out geom;`
}

async function extractErrorDetail(response: Response): Promise<string> {
  try {
    const text = await response.text()
    if (!text) return ''
    const clean = text
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    return clean ? `: ${clean.slice(0, 150)}` : ''
  } catch {
    return ''
  }
}

async function requestOverpassEndpoint(
  endpoint: string,
  query: string,
  signal: AbortSignal,
): Promise<{ elements: OverpassElement[] }> {
  const commonHeaders: Record<string, string> = {
    accept: 'application/json, */*;q=0.8',
    // overpass-api.de's nginx answers 406 to anonymous/generic clients; identify explicitly.
    'user-agent': OVERPASS_USER_AGENT,
  }

  const encodedQuery = encodeURIComponent(query)

  // 1. Primary: POST with application/x-www-form-urlencoded (without charset suffix)
  let response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      ...commonHeaders,
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: `data=${encodedQuery}`,
    signal,
  })

  // 2. Fallback: retry with GET only for method/media-type rejections. 406 is a
  // client-policy rejection by the server and a GET with the same headers fails too.
  if (!response.ok && [405, 415].includes(response.status)) {
    const postStatus = response.status
    const postDetail = await extractErrorDetail(response)
    const getUrl = `${endpoint}?data=${encodedQuery}`
    const getResponse = await fetch(getUrl, {
      method: 'GET',
      headers: commonHeaders,
      signal,
    })
    if (getResponse.ok) {
      response = getResponse
    } else {
      const getDetail = await extractErrorDetail(getResponse)
      throw new Error(`POST HTTP ${postStatus}${postDetail} -> GET HTTP ${getResponse.status}${getDetail}`)
    }
  }

  if (!response.ok) {
    const detail = await extractErrorDetail(response)
    const hint = response.status === 406 ? ' [server rejected client (User-Agent/IP policy)]' : ''
    throw new Error(`HTTP ${response.status} (${response.statusText || 'Error'})${hint}${detail}`)
  }

  const contentLength = Number(response.headers.get('content-length') || 0)
  if (contentLength > MAX_OVERPASS_BYTES) throw new Error('response too large')
  const text = await response.text()
  if (new TextEncoder().encode(text).byteLength > MAX_OVERPASS_BYTES) throw new Error('response too large')
  const payload = JSON.parse(text)
  if (payload?.remark) throw new Error(`Overpass remark: ${String(payload.remark).slice(0, 160)}`)
  if (!Array.isArray(payload?.elements)) throw new Error('invalid Overpass response')
  return { elements: payload.elements as OverpassElement[] }
}

async function fetchOverpass(bbox: Bbox) {
  const query = overpassQuery(bbox)
  const failures: string[] = []

  for (let attempt = 0; attempt < OVERPASS_ENDPOINTS.length; attempt += 1) {
    const endpoint = OVERPASS_ENDPOINTS[attempt]
    const controller = new AbortController()
    let timedOut = false
    const timeout = setTimeout(() => {
      timedOut = true
      controller.abort()
    }, OVERPASS_CLIENT_TIMEOUT_MS)

    const host = new URL(endpoint).host
    try {
      const result = await requestOverpassEndpoint(endpoint, query, controller.signal)
      return { elements: result.elements, endpoint }
    } catch (error) {
      const msg = timedOut
        ? `Timeout after ${OVERPASS_CLIENT_TIMEOUT_MS}ms`
        : (error instanceof Error ? error.message : String(error))
      failures.push(`${host}: ${msg}`)
      console.warn(`[prepare-region-ski-data] Overpass attempt ${attempt + 1}/${OVERPASS_ENDPOINTS.length} (${host}) failed: ${msg}`)
      if (attempt < OVERPASS_ENDPOINTS.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)))
      }
    } finally {
      clearTimeout(timeout)
    }
  }

  throw new Error(`Overpass failed after ${OVERPASS_ENDPOINTS.length} attempts (${failures.join('; ')})`)
}

function convertElements(elements: OverpassElement[], regionId: string) {
  const features: Record<string, unknown>[] = []
  let lifts = 0
  let runs = 0

  for (const element of elements) {
    if (element.type !== 'way' || !element.id || !Array.isArray(element.geometry) || element.geometry.length < 2) continue
    const coordinates = element.geometry
      .filter(point => Number.isFinite(point?.lon) && Number.isFinite(point?.lat))
      .map(point => [point.lon, point.lat])
    if (coordinates.length < 2) continue

    const tags = element.tags || {}
    const sourceId = `way/${element.id}`
    if (tags.aerialway && !/^(station|pylon)$/.test(tags.aerialway)) {
      features.push({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates },
        properties: {
          id: sourceId,
          ref: tags.ref || null,
          name: tags.name || tags['name:en'] || tags['name:ja'] || null,
          type: 'lift',
          status: tags.disused === 'yes' ? 'closed' : 'operating',
          sources: [{ id: sourceId, type: 'openstreetmap' }],
          liftType: tags.aerialway,
          capacity: tags.capacity ? Number(tags.capacity) || null : null,
          duration: tags.duration ? Number(tags.duration) || null : null,
          powderlineType: 'lift',
          powderlineRegion: regionId,
        },
      })
      lifts += 1
    } else if (/(^|;)downhill(;|$)/.test(tags['piste:type'] || '')) {
      features.push({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates },
        properties: {
          id: sourceId,
          ref: tags.ref || null,
          name: tags.name || tags['name:en'] || tags['name:ja'] || null,
          type: 'run',
          uses: ['downhill'],
          status: tags.disused === 'yes' ? 'closed' : 'operating',
          sources: [{ id: sourceId, type: 'openstreetmap' }],
          difficulty: tags['piste:difficulty'] || null,
          grooming: tags['piste:grooming'] || null,
          powderlineType: 'run',
          powderlineRegion: regionId,
        },
      })
      runs += 1
    }
  }

  return { features, counts: { lifts, runs, stations: 0 } }
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
      if (!/^[a-z][a-z0-9_]{0,49}$/.test(regionId)) {
        return Response.json({ error: 'Invalid regionId' }, { status: 400 })
      }

      const staleBefore = new Date(Date.now() - STALE_PROCESSING_MS).toISOString()
      const { data: claims, error: claimError } = await supabaseAdmin.rpc('claim_powderline_region_ski_data', {
        p_region_id: regionId,
        p_stale_before: staleBefore,
      })
      if (claimError) {
        console.error('Could not claim ski data preparation', claimError)
        return Response.json({ error: 'Could not start ski data preparation' }, { status: 500 })
      }

      const claim = claims?.[0]
      if (!claim) {
        const { data: region } = await supabaseAdmin.from('powderline_regions')
          .select('ski_data_status,bbox').eq('id', regionId).maybeSingle()
        if (!region) return Response.json({ error: 'Region not found' }, { status: 404 })
        if (!region.bbox) return Response.json({ error: 'Region BBox is required' }, { status: 422 })
        return Response.json({ accepted: false, status: region.ski_data_status }, { status: 202 })
      }

      const requestId = String(claim.request_id)
      const markFailed = async (message: string) => {
        const safeMessage = message.slice(0, 1000)
        const { error } = await supabaseAdmin.from('powderline_regions').update({
          ski_data_status: 'failed',
          ski_data_completed_at: new Date().toISOString(),
          ski_data_error: safeMessage,
        }).eq('id', regionId).eq('ski_data_request_id', requestId).eq('ski_data_status', 'processing')
        if (error) console.error('Could not record ski data failure', error)
        return safeMessage
      }

      const bbox = parseBbox(claim.bbox, claim.center_lng, claim.center_lat)
      if (!bbox) {
        const message = await markFailed(
          `BBox must use latitude +/-${MAX_BBOX_LATITUDE}, width/height <= ${MAX_BBOX_WIDTH}, area <= ${MAX_BBOX_AREA} square degrees, and contain the region center`,
        )
        return Response.json({ error: message, regionId, status: 'failed' }, { status: 422 })
      }

      try {
        const { elements, endpoint } = await fetchOverpass(bbox)
        const converted = convertElements(elements, regionId)
        const generatedAt = new Date().toISOString()
        const status = converted.features.length ? 'available' : 'empty'
        const collection = {
          type: 'FeatureCollection',
          metadata: {
            region: regionId,
            generatedAt,
            source: 'OpenStreetMap via Overpass API',
            sourceEndpoint: endpoint,
            license: 'ODbL 1.0',
            attribution: '© OpenStreetMap contributors',
            counts: converted.counts,
            status,
          },
          features: converted.features,
        }
        const bytes = new TextEncoder().encode(`${JSON.stringify(collection)}\n`)
        if (bytes.byteLength > MAX_GEOJSON_BYTES) throw new Error('Generated GeoJSON exceeds the 6 MiB storage limit')

        const { error: uploadError } = await supabaseAdmin.storage.from(STORAGE_BUCKET)
          .upload(`${regionId}.geojson`, bytes, { contentType: 'application/geo+json', upsert: true })
        if (uploadError) throw new Error(`Storage upload failed: ${uploadError.message}`)

        const { data: completed, error: completeError } = await supabaseAdmin.from('powderline_regions').update({
          ski_data_status: converted.features.length ? 'ready' : 'empty',
          ski_data_completed_at: generatedAt,
          ski_data_error: null,
          ski_data_feature_count: converted.features.length,
          ski_data_file_size: bytes.byteLength,
          offline_data_version: generatedAt,
        }).eq('id', regionId).eq('ski_data_request_id', requestId).eq('ski_data_status', 'processing')
          .select('id').maybeSingle()
        if (completeError || !completed) throw new Error('Preparation result became stale before completion')

        return Response.json({
          accepted: true,
          regionId,
          status: converted.features.length ? 'ready' : 'empty',
          counts: converted.counts,
          fileSize: bytes.byteLength,
          path: `${STORAGE_BUCKET}/${regionId}.geojson`,
        })
      } catch (error) {
        const message = await markFailed(error instanceof Error ? error.message : String(error))
        console.error(`Ski data preparation failed for ${regionId}: ${message}`)
        return Response.json({ error: message, regionId, status: 'failed' }, { status: 502 })
      }
    },
  ),
}
