// Shared server-only Firebase HTTP v1 sender.
export type ServiceAccount = {
  project_id: string
  client_email: string
  private_key: string
  token_uri?: string
}

const encoder = new TextEncoder()
let cachedAccessToken: { value: string; expiresAt: number } | null = null

function base64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

export function parseServiceAccount(): ServiceAccount | null {
  const raw = Deno.env.get('FIREBASE_SERVICE_ACCOUNT_JSON')?.trim()
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<ServiceAccount>
    if (!parsed.project_id || !parsed.client_email || !parsed.private_key) return null
    return parsed as ServiceAccount
  } catch {
    return null
  }
}

async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const body = pem.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, '')
  const der = Uint8Array.from(atob(body), char => char.charCodeAt(0))
  return crypto.subtle.importKey('pkcs8', der,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign'])
}

export async function getFcmAccessToken(account: ServiceAccount): Promise<string> {
  if (cachedAccessToken && cachedAccessToken.expiresAt > Date.now() + 60_000) return cachedAccessToken.value
  const now = Math.floor(Date.now() / 1000)
  const header = base64Url(encoder.encode(JSON.stringify({ alg: 'RS256', typ: 'JWT' })))
  const claims = base64Url(encoder.encode(JSON.stringify({
    iss: account.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: account.token_uri || 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  })))
  const unsigned = `${header}.${claims}`
  const key = await importPrivateKey(account.private_key)
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, encoder.encode(unsigned))
  const assertion = `${unsigned}.${base64Url(new Uint8Array(signature))}`
  const response = await fetch(account.token_uri || 'https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  })
  if (!response.ok) throw new Error(`OAuth token request failed (${response.status})`)
  const payload = await response.json()
  if (typeof payload?.access_token !== 'string') throw new Error('OAuth access token missing')
  cachedAccessToken = {
    value: payload.access_token,
    expiresAt: Date.now() + Math.max(300, Number(payload.expires_in) || 3600) * 1000,
  }
  return cachedAccessToken.value
}

// SOS messages are sent data-only (high priority): Android then delivers them to the app's own messaging service
// even in the background, which shows the repeating SOS alert (SosAlertNotifier, channel powderline_sos_alert) and
// stops it on resolve. Title/body travel inside data. All other notifications keep the regular notification payload.
export function sendFcmMessage(
  account: ServiceAccount,
  accessToken: string,
  token: string,
  title: string,
  body: string,
  data: Record<string, string>,
  options: { dataOnly?: boolean } = {},
): Promise<Response> {
  const message: Record<string, unknown> = options.dataOnly
    ? { token, data: { ...data, title, body }, android: { priority: 'high' } }
    : { token, notification: { title, body }, data, android: { priority: 'high' } }
  return fetch(`https://fcm.googleapis.com/v1/projects/${encodeURIComponent(account.project_id)}/messages:send`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ message }),
  })
}
