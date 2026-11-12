// Busca cotações (CoinGecko, brapi) e câmbio USD-BRL e grava em prices.
// Chamada pelo pg_cron a cada 15 min (header x-cron-secret) ou pelo dono do app ("Atualizar agora").
// Erro ou limite (429) em uma fonte nunca apaga o último preço bom: só grava o que veio válido.
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { isB3Open, parseAwesomeFx, parseBrapi, parseBrapiFx, parseCoinGecko, type Quote } from '../_shared/quotes.ts'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

async function getJson(url: string, headers: Record<string, string> = {}): Promise<unknown> {
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(10_000) })
  if (!res.ok) throw new Error(`${new URL(url).hostname} respondeu ${res.status}`)
  return await res.json()
}

/** Quem está chamando: o cron (todos os usuários) ou um usuário logado (só os ativos dele). */
async function authorize(req: Request, admin: SupabaseClient): Promise<{ userId: string | null } | null> {
  const secret = Deno.env.get('CRON_SECRET')
  if (secret && req.headers.get('x-cron-secret') === secret) return { userId: null }
  const token = req.headers.get('Authorization')?.replace(/^Bearer /, '')
  if (!token) return null
  const { data } = await admin.auth.getUser(token)
  return data.user ? { userId: data.user.id } : null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const caller = await authorize(req, admin)
  if (!caller) return json({ error: 'não autorizado' }, 401)

  let assetsQuery = admin.from('assets').select('id, user_id, source, source_id').neq('source', 'manual')
  let pricesQuery = admin.from('prices').select('user_id, asset_id, fx_pair, fetched_at')
  if (caller.userId) {
    assetsQuery = assetsQuery.eq('user_id', caller.userId)
    pricesQuery = pricesQuery.eq('user_id', caller.userId)
  }
  const [{ data: assets, error: assetsError }, { data: existing, error: pricesError }] =
    await Promise.all([assetsQuery, pricesQuery])
  if (assetsError || pricesError) return json({ error: (assetsError ?? pricesError)!.message }, 500)

  // Chamada manual: no máximo uma por minuto, para não gastar a cota das APIs.
  if (caller.userId) {
    const last = Math.max(0, ...existing.map((p) => new Date(p.fetched_at).getTime()))
    if (Date.now() - last < 60_000) return json({ skipped: 'atualizado há menos de 1 minuto' })
  }

  const now = new Date()
  const b3Open = isB3Open(now)
  const hasPrice = new Set(existing.map((p) => p.asset_id))
  const errors: string[] = []
  const rows: Record<string, unknown>[] = []
  const push = (a: { id: string; user_id: string }, q: Quote, currency: 'USD' | 'BRL') =>
    rows.push({
      user_id: a.user_id, asset_id: a.id, price: q.price, currency,
      change_pct_24h: q.changePct24h, source_ts: q.sourceTs, fetched_at: now.toISOString(),
    })

  // --- Cripto: 24 horas, todos os IDs em uma chamada.
  const crypto = assets.filter((a) => a.source === 'coingecko' && a.source_id)
  if (crypto.length) {
    try {
      const ids = [...new Set(crypto.map((a) => a.source_id))].join(',')
      const quotes = parseCoinGecko(
        await getJson(
          `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(ids)}` +
            '&vs_currencies=usd&include_24hr_change=true&include_last_updated_at=true',
          { 'x-cg-demo-api-key': Deno.env.get('COINGECKO_API_KEY') ?? '' },
        ),
        now,
      )
      for (const a of crypto) {
        const q = quotes.get(a.source_id)
        if (q) push(a, q, 'USD')
        else errors.push(`CoinGecko não devolveu preço para "${a.source_id}" (confira o ID)`)
      }
    } catch (e) {
      errors.push(`CoinGecko: ${(e as Error).message}`)
    }
  }

  // --- B3: só em horário de pregão, ou quando o ativo ainda não tem nenhum preço.
  const brapiToken = Deno.env.get('BRAPI_TOKEN') ?? ''
  const brapiAuth = { Authorization: `Bearer ${brapiToken}` }
  const b3 = assets.filter((a) => a.source === 'brapi' && a.source_id && (b3Open || !hasPrice.has(a.id)))
  if (b3.length) {
    const tickers = [...new Set(b3.map((a) => a.source_id.toUpperCase()))]
    const quotes = new Map<string, Quote>()
    try {
      for (const [k, v] of parseBrapi(await getJson(`https://brapi.dev/api/quote/${tickers.join(',')}`, brapiAuth), now)) {
        quotes.set(k, v)
      }
    } catch (e) {
      // O plano gratuito pode limitar o número de ativos por chamada: tenta um a um.
      if (tickers.length > 1 && !(e as Error).message.includes('429')) {
        for (const t of tickers) {
          try {
            for (const [k, v] of parseBrapi(await getJson(`https://brapi.dev/api/quote/${t}`, brapiAuth), now)) quotes.set(k, v)
          } catch (e2) {
            errors.push(`brapi ${t}: ${(e2 as Error).message}`)
          }
        }
      } else {
        errors.push(`brapi: ${(e as Error).message}`)
      }
    }
    for (const a of b3) {
      const q = quotes.get(a.source_id.toUpperCase())
      if (q) push(a, q, 'BRL')
    }
  }

  // --- Câmbio USD-BRL: uma linha por usuário. Mesma janela da B3; brapi primeiro, AwesomeAPI de reserva.
  const users = [...new Set(assets.map((a) => a.user_id as string))]
  const hasFx = new Set(existing.filter((p) => p.fx_pair === 'USD-BRL').map((p) => p.user_id))
  const fxUsers = users.filter((u) => b3Open || !hasFx.has(u))
  const fxRows: Record<string, unknown>[] = []
  if (fxUsers.length) {
    let fx: Quote | null = null
    try {
      fx = parseBrapiFx(await getJson('https://brapi.dev/api/v2/currency?currency=USD-BRL', brapiAuth), now)
    } catch { /* tenta a reserva */ }
    if (!fx) {
      try {
        fx = parseAwesomeFx(await getJson('https://economia.awesomeapi.com.br/json/last/USD-BRL'), now)
      } catch (e) {
        errors.push(`câmbio: ${(e as Error).message}`)
      }
    }
    if (fx) {
      for (const u of fxUsers) {
        fxRows.push({
          user_id: u, fx_pair: 'USD-BRL', price: fx.price, currency: 'BRL',
          change_pct_24h: fx.changePct24h, source_ts: fx.sourceTs, fetched_at: now.toISOString(),
        })
      }
    } else if (!errors.some((e) => e.startsWith('câmbio'))) {
      errors.push('câmbio: nenhuma fonte devolveu USD-BRL')
    }
  }

  if (rows.length) {
    const { error } = await admin.from('prices').upsert(rows, { onConflict: 'user_id,asset_id' })
    if (error) errors.push(`gravação: ${error.message}`)
  }
  if (fxRows.length) {
    const { error } = await admin.from('prices').upsert(fxRows, { onConflict: 'user_id,fx_pair' })
    if (error) errors.push(`gravação do câmbio: ${error.message}`)
  }

  if (errors.length) console.error('update-prices:', errors.join(' | '))
  const updated = rows.length + fxRows.length
  return json({ updated, b3Open, errors }, updated === 0 && errors.length ? 502 : 200)
})
