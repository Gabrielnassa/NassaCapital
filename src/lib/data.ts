// Camada de dados: lê as tabelas e views do Supabase, valida com Zod e converte numeric em Decimal.
// As contas ficam nas views (v_positions, v_allocation) e em src/lib/calc; aqui só leitura e escrita.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import Decimal from 'decimal.js'
import { z } from 'zod'
import type { PlannedExecution } from './calc/dca'
import type { Dec } from './calc/money'
import { supabase } from './supabase'

// numeric chega como número ou string; nunca fazemos conta com o number.
const dec = z.union([z.number(), z.string()]).transform((v) => new Decimal(String(v)))
const decN = dec.nullable()
const ccy = z.enum(['BRL', 'USD'])
const assetClass = z.enum(['crypto', 'stock', 'fii', 'etf', 'stable', 'cash'])
const source = z.enum(['coingecko', 'brapi', 'manual'])
const txType = z.enum(['buy', 'sell', 'transfer_in', 'transfer_out'])
const frequency = z.enum(['daily', 'weekly', 'once'])
const planStatus = z.enum(['active', 'paused', 'done'])
const execStatus = z.enum(['pending', 'done', 'skipped'])

export type AssetClass = z.infer<typeof assetClass>
export type Source = z.infer<typeof source>
export type TxType = z.infer<typeof txType>
export type PlanStatus = z.infer<typeof planStatus>
export type ExecStatus = z.infer<typeof execStatus>

export const CLASS_LABEL: Record<AssetClass, string> = {
  crypto: 'Cripto', stock: 'Ações', fii: 'FIIs', etf: 'ETFs', stable: 'Stablecoins', cash: 'Caixa',
}
export const CLASS_ORDER: AssetClass[] = ['crypto', 'stock', 'fii', 'etf', 'stable', 'cash']
export const TX_LABEL: Record<TxType, string> = { buy: 'Compra', sell: 'Venda', transfer_in: 'Entrada', transfer_out: 'Saída' }
export const FREQ_LABEL = { daily: 'Diário', weekly: 'Semanal', once: 'Compra única' } as const
export const PLAN_STATUS_LABEL: Record<PlanStatus, string> = { active: 'Ativo', paused: 'Pausado', done: 'Concluído' }

const assetRow = z.object({
  id: z.string(), ticker: z.string(), name: z.string(), class: assetClass, source,
  source_id: z.string().nullable(), quote_currency: ccy,
  /** par na Binance para preço ao vivo, ex.: BTCUSDT */
  binance_symbol: z.string().nullable().default(null),
  /** multiplicador do simulador de cenário; nulo = padrão do app */
  btc_beta: decN.default(null),
})
export type Asset = z.infer<typeof assetRow>

const brokerRow = z.object({ id: z.string(), name: z.string() })
export type Broker = z.infer<typeof brokerRow>

const positionRow = z.object({
  asset_id: z.string(), ticker: z.string(), name: z.string(), class: assetClass, source, quote_currency: ccy,
  quantity: dec, avg_price: dec, cost: dec,
  price: decN, price_origin: z.enum(['fixed', 'quote', 'last_tx', 'none', 'live']), price_ts: z.string().nullable(),
  change_pct_24h: decN, usd_brl: decN,
  value: decN, pl: decN, pl_pct: decN, value_brl: decN, value_usd: decN, cost_brl: decN, cost_usd: decN,
})
export type Position = z.infer<typeof positionRow>

const allocationRow = z.object({
  kind: z.enum(['asset', 'class']), asset_id: z.string().nullable(), class: assetClass, ticker: z.string().nullable(),
  value_brl: dec, value_usd: dec, current_pct: dec,
  target_pct: decN, deviation_pct: decN, missing_brl: decN, missing_usd: decN,
})
export type Allocation = z.infer<typeof allocationRow>

const transactionRow = z.object({
  id: z.string(), asset_id: z.string(), type: txType, date: z.string(),
  quantity: dec, unit_price: dec, fee: dec, currency: ccy, fx_rate_to_brl: dec,
  broker_id: z.string().nullable(), dca_execution_id: z.string().nullable(), notes: z.string().nullable(),
})
export type Transaction = z.infer<typeof transactionRow>

const executionRow = z.object({
  id: z.string(), plan_item_id: z.string(), scheduled_date: z.string(), planned_amount: dec,
  status: execStatus, transaction_id: z.string().nullable(),
})
export type Execution = z.infer<typeof executionRow>

const planItemRow = z.object({
  id: z.string(), asset_id: z.string(), percent: decN, fixed_amount: decN, frequency,
  executions: z.array(executionRow),
})
export type PlanItem = z.infer<typeof planItemRow>

