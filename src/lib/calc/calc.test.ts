import { describe, expect, it } from 'vitest'
import { simulateContribution, splitProportional, type Holding } from './contribution'
import { addDays, executionCount, generateExecutions, generatePlanFromDeficit, splitDue, type DeficitHolding } from './dca'
import { convert, D, sum } from './money'
import { computePosition, type TxInput } from './position'

const tx = (type: TxInput['type'], quantity: string, unitPrice: string, fee = '0', currency: 'BRL' | 'USD' = 'BRL', fx = '5'): TxInput =>
  ({ type, quantity: D(quantity), unitPrice: D(unitPrice), fee: D(fee), currency, fxRateToBrl: D(fx) })

// Carteira real de 11/11/2026, em USD (dólar a R$ 5,05).
const seed = (): Holding[] => [
  { id: 'BTC', value: D('534.42'), targetPct: D(50) },
  { id: 'SOL', value: D('346.55'), targetPct: D(8) },
  { id: 'AVAX', value: D('138.63'), targetPct: null },
  { id: 'USDT', value: D('78.84157358'), targetPct: D('32.5') },
  { id: 'ETH', value: D(0), targetPct: D(5) },
  { id: 'AAVE', value: D(0), targetPct: D('2.5') },
  { id: 'BP', value: D(0), targetPct: D(1) },
  { id: 'CARDS', value: D(0), targetPct: D(1) },
  { id: 'BRL', value: D(8000).div('5.05'), targetPct: null },
]

describe('câmbio', () => {
  it('converte entre BRL e USD pelo câmbio informado', () => {
    expect(convert(D(100), 'USD', 'BRL', D('5.05')).toFixed(2)).toBe('505.00')
    expect(convert(D(505), 'BRL', 'USD', D('5.05')).toFixed(2)).toBe('100.00')
    expect(convert(D(7), 'BRL', 'BRL', D('5.05')).toFixed()).toBe('7')
  })
  it('recusa câmbio zero', () => {
    expect(() => convert(D(1), 'USD', 'BRL', D(0))).toThrow()
  })
  it('não sofre erro de ponto flutuante', () => {
    expect(D('0.1').plus('0.2').toFixed()).toBe('0.3')
  })
})

describe('preço médio (regra 1 e 2)', () => {
  it('pondera as compras e soma a taxa ao custo', () => {
    const p = computePosition([tx('buy', '100', '30', '5'), tx('buy', '100', '40', '5')], 'BRL')
    expect(p.quantity.toFixed()).toBe('200')
    expect(p.avgPrice.toFixed(2)).toBe('35.05') // (3005 + 4005) / 200
    expect(p.cost.toFixed(2)).toBe('7010.00')
  })
  it('venda reduz a quantidade e não muda o preço médio', () => {
    const p = computePosition([tx('buy', '100', '30', '5'), tx('buy', '100', '40', '5'), tx('sell', '50', '50', '5')], 'BRL')
    expect(p.quantity.toFixed()).toBe('150')
    expect(p.avgPrice.toFixed(2)).toBe('35.05')
  })
  it('transfer_in conta como compra e transfer_out como venda', () => {
    const p = computePosition([tx('transfer_in', '2', '10'), tx('transfer_out', '1', '0')], 'BRL')
    expect(p.quantity.toFixed()).toBe('1')
    expect(p.avgPrice.toFixed()).toBe('10')
  })
  it('zerar a posição reinicia o preço médio', () => {
    const p = computePosition([tx('buy', '1', '10'), tx('sell', '1', '20'), tx('buy', '1', '30')], 'BRL')
    expect(p.avgPrice.toFixed()).toBe('30')
  })
  it('compra em BRL de ativo cotado em USD usa o câmbio do dia', () => {
    const p = computePosition([tx('buy', '0.01', '400000', '0', 'BRL', '5')], 'USD')
    expect(p.avgPrice.toFixed()).toBe('80000')
    expect(p.cost.toFixed()).toBe('800')
  })
  it('compra em USD de ativo cotado em BRL usa o câmbio do dia', () => {
    const p = computePosition([tx('buy', '10', '2', '1', 'USD', '5')], 'BRL')
    expect(p.cost.toFixed()).toBe('105') // (20 + 1) × 5
  })
})

