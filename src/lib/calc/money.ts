import Decimal from 'decimal.js'

// Dinheiro nunca passa por float: tudo é Decimal, criado a partir de string ou de numeric do Postgres.
Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP })

export type Ccy = 'BRL' | 'USD'
export type Dec = Decimal
export const D = (v: Decimal.Value): Decimal => new Decimal(v)
export const ZERO = new Decimal(0)
export const sum = (xs: Decimal[]): Decimal => xs.reduce((a, b) => a.plus(b), ZERO)
export const toCents = (d: Decimal): Decimal => d.toDecimalPlaces(2, Decimal.ROUND_HALF_UP)

/** Converte entre BRL e USD. usdBrl = quantos reais vale US$ 1. */
export function convert(amount: Decimal, from: Ccy, to: Ccy, usdBrl: Decimal): Decimal {
  if (from === to) return amount
  if (usdBrl.lte(0)) throw new Error('câmbio inválido')
  return from === 'USD' ? amount.times(usdBrl) : amount.div(usdBrl)
}
