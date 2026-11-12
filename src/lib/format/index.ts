import type { Ccy, Dec } from '../calc/money'

// Formato brasileiro em todo o app: R$ 1.234,56 · US$ 1.234,56 · 12,5%. Sinal de menos tipográfico (−).
type Num = Dec | null | undefined
const MINUS = '−'
const nf = (opts: Intl.NumberFormatOptions) => new Intl.NumberFormat('pt-BR', opts)
const run = (f: Intl.NumberFormat, v: Dec) =>
  f.format(v.toFixed() as unknown as number).replace('-', MINUS).replace(/ /g, ' ')

const money = {
  BRL: nf({ style: 'currency', currency: 'BRL' }),
  USD: nf({ style: 'currency', currency: 'USD' }),
}
const moneySigned = {
  BRL: nf({ style: 'currency', currency: 'BRL', signDisplay: 'exceptZero' }),
  USD: nf({ style: 'currency', currency: 'USD', signDisplay: 'exceptZero' }),
}
const pct = nf({ minimumFractionDigits: 1, maximumFractionDigits: 2 })
const pctSigned = nf({ minimumFractionDigits: 1, maximumFractionDigits: 2, signDisplay: 'exceptZero' })
const qty = nf({ maximumFractionDigits: 8 })

const plain = nf({ minimumFractionDigits: 2, maximumFractionDigits: 2 })

export const DASH = '—'
/** Valor com 2 casas, sem símbolo: para colunas cujo cabeçalho já diz a moeda. */
export const fmtAmount = (v: Num) => (v == null ? DASH : run(plain, v))
export const fmtMoney = (v: Num, ccy: Ccy) => (v == null ? DASH : run(money[ccy], v))
export const fmtMoneySigned = (v: Num, ccy: Ccy) => (v == null ? DASH : run(moneySigned[ccy], v))
export const fmtPct = (v: Num) => (v == null ? DASH : `${run(pct, v)}%`)
export const fmtPctSigned = (v: Num) => (v == null ? DASH : `${run(pctSigned, v)}%`)
export const fmtQty = (v: Num) => (v == null ? DASH : run(qty, v))

/** Preço unitário: 2 casas acima de 1, mais casas para moedas de valor baixo. */
export function fmtPrice(v: Num, ccy: Ccy) {
  if (v == null) return DASH
  const digits = v.abs().gte(1) || v.isZero() ? 2 : 6
  return run(nf({ style: 'currency', currency: ccy, minimumFractionDigits: 2, maximumFractionDigits: digits }), v)
}

/** AAAA-MM-DD -> 12/11/2026 */
export const fmtDate = (iso: string) => iso.slice(0, 10).split('-').reverse().join('/')
/** AAAA-MM-DD -> 12/11 */
export const fmtDayMonth = (iso: string) => fmtDate(iso).slice(0, 5)

const dateTime = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo',
})
export const fmtDateTime = (iso: string) => dateTime.format(new Date(iso)).replace(',', '')

/** Data de hoje em Brasília, AAAA-MM-DD. */
export const todayISO = (now = new Date()) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(now)

/**
 * Lê um valor em dinheiro ou preço. Além do que parseNumberBR aceita, entende o ponto como separador
 * de milhar quando ele vem em grupos de três ("100.000" = cem mil, "1.234.567"). Só para campos de
 * valor: em quantidade, "4.187" continua sendo quatro vírgula cento e oitenta e sete.
 */
export function parseMoneyBR(input: string): string | null {
  const s = input.trim().replace(/\s/g, '')
  if (/^[1-9]\d{0,2}(\.\d{3})+$/.test(s)) return s.replace(/\./g, '')
  return parseNumberBR(s)
}

/** Lê número digitado no formato brasileiro ("1.234,56") ou com ponto decimal ("1234.56"). */
export function parseNumberBR(input: string): string | null {
  const s = input.trim().replace(/\s/g, '')
  if (!s) return null
  const normalized = s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s
  return /^\d+(\.\d+)?$|^\.\d+$/.test(normalized) ? normalized : null
}
