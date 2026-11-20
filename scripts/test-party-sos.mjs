import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = relative => readFileSync(path.join(root, relative), 'utf8')
const app = read('dist/app.js')
const html = read('dist/index.html')
const css = read('dist/styles.css')
const migration = read('supabase/migrations/20261119055204_add_party_sos_and_push_delivery.sql')
const registerPush = read('supabase/functions/register-push-token/index.ts')
const partySos = read('supabase/functions/party-sos/index.ts')
const sharedFcm = read('supabase/functions/_shared/fcm.ts')
const androidApp = read('android/app/src/main/assets/public/app.js')
const androidHtml = read('android/app/src/main/assets/public/index.html')
const androidCss = read('android/app/src/main/assets/public/styles.css')
const results = []
const check = (name, pass) => results.push({ name, pass: Boolean(pass) })

check('sos_button_tool_size_and_tap_confirm_modal', /id="partySosButton"/.test(html) && /id="partySosConfirmModal"/.test(html)
  && /\.party-sos-control\s*\{[^}]*width:\s*36px/.test(css) && /calc\(var\(--pc-ctrl-btn-h\)\s*\+\s*6px\)/.test(css)
  && /openPartySosConfirm\(\)/.test(app) && !/PARTY_SOS_HOLD_MS|beginPartySosHold|3초간 길게/.test(app + html))
check('party_ride_only_visibility', /isPartyRideActive\(\)\s*&&\s*onRideSurface/.test(app))
check('fresh_gps_required', /PARTY_SOS_FIX_MAX_AGE_MS\s*=\s*30000/.test(app)
  && /requestFreshPartyGpsFix\(\)/.test(app))
check('pointer_cancel_and_duplicate_guard', /pointercancel/.test(app)
  && /partySosRuntime\.sending/.test(app) && /clientRequestId/.test(app))
check('realtime_and_reconnect_restore', /party-sos:\$\{party\.id\}/.test(app)
  && /postgres_changes/.test(app) && /refreshActivePartySos/.test(app))
check('marker_and_requester_resolve', /party-sos-marker/.test(app)
  && /resolveOwnPartySos/.test(app) && /Only the original requester/.test(migration))
check('resolve_uses_same_button_via_confirm_modal', /confirmAction:\s*''/.test(app)
  && /action === 'resolve' && sosId/.test(app)
  && /resolveOwnPartySos\(sosId, true\)/.test(app)
  && /await createPartySos\(\)/.test(app)
  && /현재 SOS 요청을 해제하시겠습니까\?/.test(app) && /긴급 SOS 요청을 전송하시겠습니까\?/.test(app)
  && !/confirm\('SOS를 해제/.test(app)
  && !/popupEl\.append\(resolveButton\)/.test(app))
check('push_token_auto_registration', /powderline:fcm-token/.test(app)
  && /register-push-token/.test(app) && /push_devices/.test(registerPush))
check('notification_navigation', /powderline:push-action/.test(app)
  && /openPartySosFromPush/.test(app) && /map\.easeTo/.test(app))
check('sos_rls_and_rpc_authorization', /enable row level security/i.test(migration)
  && /party_sos_select_same_party/.test(migration)
  && /party_private\.is_party_member/.test(migration)
  && /Only the requester can resolve this SOS/.test(migration))
check('immutable_sos_coordinates', /SOS coordinates are immutable snapshots/.test(migration)
  && !/update public\.party_sos_events[\s\S]*latitude\s*=/i.test(migration))
check('fcm_secret_server_only', /Deno\.env\.get\('FIREBASE_SERVICE_ACCOUNT_JSON'\)/.test(sharedFcm)
  && !/FIREBASE_SERVICE_ACCOUNT_JSON/.test(app + html)
  && !/-----BEGIN PRIVATE KEY-----\\n[A-Za-z0-9+/]{20}/.test(sharedFcm))
check('fcm_http_v1_and_recipient_exclusion', /fcm\.googleapis\.com\/v1\/projects/.test(sharedFcm)
  && /\.neq\('user_id', event\.requester_id\)/.test(partySos))
check('delivery_dedup_and_failure_audit', /dedupe_key text not null unique/.test(migration)
  && /party_sos_notification_deliveries/.test(partySos)
  && /status: 'failed'|finishDelivery\(admin, claimId, 'failed'/.test(partySos))
check('safety_notice_present', /긴급 구조 신고를 대신하지 않습니다/.test(html)
  && /FCM 수신은 보장되지 않으며 긴급 구조 신고를 대신하지 않습니다/.test(app))
check('android_web_assets_synced', androidApp === app && androidHtml === html && androidCss === css)

const summary = {
  scope: 'static SOS wiring, security, and syntax-adjacent checks; no remote deployment or device delivery',
  passed: results.filter(result => result.pass).length,
  failed: results.filter(result => !result.pass).length,
}
const output = { ranAt: new Date().toISOString(), summary, results }
mkdirSync(path.join(root, 'work'), { recursive: true })
writeFileSync(path.join(root, 'work', 'party-sos-tests.json'), JSON.stringify(output, null, 2) + '\n')
for (const result of results) if (!result.pass) console.error('FAIL', result.name)
console.log(JSON.stringify(summary))
process.exitCode = summary.failed ? 1 : 0