const planRow = z.object({
  id: z.string(), name: z.string(), total_amount: dec, source_currency: ccy,
  funding_asset_id: z.string().nullable(), start_date: z.string(), duration_days: z.number(), status: planStatus,
  items: z.array(planItemRow),
})
export type Plan = z.infer<typeof planRow>

const settingsRow = z.object({ main_currency: ccy, theme: z.enum(['system', 'light', 'dark']) })
export type Settings = z.infer<typeof settingsRow>
export const DEFAULT_SETTINGS: Settings = { main_currency: 'BRL', theme: 'system' }

const priceRow = z.object({ fx_pair: z.string().nullable(), fetched_at: z.string(), source_ts: z.string() })

async function rows<T extends z.ZodType>(schema: T, query: PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<z.infer<T>[]> {
  const { data, error } = await query
  if (error) throw new Error(error.message)
  return z.array(schema).parse(data)
}

// ------------------------------------------------------------------ leitura

export const useAssets = () =>
  useQuery({ queryKey: ['assets'], queryFn: () => rows(assetRow, supabase.from('assets').select('*').order('ticker')) })

export const useBrokers = () =>
  useQuery({ queryKey: ['brokers'], queryFn: () => rows(brokerRow, supabase.from('brokers').select('*').order('name')) })

export const usePositions = () =>
  useQuery({ queryKey: ['positions'], queryFn: () => rows(positionRow, supabase.from('v_positions').select('*').order('ticker')) })

export const useAllocation = () =>
  useQuery({ queryKey: ['allocation'], queryFn: () => rows(allocationRow, supabase.from('v_allocation').select('*')) })

export const useTransactions = () =>
  useQuery({
    queryKey: ['transactions'],
    queryFn: () =>
      rows(transactionRow, supabase.from('transactions').select('*').order('date', { ascending: false }).order('created_at', { ascending: false })),
  })

export const usePlans = () =>
  useQuery({
    queryKey: ['plans'],
    queryFn: () =>
      rows(planRow, supabase.from('dca_plans').select('*, items:dca_plan_items(*, executions:dca_executions(*))').order('start_date', { ascending: false })),
  })

export const useSettings = () =>
  useQuery({
    queryKey: ['settings'],
    queryFn: async () => (await rows(settingsRow, supabase.from('settings').select('*')))[0] ?? DEFAULT_SETTINGS,
  })

/** Horário da última atualização de preços (o mais recente entre os ativos). */
export const usePriceStatus = () =>
  useQuery({
    queryKey: ['price-status'],
    queryFn: async () => {
      const list = await rows(priceRow, supabase.from('prices').select('fx_pair, fetched_at, source_ts'))
      const latest = (key: 'fetched_at' | 'source_ts') => list.map((p) => p[key]).sort().at(-1) ?? null
      return { fetchedAt: latest('fetched_at'), sourceTs: latest('source_ts'), count: list.length }
    },
  })

// ------------------------------------------------------------------ escrita

const check = <T extends { error: { message: string } | null }>(res: T): T => {
  if (res.error) throw new Error(res.error.message)
  return res
}

/** Mutação que, ao terminar, recarrega tudo (um lançamento muda carteira, metas, DCA e a tela Hoje). */
export function useWrite<A, R>(fn: (arg: A) => Promise<R>) {
  const qc = useQueryClient()
  return useMutation({ mutationFn: fn, onSuccess: () => qc.invalidateQueries() })
}

export interface TransactionInput {
  id?: string
  asset_id: string
  type: TxType
  date: string
  quantity: string
  unit_price: string
  fee: string
  currency: 'BRL' | 'USD'
  fx_rate_to_brl: string
  broker_id: string | null
  notes: string | null
}

/**
 * Grava um lançamento. Opcionalmente, na mesma chamada, registra a saída do dinheiro de um ativo
 * de caixa ou stablecoin (`debit`), para o patrimônio não contar duas vezes.
 */
export async function saveTransaction(args: {
  tx: TransactionInput
  debit?: { asset_id: string; quantity: string; currency: 'BRL' | 'USD' } | null
  executionId?: string | null
}) {
  const { id, ...fields } = args.tx
  if (id) {
    check(await supabase.from('transactions').update(fields).eq('id', id))
    return
  }
  const main = { ...fields, dca_execution_id: args.executionId ?? null }
  const batch: Record<string, unknown>[] = [main]
  if (args.debit) {
    batch.push({
      asset_id: args.debit.asset_id, type: 'sell', date: fields.date, quantity: args.debit.quantity, unit_price: '1', fee: '0',
      currency: args.debit.currency, fx_rate_to_brl: fields.fx_rate_to_brl, broker_id: fields.broker_id,
      dca_execution_id: null, notes: 'Pagamento de compra',
    })
  }
  // A execução de DCA é marcada como feita por um gatilho no banco (sync_dca_execution).
  check(await supabase.from('transactions').insert(batch))
}

/** Exclui o lançamento. Se ele veio de uma execução de DCA, o banco devolve a execução para pendente. */
export async function deleteTransaction(tx: Pick<Transaction, 'id'>) {
  check(await supabase.from('transactions').delete().eq('id', tx.id))
}

export async function setTargets(args: { kind: 'asset' | 'class'; items: { asset_id?: string; class?: AssetClass; percent: string }[] }) {
  check(await supabase.rpc('set_targets', { p_kind: args.kind, p_items: args.items }))
}

export interface PlanInput {
  name: string
  total_amount: string
  source_currency: 'BRL' | 'USD'
  funding_asset_id: string | null
  start_date: string
  duration_days: number
  items: { asset_id: string; percent: string | null; fixed_amount: string | null; frequency: 'daily' | 'weekly' | 'once'; executions: PlannedExecution[] }[]
}

/** Cria o plano, os itens e todas as execuções. Se algo falhar no meio, apaga o plano (cascata). */
export async function createPlan(input: PlanInput) {
  const { items, ...plan } = input
  const { data } = check(await supabase.from('dca_plans').insert(plan).select('id').single())
  const planId = (data as { id: string }).id
  try {
    for (const item of items) {
      const { executions, ...fields } = item
      const res = check(await supabase.from('dca_plan_items').insert({ ...fields, plan_id: planId }).select('id').single())
      const itemId = (res.data as { id: string }).id
      check(await supabase.from('dca_executions').insert(
        executions.map((e) => ({ plan_item_id: itemId, scheduled_date: e.date, planned_amount: e.amount.toFixed(2) })),
      ))
    }
  } catch (e) {
    await supabase.from('dca_plans').delete().eq('id', planId)
    throw e
  }
}

export async function updatePlan(args: { id: string; patch: { name?: string; status?: PlanStatus; funding_asset_id?: string | null } }) {
  check(await supabase.from('dca_plans').update(args.patch).eq('id', args.id))
}
export async function deletePlan(id: string) {
  check(await supabase.from('dca_plans').delete().eq('id', id))
}
export async function setExecutionStatus(args: { id: string; status: 'pending' | 'skipped' }) {
  check(await supabase.from('dca_executions').update({ status: args.status }).eq('id', args.id))
}

export type AssetInput = Omit<Asset, 'id' | 'btc_beta'> & { id?: string }
export async function saveAsset({ id, ...fields }: AssetInput) {
  check(id ? await supabase.from('assets').update(fields).eq('id', id) : await supabase.from('assets').insert(fields))
}
/** Grava os multiplicadores do simulador (nulo volta ao padrão do app). */
export async function saveBetas(items: { id: string; btc_beta: string | null }[]) {
  for (const item of items) check(await supabase.from('assets').update({ btc_beta: item.btc_beta }).eq('id', item.id))
}
export async function deleteAsset(id: string) {
  const res = await supabase.from('assets').delete().eq('id', id)
  if (res.error?.message.includes('foreign key')) throw new Error('Este ativo tem lançamentos ou planos. Exclua-os antes.')
  check(res)
}
export async function addBroker(name: string) {
  check(await supabase.from('brokers').insert({ name: name.trim() }))
}
export async function deleteBroker(id: string) {
  check(await supabase.from('brokers').delete().eq('id', id))
}
export async function saveSettings(patch: Partial<Settings>) {
  const { data } = await supabase.auth.getUser()
  check(await supabase.from('settings').upsert({ user_id: data.user?.id, ...patch }))
}
export async function seedInitialData() {
  check(await supabase.rpc('seed_initial_data'))
}

/** Pede ao servidor para buscar os preços agora (as chaves das APIs nunca vêm para o navegador). */
export async function refreshPrices(): Promise<{ updated?: number; skipped?: string; errors?: string[] }> {
  const { data, error } = await supabase.functions.invoke('update-prices', { body: {} })
  if (error) throw new Error('Não foi possível atualizar os preços agora. O último preço gravado continua valendo.')
  return data
}

export interface LookupResult {
  source_id: string
  ticker: string
  name: string
  detail: string
}
/** Busca no CoinGecko ou valida um ticker na brapi, pelo servidor. */
export async function lookupAsset(args: { source: 'coingecko' | 'brapi'; query: string }): Promise<LookupResult[]> {
  const { data, error } = await supabase.functions.invoke('asset-lookup', { body: args })
  if (error) throw new Error('A busca falhou. Confira se as funções e as chaves estão configuradas.')
  return z.array(z.object({ source_id: z.string(), ticker: z.string(), name: z.string(), detail: z.string() })).parse(data.results)
}

// ------------------------------------------------------------------ utilidades de tela

export const pick = (ccy: 'BRL' | 'USD', brl: Dec | null, usd: Dec | null) => (ccy === 'BRL' ? brl : usd)