describe('simulador de aporte (regra 3)', () => {
  it('a soma sugerida é exatamente o aporte', () => {
    for (const x of ['1000', '333.33', '0.07', '1584.16', '99999.99']) {
      const out = simulateContribution(seed(), D(x))
      expect(sum(out.map((s) => s.amount)).toFixed(2)).toBe(D(x).toFixed(2))
    }
  })
  it('nunca sugere ativo fora da meta nem acima dela, e nunca valor negativo', () => {
    const out = simulateContribution(seed(), D(500))
    const ids = out.map((s) => s.id)
    expect(ids).not.toContain('AVAX')
    expect(ids).not.toContain('BRL')
    expect(ids).not.toContain('SOL') // 346,55 já passa de 8% de (2.682,60 + 500)
    expect(out.every((s) => s.amount.gt(0))).toBe(true)
  })
  it('divide proporcionalmente ao que falta sobre (patrimônio + aporte)', () => {
    const hs: Holding[] = [
      { id: 'A', value: D(100), targetPct: D(50) },
      { id: 'B', value: D(300), targetPct: D(50) },
    ]
    // total 600: alvo 300 cada; só A está abaixo (falta 200) e recebe tudo
    expect(simulateContribution(hs, D(200))).toEqual([{ id: 'A', amount: D(200) }])
    // total 1000: alvo 500 cada; falta 400 de A e 200 de B -> 2/3 e 1/3 de 600
    const out = simulateContribution(hs, D(600))
    expect(out.find((s) => s.id === 'A')!.amount.toFixed(2)).toBe('400.00')
    expect(out.find((s) => s.id === 'B')!.amount.toFixed(2)).toBe('200.00')
  })
  it('trata o arredondamento: 100 dividido em três partes iguais', () => {
    const w = new Map([['a', D(1)], ['b', D(1)], ['c', D(1)]])
    const out = splitProportional(D(100), w)
    expect(out.map((s) => s.amount.toFixed(2)).sort()).toEqual(['33.33', '33.33', '33.34'])
  })
  it('sem meta ou sem aporte não sugere nada', () => {
    expect(simulateContribution([{ id: 'A', value: D(10), targetPct: null }], D(100))).toEqual([])
    expect(simulateContribution(seed(), D(0))).toEqual([])
  })
})

describe('DCA (regra 4)', () => {
  it('conta as execuções por frequência', () => {
    expect(executionCount('daily', 30)).toBe(30)
    expect(executionCount('weekly', 30)).toBe(4)
    expect(executionCount('weekly', 5)).toBe(1)
    expect(executionCount('once', 30)).toBe(1)
  })
  it('valor de cada execução = total × % ÷ nº de execuções', () => {
    const ex = generateExecutions({ frequency: 'daily', percent: D(50) }, D(2000), '2026-11-12', 30)
    expect(ex).toHaveLength(30)
    expect(ex[0]).toEqual({ date: '2026-11-12', amount: D('33.33') })
    expect(ex[29].date).toBe('2026-12-11')
    expect(sum(ex.map((e) => e.amount)).toFixed(2)).toBe('1000.00') // resíduo cai na última
  })
  it('item semanal executa a cada 7 dias com 7 dias de valor', () => {
    const ex = generateExecutions({ frequency: 'weekly', percent: D(28) }, D(1000), '2026-11-12', 28)
    expect(ex.map((e) => e.date)).toEqual(['2026-11-12', '2026-11-19', '2026-11-26', '2026-12-03'])
    expect(ex.map((e) => e.amount.toFixed(2))).toEqual(['70.00', '70.00', '70.00', '70.00'])
    const daily = generateExecutions({ frequency: 'daily', percent: D(28) }, D(1000), '2026-11-12', 28)
    expect(ex[0].amount.toFixed(2)).toBe(daily[0].amount.times(7).toFixed(2))
  })
  it('valor fixo repete o mesmo valor (plano do seed: BTC US$ 26,90 por dia = US$ 807)', () => {
    const ex = generateExecutions({ frequency: 'daily', fixedAmount: D('26.90') }, D(1062), '2026-11-12', 30)
    expect(sum(ex.map((e) => e.amount)).toFixed(2)).toBe('807.00')
  })
  it('recusa item com percentual e valor fixo juntos, ou sem nenhum', () => {
    expect(() => generateExecutions({ frequency: 'once', percent: D(1), fixedAmount: D(1) }, D(1), '2026-01-01', 1)).toThrow()
    expect(() => generateExecutions({ frequency: 'once' }, D(1), '2026-01-01', 1)).toThrow()
  })
  it('execução pulada em dia passado fica pendente e aparece como atrasada', () => {
    const mk = (scheduledDate: string, status: 'pending' | 'done' | 'skipped', planStatus: 'active' | 'paused' = 'active') =>
      ({ scheduledDate, status, planStatus })
    const all = [mk('2026-11-12', 'pending'), mk('2026-11-13', 'done'), mk('2026-11-14', 'pending'),
                 mk('2026-11-15', 'pending'), mk('2026-11-10', 'pending', 'paused'), mk('2026-11-11', 'skipped')]
    const due = splitDue(all, '2026-11-14')
    expect(due.today.map((e) => e.scheduledDate)).toEqual(['2026-11-14'])
    expect(due.overdue.map((e) => e.scheduledDate)).toEqual(['2026-11-12'])
  })
  it('addDays atravessa mês e ano', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
  })
})

