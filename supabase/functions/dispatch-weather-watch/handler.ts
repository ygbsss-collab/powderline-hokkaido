// dispatch-weather-watch core (no Deno / npm imports, so it is testable from Node with type stripping).
// Supabase Cron (job 3) -> this function -> GitHub workflow_dispatch of weather-model-watch.yml with
// inputs.scheduler_slot = the slot's correlation UUID. SNORKY pattern:
//   * caller authentication: x-scheduler-token, checked by the service-role-only RPC
//     weather_watch_validate_scheduler_token (value kept in Vault only)
//   * GitHub PAT: ONLY from the Edge Function secret GITHUB_WEATHER_DISPATCH_PAT (never in DB / Vault / pg_net)
//   * duplicates: weather_watch_reserve_dispatch locks the 30-min slot; only a 'ready' slot gets a new attempt
//   * result: weather_watch_record_dispatch classifies the GitHub answer (accepted / rejected / ambiguous)
// Never logs or returns the token, the PAT or GitHub's response body.

export type RpcResult = { data: unknown; error: { code?: string; message?: string } | null };
export type Rpc = (fn: string, args: Record<string, unknown>) => Promise<RpcResult>;
export type Deps = {
  rpc: Rpc;
  getEnv: (name: string) => string | undefined;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

export const GITHUB_DISPATCH_URL =
  'https://api.github.com/repos/ygbsss-collab/powderline-hokkaido/actions/workflows/weather-model-watch.yml/dispatches';

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

export function createDispatchHandler(deps: Deps) {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const timeoutMs = deps.timeoutMs ?? 10000;
  return async (request: Request): Promise<Response> => {
    if (request.method !== 'POST') return json({ ok: false, code: 'METHOD' }, 405);

    // 1. caller = Supabase Cron (or an admin with the same scheduler token)
    const candidate = request.headers.get('x-scheduler-token') || '';
    if (!candidate) return json({ ok: false, code: 'UNAUTHORIZED' }, 401);
    const valid = await deps.rpc('weather_watch_validate_scheduler_token', { candidate });
    if (valid.error) return json({ ok: false, code: 'AUTH_CHECK_FAILED' }, 500);
    if (valid.data !== true) return json({ ok: false, code: 'UNAUTHORIZED' }, 401);

    // 2. credential present before anything is reserved (a missing secret never leaves a pending attempt)
    const pat = deps.getEnv('GITHUB_WEATHER_DISPATCH_PAT') || '';
    if (!pat) return json({ ok: false, code: 'NOT_CONFIGURED' }, 500);

    // optional explicit slot = re-dispatch of an existing slot after weather_scheduler.authorize_retry()
    let slotAt: string | null = null;
    try {
      const body = await request.json();
      if (body && typeof body.slot_at === 'string') {
        if (!Number.isFinite(Date.parse(body.slot_at))) return json({ ok: false, code: 'BAD_SLOT' }, 400);
        slotAt = new Date(body.slot_at).toISOString();
      }
    } catch { /* no / non-JSON body: current slot */ }

    // 3. reserve (slot lock, duplicate / disabled / already accepted -> skip)
    const reserved = await deps.rpc('weather_watch_reserve_dispatch', { p_slot_at: slotAt });
    if (reserved.error) return json({ ok: false, code: 'RESERVE_FAILED' }, 500);
    const r = (reserved.data || {}) as { action?: string; reason?: string; slot_at?: string; attempt_no?: number; correlation_id?: string };
    if (r.action !== 'dispatch') return json({ ok: true, dispatched: false, reason: r.reason || 'skipped', slot_at: r.slot_at ?? null });
    if (!r.slot_at || !Number.isInteger(r.attempt_no) || !r.correlation_id) return json({ ok: false, code: 'RESERVE_INVALID' }, 500);

    // 4. GitHub workflow_dispatch (existing weather-model-watch.yml, input scheduler_slot)
    let transport = 'response';
    let status: number | null = null;
    let runId: number | null = null;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetchImpl(GITHUB_DISPATCH_URL, {
        method: 'POST',
        signal: ctrl.signal,
        headers: {
          Authorization: `Bearer ${pat}`,
          Accept: 'application/vnd.github+json',
          'Content-Type': 'application/json',
          'User-Agent': 'POWDERLINE-weather-scheduler',
          'X-GitHub-Api-Version': '2022-11-28',
        },
        body: JSON.stringify({ ref: 'main', inputs: { scheduler_slot: r.correlation_id } }),
      });
      status = res.status;
      if (res.status === 200) {
        try {
          const b = await res.json();
          if (/^[0-9]{1,18}$/.test(String(b?.workflow_run_id ?? ''))) runId = Number(b.workflow_run_id);
        } catch { /* 200 without a JSON body */ }
      } else {
        try { await res.body?.cancel(); } catch { /* ignore */ }
      }
    } catch (error) {
      transport = (error as { name?: string })?.name === 'AbortError' ? 'timeout' : 'network_error';
    } finally {
      clearTimeout(timer);
    }

    // 5. record (an unrecorded attempt stays 'awaiting_response': no automatic re-dispatch; review + authorize_retry)
    const recorded = await deps.rpc('weather_watch_record_dispatch', {
      p_slot_at: r.slot_at, p_attempt_no: r.attempt_no, p_correlation_id: r.correlation_id,
      p_transport: transport, p_http_status: status, p_reported_run_id: runId,
    });
    if (recorded.error) {
      return json({ ok: false, code: 'RECORD_FAILED', dispatched: true, slot_at: r.slot_at, attempt_no: r.attempt_no, http_status: status }, 500);
    }
    const result = String(recorded.data);
    return json({ ok: result === 'accepted', dispatched: true, result, slot_at: r.slot_at, attempt_no: r.attempt_no,
      correlation_id: r.correlation_id, http_status: status, transport }, result === 'accepted' ? 200 : 502);
  };
}
