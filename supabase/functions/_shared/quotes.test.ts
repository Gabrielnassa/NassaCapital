import { describe, expect, it } from 'vitest'
import { isB3Open, parseAwesomeFx, parseBrapi, parseBrapiFx, parseCoinGecko } from './quotes'

const now = new Date('2026-11-12T15:00:00Z')

describe('horário de pregão da B3', () => {
  it('abre em dia útil das 10h às 18h30 de Brasília', () => {
    expect(isB3Open(new Date('2026-11-12T13:00:00Z'))).toBe(true) // qui 10:00
    expect(isB3Open(new Date('2026-11-12T12:59:00Z'))).toBe(false) // qui 09:59
    expect(isB3Open(new Date('2026-11-12T21:30:00Z'))).toBe(true) // qui 18:30
    expect(isB3Open(new Date('2026-11-12T21:31:00Z'))).toBe(false)
  })
  it('fecha no fim de semana', () => {
    expect(isB3Open(new Date('2026-11-14T15:00:00Z'))).toBe(false) // sábado
    expect(isB3Open(new Date('2026-11-15T15:00:00Z'))).toBe(false) // domingo
  })
})

describe('respostas das fontes', () => {
  it('CoinGecko: indexa pelo ID e ignora preço inválido', () => {
    const q = parseCoinGecko({
      bitcoin: { usd: 73785.67, usd_24h_change: -1.25, last_updated_at: 1794495600 },
      falso: { usd: 0 },
      vazio: {},
    }, now)
    expect([...q.keys()]).toEqual(['bitcoin'])
    expect(q.get('bitcoin')).toEqual({ price: 73785.67, changePct24h: -1.25, sourceTs: '2026-11-12T15:00:00.000Z' })
  })
  it('brapi: lê results e usa o horário da fonte', () => {
    const q = parseBrapi({ results: [
      { symbol: 'PETR4', regularMarketPrice: 38.5, regularMarketChangePercent: 0.8, regularMarketTime: '2026-11-12T14:45:00.000Z' },
      { symbol: 'XXXX11', regularMarketPrice: null },
    ] }, now)
    expect(q.size).toBe(1)
    expect(q.get('PETR4')!.sourceTs).toBe('2026-11-12T14:45:00.000Z')
  })
  it('respostas de erro ou fora do formato viram vazio, sem lançar', () => {
    expect(parseCoinGecko(null, now).size).toBe(0)
    expect(parseCoinGecko({ status: { error_code: 429 } }, now).size).toBe(0)
    expect(parseBrapi({ error: true, message: 'limite' }, now).size).toBe(0)
    expect(parseBrapiFx({ error: true }, now)).toBeNull()
    expect(parseAwesomeFx({}, now)).toBeNull()
  })
  it('câmbio: brapi e AwesomeAPI', () => {
    expect(parseBrapiFx({ currency: [{ bidPrice: '5.05', percentageChange: '0.2', updatedAtTimestamp: '1794495600' }] }, now))
      .toEqual({ price: 5.05, changePct24h: 0.2, sourceTs: '2026-11-12T15:00:00.000Z' })
    expect(parseAwesomeFx({ USDBRL: { bid: '5.0512', pctChange: '-0.1', timestamp: '1794495600' } }, now)!.price).toBe(5.0512)
  })
})
