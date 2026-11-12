// Pure helpers (no Deno/npm imports) so they can be unit-tested with plain Node.

export const REGION_ID = /^[a-z][a-z0-9_]{0,49}$/
export const DEFAULT_REPOSITORY = 'ygbsss-collab/powderline-hokkaido'
export const EVENT_TYPE = 'region-saved'

export type RegionRow = { id: string; ski_data_status: string; bbox: unknown } | null

export type Plan =
  | { dispatch: true }
  | { dispatch: false; code: number; reason: 'not-found' | 'no-bbox' | 'already-processing' | 'nothing-to-do' | 'retry-by-schedule' }

// Only a region that is waiting (pending) triggers an immediate run. processing = a run already owns it,
// failed = retried by the scheduled run after its cool-down, anything else has nothing to collect.
export function planDispatch(row: RegionRow): Plan {
  if (!row) return { dispatch: false, code: 404, reason: 'not-found' }
  if (!Array.isArray(row.bbox) || row.bbox.length !== 4) return { dispatch: false, code: 422, reason: 'no-bbox' }
  if (row.ski_data_status === 'pending') return { dispatch: true }
  if (row.ski_data_status === 'processing') return { dispatch: false, code: 202, reason: 'already-processing' }
  if (row.ski_data_status === 'failed') return { dispatch: false, code: 202, reason: 'retry-by-schedule' }
  return { dispatch: false, code: 202, reason: 'nothing-to-do' }
}

// repository_dispatch -> the existing workflow (event type region-saved). The token only ever lives in the Edge Function secret.
export async function sendRepositoryDispatch(
  fetchImpl: typeof fetch,
  token: string,
  repository: string,
  regionId: string,
): Promise<{ ok: boolean; status: number }> {
  const response = await fetchImpl(`https://api.github.com/repos/${repository}/dispatches`, {
    method: 'POST',
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      'user-agent': 'powderline-dispatch-region-ingest',
      'x-github-api-version': '2022-11-28',
    },
    body: JSON.stringify({ event_type: EVENT_TYPE, client_payload: { region: regionId } }),
    signal: AbortSignal.timeout(10_000),
  })
  return { ok: response.status === 204, status: response.status }
}
