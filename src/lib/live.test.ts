import { describe, expect, it } from 'vitest'
import { D } from './calc/money'
import type { Allocation, Asset, Position } from './data'
import { allocationFromPositions, applyLive, parseTickerMessage, streamUrl, type LiveQuote } from './live'

const asset = (id: string, binance_symbol: string | null, quote: 'USD' | 'BRL' = 'USD'): Asset =>
  ({ id, ticker: id, name: id, class: 'crypto', source: 'coingecko', source_id: id, quote_currency: quote, binance_symbol, btc_beta: null })

const position = (id: string, quantity: string, avg: string, price: string | null, quote: 'USD' | 'BRL' = 'USD', cls: Position['class'] = 'crypto'): Position => {
  const q = D(quantity), cost = q.times(avg), value = price ? q.times(price) : null
  const fx = D(5)
  const to = (v: typeof value, c: 'BRL' | 'USD') => (v == null ? null : quote === c ? v : c === 'BRL' ? v.times(fx) : v.div(fx))
  return {
    asset_id: id, ticker: id, name: id, class: cls, source: 'coingecko', quote_currency: quote,
    quantity: q, avg_price: D(avg), cost, price: price ? D(price) : null, price_origin: 'quote', price_ts: null,
    change_pct_24h: null, usd_brl: fx, value, pl: value ? value.minus(cost) : null, pl_pct: null,
    value_brl: to(value, 'BRL'), value_usd: to(value, 'USD'), cost_brl: to(cost, 'BRL'), cost_usd: to(cost, 'USD'),
  }
}
const quotes = (entries: Record<string, [string, string?]>) =>
  new Map<string, LiveQuote>(Object.entries(entries).map(([s, [price, chg]]) => [s, { price: D(price), changePct: chg ? D(chg) : null }]))

describe('stream da Binance', () => {
  it('monta a URL com um ticker por par, sem repetir', () => {
    expect(streamUrl(['BTCUSDT', 'ETHUSDT', 'BTCUSDT'])).toBe('wss://stream.binance.com:9443/stream?streams=btcusdt@ticker/ethusdt@ticker')
  })
  it('lê preço e variação de 24h sem perder casas', () => {
    const m = parseTickerMessage('{"stream":"btcusdt@ticker","data":{"e":"24hrTicker","s":"BTCUSDT","c":"73586.01000000","P":"-1.250"}}')
    expect(m?.symbol).toBe('BTCUSDT')
    expect(m?.quote.price.toFixed(2)).toBe('73586.01')
    expect(m?.quote.changePct?.toFixed(2)).toBe('-1.25')
  })
  it('ignora mensagens fora do formato, sem lançar', () => {
    for (const raw of ['', 'x', '{}', '{"data":{"s":"BTCUSDT"}}', '{"data":{"s":"BTCUSDT","c":"0"}}', '{"result":null,"id":1}']) {
      expect(parseTickerMessage(raw)).toBeNull()
    }
  })
})

describe('preço ao vivo por cima das posições', () => {
  const assets = [asset('BTC', 'BTCUSDT'), asset('BP', null), asset('BRL', null, 'BRL')]
  const positions = [position('BTC', '0.01', '70000', '73000'), position('BP', '100', '1', '0.85'), position('BRL', '1000', '1', '1', 'BRL', 'cash')]

  it('se o BTC cai 1 centavo na Binance, cai 1 centavo no app', () => {
    const a = applyLive(positions, assets, quotes({ BTCUSDT: ['73586.01'] }))[0]
    const b = applyLive(positions, assets, quotes({ BTCUSDT: ['73586.00'] }))[0]
    expect(a.price!.minus(b.price!).toFixed(2)).toBe('0.01')
    expect(a.price_origin).toBe('live')
    expect(a.value!.toFixed(4)).toBe('735.8601') // 0,01 × 73.586,01
    expect(a.pl!.toFixed(4)).toBe('35.8601') // custo 700
    expect(a.quantity.toFixed()).toBe('0.01') // quantidade e preço médio não mudam
    expect(a.avg_price.toFixed()).toBe('70000')
  })
  it('usa o USDTBRL ao vivo como câmbio para todos os ativos', () => {
    const out = applyLive(positions, assets, quotes({ BTCUSDT: ['80000'], USDTBRL: ['5.60'] }))
    expect(out[0].value_brl!.toFixed(2)).toBe('4480.00') // 800 × 5,60
    expect(out[1].price_origin).toBe('quote') // BP não tem par: mantém o preço do servidor
    expect(out[1].value_brl!.toFixed(2)).toBe('476.00') // 85 × 5,60
    expect(out[2].value_usd!.toFixed(2)).toBe('178.57') // R$ 1.000 ÷ 5,60
    expect(out[2].value_brl!.toFixed(2)).toBe('1000.00')
  })
  it('sem cotação ao vivo, devolve as posições do servidor intactas', () => {
    expect(applyLive(positions, assets, new Map())).toBe(positions)
    expect(applyLive(positions, assets, quotes({ ETHUSDT: ['2000'] }))[0]).toBe(positions[0])
  })
  it('par da Binance não se aplica a ativo cotado em reais', () => {
    const out = applyLive([position('X', '1', '10', '10', 'BRL')], [asset('X', 'BTCUSDT', 'BRL')], quotes({ BTCUSDT: ['80000'] }))
    expect(out[0].price!.toFixed()).toBe('10')
  })
})

describe('alocação ao vivo (mesma conta da view v_allocation)', () => {
  const row = (kind: 'asset' | 'class', id: string | null, cls: Allocation['class'], target: string | null): Allocation =>
    ({ kind, asset_id: id, class: cls, ticker: id, value_brl: D(0), value_usd: D(0), current_pct: D(0),
       target_pct: target ? D(target) : null, deviation_pct: null, missing_brl: null, missing_usd: null })
  const positions = [position('BTC', '0.01', '70000', '60000'), position('BP', '100', '1', '4'), position('BRL', '0', '1', '1', 'BRL', 'cash')]
  const out = allocationFromPositions(positions, [row('asset', 'BTC', 'crypto', '80'), row('asset', 'BP', 'crypto', null), row('class', null, 'crypto', '100')])

  it('% atual, desvio e quanto falta', () => {
    // BTC US$ 600, BP US$ 400, total US$ 1.000 (R$ 5.000)
    expect(out[0].current_pct.toFixed(2)).toBe('60.00')
    expect(out[0].deviation_pct!.toFixed(2)).toBe('-20.00')
    expect(out[0].missing_usd!.toFixed(2)).toBe('200.00')
    expect(out[0].missing_brl!.toFixed(2)).toBe('1000.00')
  })
  it('fora da meta continua sem meta; acima da meta falta zero', () => {
    expect(out[1].target_pct).toBeNull()
    expect(out[1].missing_usd).toBeNull()
    expect(out[2].current_pct.toFixed(2)).toBe('100.00')
    expect(out[2].missing_usd!.toFixed(2)).toBe('0.00')
  })
})
