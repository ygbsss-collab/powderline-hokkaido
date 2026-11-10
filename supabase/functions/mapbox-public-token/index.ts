import { withSupabase } from 'npm:@supabase/server@1.9.2'

const PUBLIC_TOKEN_PREFIX = 'pk.'
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'apikey, x-client-info',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Max-Age': '86400',
}

export default {
  fetch: withSupabase(
    { auth: 'publishable', cors: { headers: corsHeaders } },
    async (request) => {
      if (request.method !== 'GET') {
        return Response.json(
          { error: 'Method not allowed' },
          {
            status: 405,
            headers: {
              Allow: 'GET',
              'Cache-Control': 'no-store',
            },
          },
        )
      }

      const token = Deno.env.get('MAPBOX_PUBLIC_TOKEN')?.trim() ?? ''
      if (!token.startsWith(PUBLIC_TOKEN_PREFIX)) {
        console.error('MAPBOX_PUBLIC_TOKEN is missing or is not a pk. public token')
        return Response.json(
          { error: 'Mapbox public token is not configured' },
          { status: 503, headers: { 'Cache-Control': 'no-store' } },
        )
      }

      return Response.json(
        { token },
        {
          headers: {
            'Cache-Control': 'private, no-store, max-age=0',
            Pragma: 'no-cache',
          },
        },
      )
    },
  ),
}
