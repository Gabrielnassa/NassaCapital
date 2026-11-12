// Busca de ativos para a tela Ajustes: procura no CoinGecko (devolve o ID, não só o ticker)
// ou valida um ticker da B3 na brapi. Só para usuário logado; as chaves ficam no servidor.
import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const token = req.headers.get('Authorization')?.replace(/^Bearer /, '') ?? ''
  const { data: auth } = await admin.auth.getUser(token)
  if (!auth.user) return json({ error: 'não autorizado' }, 401)

  const { source, query } = (await req.json().catch(() => ({}))) as { source?: string; query?: string }
  const q = (query ?? '').trim()
  if (!q || q.length > 40 || (source !== 'coingecko' && source !== 'brapi')) return json({ error: 'pedido inválido' }, 400)

  try {
    if (source === 'coingecko') {
      const res = await fetch(`https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(q)}`, {
        headers: { 'x-cg-demo-api-key': Deno.env.get('COINGECKO_API_KEY') ?? '' },
        signal: AbortSignal.timeout(10_000),
      })
      if (!res.ok) return json({ error: `CoinGecko respondeu ${res.status}` }, 502)
      const body = (await res.json()) as { coins?: { id: string; symbol: string; name: string; market_cap_rank: number | null }[] }
      return json({
        results: (body.coins ?? []).slice(0, 8).map((c) => ({
          source_id: c.id,
          ticker: c.symbol.toUpperCase(),
          name: c.name,
          detail: c.market_cap_rank ? `ID ${c.id} · nº ${c.market_cap_rank} em valor de mercado` : `ID ${c.id} · sem ranking`,
        })),
      })
    }

    const ticker = q.toUpperCase().replace(/[^A-Z0-9]/g, '')
    const res = await fetch(`https://brapi.dev/api/quote/${ticker}`, {
      headers: { Authorization: `Bearer ${Deno.env.get('BRAPI_TOKEN') ?? ''}` },
      signal: AbortSignal.timeout(10_000),
    })
    if (res.status === 404) return json({ results: [] })
    if (!res.ok) return json({ error: `brapi respondeu ${res.status}` }, 502)
    const body = (await res.json()) as { results?: { symbol: string; longName?: string; shortName?: string; regularMarketPrice?: number }[] }
    return json({
      results: (body.results ?? []).filter((r) => r.regularMarketPrice).map((r) => ({
        source_id: r.symbol,
        ticker: r.symbol,
        name: r.longName ?? r.shortName ?? r.symbol,
        detail: `Cotação atual R$ ${r.regularMarketPrice}`,
      })),
    })
  } catch (e) {
    return json({ error: (e as Error).message }, 502)
  }
})
