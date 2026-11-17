// Lembrete diário por notificação.
// - Chamada pelo pg_cron a cada hora (header x-cron-secret): avisa quem escolheu esta hora
//   (horário de Brasília) e tem compra do plano para hoje ou atrasada.
// - Chamada pelo app (usuário logado): { action: 'public-key' } devolve a chave pública VAPID
//   (gerada e guardada no Vault na primeira vez); { action: 'test' } manda uma notificação de teste.
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { brasiliaNow, reminderText, type DueItem } from './reminder.ts'
import { generateVapidKeys, sendPush, type PushSubscriptionKeys, type VapidKeys } from './webpush.ts'

const APP_URL = 'https://gabrielnassa.github.io/NassaCapital/'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

/** Lê as chaves VAPID do Vault; gera e guarda na primeira vez. */
async function vapidKeys(admin: SupabaseClient): Promise<VapidKeys> {
  const read = async () => {
    const [{ data: pub }, { data: priv }] = await Promise.all([admin.rpc('vapid_public_key'), admin.rpc('vapid_private_jwk')])
    return pub && priv ? { publicKey: pub as string, privateJwk: JSON.parse(priv as string), subject: APP_URL } : null
  }
  const existing = await read()
  if (existing) return existing
  const fresh = await generateVapidKeys()
  const { error } = await admin.rpc('store_vapid_keys', { p_public: fresh.publicKey, p_private_jwk: JSON.stringify(fresh.privateJwk) })
  if (error) throw new Error(`não foi possível guardar as chaves: ${error.message}`)
  // Se outra chamada gravou ao mesmo tempo, vale a que ficou no Vault.
  return (await read())!
}

async function sendToUser(admin: SupabaseClient, userId: string, message: { title: string; body: string; url: string }, vapid: VapidKeys) {
  const { data: subs } = await admin.from('push_subscriptions').select('id, endpoint, p256dh, auth').eq('user_id', userId)
  let sent = 0
  const errors: string[] = []
  for (const s of (subs ?? []) as (PushSubscriptionKeys & { id: string })[]) {
    try {
      const r = await sendPush(s, message, vapid)
      if (r.gone) await admin.from('push_subscriptions').delete().eq('id', s.id)
      else if (r.status >= 200 && r.status < 300) sent++
      else errors.push(`serviço de push respondeu ${r.status}`)
    } catch (e) {
      errors.push((e as Error).message)
    }
  }
  return { sent, devices: subs?.length ?? 0, errors }
}

/** Compras do plano (ativo) pendentes até hoje. */
async function dueItems(admin: SupabaseClient, userId: string, today: string): Promise<DueItem[]> {
  const { data } = await admin
    .from('dca_executions')
    .select('scheduled_date, planned_amount, item:dca_plan_items(asset:assets(ticker), plan:dca_plans(status, source_currency))')
    .eq('user_id', userId)
    .eq('status', 'pending')
    .lte('scheduled_date', today)
    .order('scheduled_date')
  type Row = { scheduled_date: string; planned_amount: number | string; item: { asset: { ticker: string }; plan: { status: string; source_currency: 'BRL' | 'USD' } } }
  return ((data ?? []) as unknown as Row[])
    .filter((r) => r.item?.plan?.status === 'active')
    .map((r) => ({ ticker: r.item.asset.ticker, amount: Number(r.planned_amount), currency: r.item.plan.source_currency, date: r.scheduled_date }))
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  try {
    // --- cron
    const secret = req.headers.get('x-cron-secret')
    if (secret) {
      const { data: ok } = await admin.rpc('is_cron_secret', { candidate: secret })
      if (ok !== true) return json({ error: 'não autorizado' }, 401)
      const { hour, date } = brasiliaNow(new Date())
      const { data: users } = await admin.from('settings').select('user_id').eq('reminder_hour', hour)
      if (!users?.length) return json({ hour, users: 0, sent: 0 })
      const vapid = await vapidKeys(admin)
      let sent = 0
      const errors: string[] = []
      for (const u of users) {
        const text = reminderText(await dueItems(admin, u.user_id, date), date)
        if (!text) continue
        const r = await sendToUser(admin, u.user_id, { ...text, url: APP_URL }, vapid)
        sent += r.sent
        errors.push(...r.errors)
      }
      if (errors.length) console.error('push:', errors.join(' | '))
      return json({ hour, users: users.length, sent, errors })
    }

    // --- app
    const token = req.headers.get('Authorization')?.replace(/^Bearer /, '') ?? ''
    const { data: auth } = await admin.auth.getUser(token)
    if (!auth.user) return json({ error: 'não autorizado' }, 401)
    const { action } = (await req.json().catch(() => ({}))) as { action?: string }
    const vapid = await vapidKeys(admin)
    if (action === 'public-key') return json({ publicKey: vapid.publicKey })
    if (action === 'test') {
      const r = await sendToUser(admin, auth.user.id, { title: 'Carteira', body: 'Teste: as notificações estão funcionando neste aparelho.', url: APP_URL }, vapid)
      return json(r)
    }
    return json({ error: 'ação inválida' }, 400)
  } catch (e) {
    console.error('push:', (e as Error).message)
    return json({ error: (e as Error).message }, 500)
  }
})
