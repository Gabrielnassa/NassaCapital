import { describe, expect, it } from 'vitest'
import { D, sum } from './money'
import { btcChangeForTotal, btcChangePct, simulateScenario, type ScenarioHolding } from './scenario'
import { defaultBeta, groupOf, segmentOf } from './segments'

// Carteira de exemplo em USD: BTC 560, ETH 33, AAVE 17, SOL 347, USDT 1.369.
const carteira = (): ScenarioHolding[] => [
  { id: 'BTC', value: D(560), beta: D(1) },
  { id: 'ETH', value: D(33), beta: D('1.5') },
  { id: 'AAVE', value: D(17), beta: D(2) },
  { id: 'SOL', value: D(347), beta: D('1.5') },
  { id: 'USDT', value: D(1369), beta: D(0) },
]

describe('agrupamento da carteira', () => {
  it('Bitcoin é reconhecido pelo ID do CoinGecko, não pelo ticker', () => {
    expect(segmentOf({ class: 'crypto', ticker: 'BTC', source_id: 'bitcoin' })).toBe('bitcoin')
    expect(segmentOf({ class: 'crypto', ticker: 'BTC', source_id: 'bitcoin-cash' })).toBe('altcoin') // ticker repetido
    expect(segmentOf({ class: 'crypto', ticker: 'ETH', source_id: 'ethereum' })).toBe('altcoin')
    expect(segmentOf({ class: 'crypto', ticker: 'BTC', source_id: null })).toBe('bitcoin') // ativo manual
  })
  it('cripto fica separada de bolsa e de caixa', () => {
    expect(groupOf(segmentOf({ class: 'stable', ticker: 'USDT' }))).toBe('crypto')
    expect(groupOf(segmentOf({ class: 'stock', ticker: 'PETR4' }))).toBe('market')
    expect(groupOf(segmentOf({ class: 'fii', ticker: 'MXRF11' }))).toBe('market')
    expect(groupOf(segmentOf({ class: 'etf', ticker: 'BOVA11' }))).toBe('market')
    expect(groupOf(segmentOf({ class: 'cash', ticker: 'BRL' }))).toBe('cash')
  })
  it('multiplicador padrão: BTC 1, altcoin 1,5, o resto 0', () => {
    expect(defaultBeta('bitcoin').toFixed()).toBe('1')
    expect(defaultBeta('altcoin').toFixed()).toBe('1.5')
    for (const s of ['stable', 'stock', 'fii', 'etf', 'cash'] as const) expect(defaultBeta(s).toFixed()).toBe('0')
  })
})

describe('simulador: se o BTC chegar a tanto', () => {
  it('variação do BTC entre hoje e o alvo', () => {
    expect(btcChangePct(D(73566), D(110349)).toFixed(2)).toBe('50.00')
    expect(btcChangePct(D(80000), D(60000)).toFixed(2)).toBe('-25.00')
    expect(() => btcChangePct(D(0), D(1))).toThrow()
  })
  it('cada ativo se move multiplicador × variação do BTC', () => {
    const s = simulateScenario(carteira(), D(50))
    const by = Object.fromEntries(s.rows.map((r) => [r.id, r]))
    expect(by.BTC.changePct.toFixed()).toBe('50')
    expect(by.BTC.valueThen.toFixed(2)).toBe('840.00')
    expect(by.ETH.changePct.toFixed()).toBe('75') // 1,5 × 50
    expect(by.AAVE.changePct.toFixed()).toBe('100') // 2 × 50
    expect(by.AAVE.valueThen.toFixed(2)).toBe('34.00')
    expect(by.USDT.gain.toFixed()).toBe('0') // stablecoin não acompanha
  })
  it('patrimônio projetado é a soma das linhas', () => {
    const s = simulateScenario(carteira(), D(50))
    // ganhos: BTC 280 + ETH 24,75 + AAVE 17 + SOL 260,25 = 582
    expect(s.totalNow.toFixed(2)).toBe('2326.00')
    expect(s.gain.toFixed(2)).toBe('582.00')
    expect(s.totalThen.toFixed(2)).toBe('2908.00')
    expect(s.gainPct!.toFixed(2)).toBe('25.02')
    expect(sum(s.rows.map((r) => r.shareThen)).toFixed(6)).toBe('100.000000')
  })
  it('em queda, nenhum ativo perde mais de 100%', () => {
    const s = simulateScenario(carteira(), D(-60))
    const by = Object.fromEntries(s.rows.map((r) => [r.id, r]))
    expect(by.BTC.valueThen.toFixed(2)).toBe('224.00')
    expect(by.AAVE.changePct.toFixed()).toBe('-100') // 2 × −60 seria −120
    expect(by.AAVE.valueThen.toFixed()).toBe('0')
    expect(s.rows.every((r) => r.valueThen.gte(0))).toBe(true)
  })
  it('variação zero não muda nada; carteira vazia não quebra', () => {
    expect(simulateScenario(carteira(), D(0)).gain.toFixed()).toBe('0')
    const vazio = simulateScenario([], D(50))
    expect(vazio.totalThen.toFixed()).toBe('0')
    expect(vazio.gainPct).toBeNull()
  })
})

describe('conta inversa: quanto o BTC precisa variar para um patrimônio-alvo', () => {
  it('é o inverso exato do simulador', () => {
    const change = btcChangeForTotal(carteira(), D(2908))!
    expect(change.toFixed(4)).toBe('50.0000')
    expect(simulateScenario(carteira(), change).totalThen.toFixed(2)).toBe('2908.00')
  })
  it('patrimônio-alvo igual ao de hoje pede variação zero', () => {
    expect(btcChangeForTotal(carteira(), D(2326))!.toFixed()).toBe('0')
  })
  it('sem nada exposto ao BTC, ou com alvo que exigiria zerar ativos, não responde', () => {
    expect(btcChangeForTotal([{ id: 'USDT', value: D(100), beta: D(0) }], D(200))).toBeNull()
    expect(btcChangeForTotal(carteira(), D(100))).toBeNull()
  })
})
