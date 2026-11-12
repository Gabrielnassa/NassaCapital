// Preços ao vivo da Binance (dados públicos de mercado, sem chave), aplicados por cima das posições
// calculadas no banco. Tudo aqui é puro: a conexão fica em live-context.tsx.
import { convert, D, sum, ZERO, type Dec } from './calc/money'
import type { Allocation, Asset, Position } from './data'

/** Par usado como câmbio: 1 USDT em reais. */
export const FX_SYMBOL = 'USDTBRL'

export interface LiveQuote {
  price: Dec
  /** variação de 24h em %, informada pela Binance */
  changePct: Dec | null
}

/** URL do stream combinado de tickers (um por par, atualizado a cada segundo). */
export function streamUrl(symbols: string[], host = 'wss://stream.binance.com:9443'): string {
  const streams = [...new Set(symbols)].map((s) => `${s.toLowerCase()}@ticker`).join('/')
  return `${host}/stream?streams=${streams}`
}

/** Lê uma mensagem do stream. Devolve null para qualquer coisa fora do formato esperado. */
export function parseTickerMessage(raw: string): { symbol: string; quote: LiveQuote } | null {
  try {
    const data = (JSON.parse(raw) as { data?: { s?: unknown; c?: unknown; P?: unknown } }).data
    if (!data || typeof data.s !== 'string' || typeof data.c !== 'string') return null
    const price = D(data.c)
    if (!price.gt(0)) return null
    return { symbol: data.s.toUpperCase(), quote: { price, changePct: typeof data.P === 'string' ? D(data.P) : null } }
  } catch {
    return null
  }
}

/**
 * Recalcula valor, L/P e conversões de cada posição com o preço ao vivo. Os pares da Binance são
 * cotados em USDT, então só se aplicam a ativos cotados em dólar. Quantidade e preço médio não mudam.
 */
export function applyLive(positions: Position[], assets: Asset[], quotes: Map<string, LiveQuote>): Position[] {
  if (quotes.size === 0) return positions
  const liveFx = quotes.get(FX_SYMBOL)?.price ?? null
  return positions.map((p) => {
    const symbol = assets.find((a) => a.id === p.asset_id)?.binance_symbol
    const quote = symbol && p.quote_currency === 'USD' ? quotes.get(symbol) : undefined
    const usdBrl = liveFx ?? p.usd_brl
    if (!quote && !liveFx) return p

    const price = quote?.price ?? p.price
    const value = price ? p.quantity.times(price) : null
    const to = (amount: Dec | null, ccy: 'BRL' | 'USD') =>
      amount == null ? null : p.quote_currency === ccy ? amount : usdBrl?.gt(0) ? convert(amount, p.quote_currency, ccy, usdBrl) : null
    return {
      ...p,
      price,
      usd_brl: usdBrl,
      price_origin: quote ? 'live' : p.price_origin,
      change_pct_24h: quote?.changePct ?? p.change_pct_24h,
      value,
      pl: value ? value.minus(p.cost) : null,
      pl_pct: value && p.cost.gt(0) ? value.div(p.cost).minus(1).times(100) : null,
      value_brl: to(value, 'BRL'),
      value_usd: to(value, 'USD'),
      cost_brl: to(p.cost, 'BRL'),
      cost_usd: to(p.cost, 'USD'),
    }
  })
}

/** Refaz % atual, desvio e quanto falta (mesma conta da view v_allocation) sobre as posições ao vivo. */
export function allocationFromPositions(positions: Position[], base: Allocation[]): Allocation[] {
  const totalBrl = sum(positions.map((p) => p.value_brl ?? ZERO))
  const totalUsd = sum(positions.map((p) => p.value_usd ?? ZERO))
  return base.map((row) => {
    const mine = positions.filter((p) => (row.kind === 'asset' ? p.asset_id === row.asset_id : p.class === row.class))
    const valueBrl = sum(mine.map((p) => p.value_brl ?? ZERO))
    const valueUsd = sum(mine.map((p) => p.value_usd ?? ZERO))
    const current = totalBrl.gt(0) ? valueBrl.div(totalBrl).times(100) : ZERO
    const missing = (total: Dec, value: Dec) => {
      const gap = row.target_pct!.div(100).times(total).minus(value)
      return gap.gt(0) ? gap : ZERO
    }
    return {
      ...row,
      value_brl: valueBrl,
      value_usd: valueUsd,
      current_pct: current,
      deviation_pct: row.target_pct ? current.minus(row.target_pct) : null,
      missing_brl: row.target_pct ? missing(totalBrl, valueBrl) : null,
      missing_usd: row.target_pct ? missing(totalUsd, valueUsd) : null,
    }
  })
}
