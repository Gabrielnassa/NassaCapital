import { describe, expect, it } from 'vitest'
import { evolution, niceTicks } from './evolution'
import { D } from './money'
import { reconcile } from './reconcile'

describe('conferência de saldos', () => {
  const holdings = [
    { id: 'BTC', quantity: D('0.00882873') },
    { id: 'SOL', quantity: D('4.18797342') },
    { id: 'BP', quantity: D('31.73066075') },
  ]
  it('calcula a diferença só dos ativos informados', () => {
    const out = reconcile(holdings, new Map([['BTC', D('0.00882901')], ['SOL', D('4.18797342')]]))
    expect(out.map((a) => [a.id, a.diff.toFixed()])).toEqual([['BTC', '0.00000028']])
  })
  it('saldo menor na corretora vira saída', () => {
    expect(reconcile(holdings, new Map([['SOL', D('4')]]))[0].diff.toFixed()).toBe('-0.18797342')
  })
  it('campo vazio não gera ajuste (ativo em outra carteira)', () => {
    expect(reconcile(holdings, new Map())).toEqual([])
  })
})

describe('evolução do patrimônio', () => {
  it('soma as classes de cada dia e ordena por data', () => {
    const out = evolution([
      { date: '2026-11-13', value: D(1000), cost: D(1100) },
      { date: '2026-11-12', value: D(900), cost: D(1000) },
      { date: '2026-11-13', value: D(500), cost: D(400) },
    ])
    expect(out.map((p) => p.date)).toEqual(['2026-11-12', '2026-11-13'])
    expect(out[1].value.toFixed()).toBe('1500')
    expect(out[1].gain.toFixed()).toBe('0')
    expect(out[0].gainPct!.toFixed(1)).toBe('-10.0')
  })
  it('marcas do eixo cobrem o intervalo com passos redondos', () => {
    const t = niceTicks(D('2410.57'), D('2573.44'))
    expect(t[0].lte(D('2410.57'))).toBe(true)
    expect(t.at(-1)!.gte(D('2573.44'))).toBe(true)
    expect(t.map((x) => x.toFixed())).toEqual(['2400', '2450', '2500', '2550', '2600'])
  })
  it('intervalo de um valor só não quebra', () => {
    expect(niceTicks(D(100), D(100)).length).toBeGreaterThanOrEqual(2)
  })
})
