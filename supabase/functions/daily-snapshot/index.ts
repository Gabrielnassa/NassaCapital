// Grava o patrimônio do dia por classe em snapshots. Chamada 1x por dia pelo pg_cron (header x-cron-secret).
import { createClient } from 'npm:@supabase/supabase-js@2'

Deno.serve(async (req) => {
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const secret = req.headers.get('x-cron-secret')
  const { data: allowed } = secret ? await admin.rpc('is_cron_secret', { candidate: secret }) : { data: false }
  if (allowed !== true) {
    return new Response(JSON.stringify({ error: 'não autorizado' }), { status: 401 })
  }
  const { data, error } = await admin.rpc('take_snapshots')
  if (error) {
    console.error('daily-snapshot:', error.message)
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }
  return new Response(JSON.stringify({ rows: data }), { headers: { 'Content-Type': 'application/json' } })
})
