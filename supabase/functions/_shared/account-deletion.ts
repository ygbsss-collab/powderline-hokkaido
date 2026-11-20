// Dependency injection keeps destructive paths testable without Auth/Storage/API calls.
type User = { id: string; email?: string }
type Reply = { data: Record<string, any> | null; error?: { code?: string } | null }
export type DeletionDependencies = {
  getUser: () => Promise<User | null>
  getProfile: (id: string) => Promise<{ role: string; status: string } | null>
  verifyPassword: (user: User, password: string) => Promise<boolean>
  rpc: (name: string, args: Record<string, unknown>) => Promise<Reply>
  removePhotos: (paths: string[]) => Promise<{ error?: unknown }>
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const fail = (status: number, code: string) => Response.json({ ok: false, code }, { status })
const blocking = new Set(['LAST_ADMIN', 'PARTY_LEADER', 'ROUTE_IN_USE', 'PARTY_HISTORY',
  'ADMIN_TARGET', 'REQUEST_CONFLICT', 'ACCOUNT_EXISTS'])

export function createAccountDeletionHandler(deps: DeletionDependencies, admin = false) {
  return async (request: Request): Promise<Response> => {
    if (request.method !== 'POST') return fail(405, 'METHOD_NOT_ALLOWED')
    try {
      const user = await deps.getUser()
      if (!user?.id || !user.email) return fail(401, 'UNAUTHORIZED')
      let body: Record<string, unknown>
      try { body = await request.json() } catch { return fail(400, 'BAD_REQUEST') }
      if (!body || body.confirm !== true) return fail(400, 'CONFIRM_REQUIRED')
      if (typeof body.request_id !== 'string' || !UUID.test(body.request_id)) return fail(400, 'REQUEST_ID_REQUIRED')
      if (typeof body.password !== 'string' || !body.password || body.password.length > 256) return fail(400, 'PASSWORD_REQUIRED')
      if (admin) {
        const profile = await deps.getProfile(user.id)
        if (profile?.role !== 'admin' || profile.status !== 'approved') return fail(403, 'FORBIDDEN')
      } else if (body.target_user_id !== undefined || body.action !== undefined) {
        return fail(400, 'OWN_ACCOUNT_ONLY')
      }
      const retryCleanup = admin && body.action === 'retry-cleanup'
      if (admin && body.action !== undefined && !['delete', 'retry-cleanup'].includes(String(body.action))) return fail(400, 'BAD_REQUEST')
      if (admin && !retryCleanup && (typeof body.target_user_id !== 'string' || !UUID.test(body.target_user_id)
          || body.target_user_id === user.id || typeof body.confirmation_email !== 'string'
          || !body.confirmation_email.trim())) return fail(400, 'CONFIRM_REQUIRED')
      if (!await deps.verifyPassword(user, body.password)) return fail(401, 'PASSWORD_INVALID')

      let requestId = body.request_id
      if (!retryCleanup) {
        const args: Record<string, unknown> = { actor_user: user.id,
          target_user: admin ? body.target_user_id : user.id, request_id: requestId }
        if (admin) args.confirmation_email = String(body.confirmation_email).trim()
        const { data, error } = await deps.rpc(admin ? 'admin_delete_account' : 'delete_own_account', args)
        if (error) return fail(['42883','PGRST202'].includes(error.code || '') ? 503 : 500,
          ['42883','PGRST202'].includes(error.code || '') ? 'NOT_DEPLOYED' : 'REQUEST_UNCERTAIN')
        if (data?.ok !== true) {
          const code = typeof data?.code === 'string' ? data.code : 'REQUEST_UNCERTAIN'
          return fail(blocking.has(code) ? 409 : code === 'NOT_FOUND' ? 404 : 400, code)
        }
        if (typeof data.request_id !== 'string' || !UUID.test(data.request_id)) return fail(503, 'REQUEST_UNCERTAIN')
        requestId = data.request_id
      }
      // DB commit is definitive. Storage is separate: retain a durable pending record on ANY failure.
      let cleanupPending = true
      try {
        const job = await deps.rpc('get_account_photo_cleanup', { actor_user: user.id, request_id: requestId })
        if (job.error || job.data?.ok !== true) throw new Error('Cleanup unavailable')
        const target = job.data.target_id
        const paths = job.data.photo_paths
        if (typeof target !== 'string' || !UUID.test(target) || !Array.isArray(paths) || paths.length > 10000
            || paths.some(p => typeof p !== 'string' || !p.startsWith(target + '/') || p.includes('..'))) {
          throw new Error('Invalid cleanup scope')
        }
        for (let i = 0; i < paths.length; i += 100) {
          if ((await deps.removePhotos(paths.slice(i, i + 100))).error) throw new Error('Cleanup pending')
        }
        const complete = await deps.rpc('complete_account_photo_cleanup', { actor_user: user.id, request_id: requestId })
        cleanupPending = Boolean(complete.error || complete.data?.ok !== true || complete.data.cleanup_pending !== false)
      } catch { /* No credential, email, response body or raw error is logged. Retry via the admin endpoint. */ }
      return Response.json({ ok: true, request_id: requestId, cleanup_pending: cleanupPending })
    } catch {
      // A lost response cannot prove rollback: never claim that the account is unchanged.
      return fail(503, 'REQUEST_UNCERTAIN')
    }
  }
}
