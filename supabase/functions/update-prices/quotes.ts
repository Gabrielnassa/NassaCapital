// Lógica pura das cotações (sem imports), para ser testada pelo Vitest e usada pelas Edge Functions.

export interface Quote {
  price: number
  changePct24h: number | null
  /** horário informado pela fonte, ISO */
  sourceTs: string
}

const num = (v: unknown): number | null => {
  const n = typeof v === 'string' ? Number(v) : v
  return typeof n === 'number' && Number.isFinite(n) ? n : null
}
const iso = (v: unknown, fallback: Date): string => {
  const n = num(v)
  const d = n != null ? new Date(n < 1e12 ? n * 1000 : n) : typeof v === 'string' ? new Date(v) : fallback
  return Number.isNaN(d.getTime()) ? fallback.toISOString() : d.toISOString()
}

/** Pregão da B3: dias úteis, das 10h às 18h30 de Brasília (com folga para o after). Não considera feriados. */
export function isB3Open(now: Date): boolean {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(now)
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  if (['Sat', 'Sun'].includes(get('weekday'))) return false
  const minutes = Number(get('hour')) * 60 + Number(get('minute'))
  return minutes >= 10 * 60 && minutes <= 18 * 60 + 30
}

/** Resposta de /simple/price do CoinGecko, indexada pelo ID (nunca pelo ticker). */
export function parseCoinGecko(json: unknown, now: Date): Map<string, Quote> {
  const out = new Map<string, Quote>()
  if (!json || typeof json !== 'object') return out
  for (const [id, raw] of Object.entries(json as Record<string, Record<string, unknown>>)) {
    const price = num(raw?.usd)
    if (price == null || price <= 0) continue
    out.set(id, { price, changePct24h: num(raw.usd_24h_change), sourceTs: iso(raw.last_updated_at, now) })
  }
  return out
}

/** Resposta de /api/quote/{tickers} da brapi. */
export function parseBrapi(json: unknown, now: Date): Map<string, Quote> {
  const out = new Map<string, Quote>()
  const results = (json as { results?: unknown })?.results
  if (!Array.isArray(results)) return out
  for (const r of results as Record<string, unknown>[]) {
    const price = num(r?.regularMarketPrice)
    if (typeof r?.symbol !== 'string' || price == null || price <= 0) continue
    out.set(r.symbol.toUpperCase(), {
      price,
      changePct24h: num(r.regularMarketChangePercent),
      sourceTs: iso(r.regularMarketTime, now),
    })
  }
  return out
}

/** Câmbio USD-BRL pela brapi (/api/v2/currency). */
export function parseBrapiFx(json: unknown, now: Date): Quote | null {
  const list = (json as { currency?: unknown })?.currency
  const r = Array.isArray(list) ? (list[0] as Record<string, unknown>) : null
  const price = num(r?.bidPrice)
  if (!r || price == null || price <= 0) return null
  return { price, changePct24h: num(r.percentageChange), sourceTs: iso(r.updatedAtTimestamp ?? r.updatedAtDate, now) }
}

/** Câmbio USD-BRL pela AwesomeAPI (/json/last/USD-BRL), usado como reserva. */
export function parseAwesomeFx(json: unknown, now: Date): Quote | null {
  const r = (json as { USDBRL?: Record<string, unknown> })?.USDBRL
  const price = num(r?.bid)
  if (!r || price == null || price <= 0) return null
  return { price, changePct24h: num(r.pctChange), sourceTs: iso(r.timestamp, now) }
}