describe('gerar plano pelo que falta', () => {
  const holdings = (): DeficitHolding[] =>
    seed().map((h) => ({ ...h, isCash: h.id === 'BRL', isCashLike: h.id === 'BRL' || h.id === 'USDT' }))

  it('reproduz o plano "Carteira cripto nov/2026"', () => {
    const plan = generatePlanFromDeficit(holdings(), 30, D(10))
    const by = Object.fromEntries(plan.items.map((i) => [i.id, i]))
    expect(Object.keys(by).sort()).toEqual(['AAVE', 'BP', 'BTC', 'CARDS', 'ETH']) // sem SOL, AVAX, USDT
    expect([by.BTC.frequency, by.BTC.fixedAmount.toFixed(2)]).toEqual(['daily', '26.90'])
    expect([by.ETH.frequency, by.ETH.executions, by.ETH.fixedAmount.toFixed(2)]).toEqual(['weekly', 4, '33.53'])
    expect([by.AAVE.frequency, by.AAVE.fixedAmount.toFixed(2)]).toEqual(['weekly', '16.77'])
    expect([by.BP.frequency, by.BP.fixedAmount.toFixed(2)]).toEqual(['once', '26.83'])
    expect(by.CARDS.frequency).toBe('once')
    expect(plan.total.toNumber()).toBeCloseTo(1062, -1)
    expect(plan.reserve.plus(plan.total).toFixed(2)).toBe(plan.cash.toFixed(2))
  })
  it('quando o caixa não cobre tudo, reduz na mesma proporção e não passa do caixa', () => {
    const hs = holdings().map((h) => (h.id === 'BRL' ? { ...h, value: D(500) } : h))
    const plan = generatePlanFromDeficit(hs, 30, D(10))
    expect(plan.total.lte(D(500).plus('0.50'))).toBe(true)
    expect(plan.items.every((i) => i.fixedAmount.gt(0))).toBe(true)
  })
  it('sem caixa, usa só o que a stablecoin tem acima da meta dela', () => {
    // Situação real depois de converter os reais: USDT 1.421 (meta 32,5%), nada em caixa.
    const hs: DeficitHolding[] = [
      { id: 'USDT', value: D('1421.37'), targetPct: D('32.5'), isCash: false, isCashLike: true },
      { id: 'BTC', value: D('559.35'), targetPct: D(50), isCash: false, isCashLike: false },
      { id: 'SOL', value: D('346.52'), targetPct: D(8), isCash: false, isCashLike: false },
      { id: 'AVAX', value: D('140.35'), targetPct: null, isCash: false, isCashLike: false },
      { id: 'ETH', value: D('33.29'), targetPct: D(5), isCash: false, isCashLike: false },
      { id: 'BRL', value: D(0), targetPct: null, isCash: true, isCashLike: true },
    ]
    const plan = generatePlanFromDeficit(hs, 30, D(10))
    // total 2.500,88; meta de USDT = 812,79; disponível = 1.421,37 − 812,79 = 608,58
    expect(plan.cash.toFixed(2)).toBe('608.58')
    expect(plan.items.map((i) => i.id).sort()).toEqual(['BTC', 'ETH'])
    expect(plan.total.lte(plan.cash.plus('0.50'))).toBe(true) // falta 782,88: reduzido para caber
    expect(plan.total.gt(D(600))).toBe(true)
  })
  it('stablecoin sem meta fica inteira disponível', () => {
    const hs: DeficitHolding[] = [
      { id: 'USDT', value: D(500), targetPct: null, isCash: false, isCashLike: true },
      { id: 'BTC', value: D(500), targetPct: D(100), isCash: false, isCashLike: false },
    ]
    expect(generatePlanFromDeficit(hs, 30, D(10)).cash.toFixed(2)).toBe('500.00')
  })
  it('sem caixa não gera itens', () => {
    const hs = holdings().map((h) => (h.id === 'BRL' ? { ...h, value: D(0) } : h))
    expect(generatePlanFromDeficit(hs, 30, D(10)).items).toEqual([])
  })
})
