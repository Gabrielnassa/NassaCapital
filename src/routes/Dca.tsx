import { Pause, Pencil, Play, Plus, Trash2, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Badge, Button, EmptyState, ErrorNote, Field, Input, Modal, NumberInput, PageHeader, Panel, Popover, ProgressBar, Segmented, Select } from '../components/ui'
import { cx } from '../components/cx'
import { planProgress } from '../features/portfolio'
import { TradeDialog, type TradePrefill } from '../features/TradeForm'
import { addDays, generateExecutions, generatePlanFromDeficit, type Frequency, type PlannedExecution } from '../lib/calc/dca'
import { D, sum, type Ccy } from '../lib/calc/money'
import {
  FREQ_LABEL, PLAN_STATUS_LABEL, createPlan, deletePlan, setExecutionStatus, updatePlan, useAllocation, useAssets, usePlans, useWrite,
  type Allocation, type Asset, type Execution, type Plan, type PlanInput,
} from '../lib/data'
import { fmtDate, fmtDayMonth, fmtMoney, parseNumberBR, todayISO } from '../lib/format'

const NONE = 'none'
const MIN_ORDER_USD = D(10)
const sym = (c: Ccy) => (c === 'USD' ? 'US$' : 'R$')
const toInput = (v: { toFixed: (n?: number) => string }, places = 2) => v.toFixed(places).replace('.', ',')

// ------------------------------------------------------------------ novo plano

interface ItemDraft {
  asset_id: string
  mode: 'fixed' | 'percent'
  value: string
  frequency: Frequency
}
interface PlanDraft {
  name: string
  total: string
  currency: Ccy
  funding: string
  start: string
  duration: string
  items: ItemDraft[]
  note?: string
}

const emptyDraft = (): PlanDraft => ({
  name: '', total: '', currency: 'USD', funding: NONE, start: addDays(todayISO(), 1), duration: '30',
  items: [{ asset_id: '', mode: 'percent', value: '', frequency: 'daily' }],
})

/** "Gerar plano pelo que falta": caixa disponível, déficit de cada ativo em relação à meta, itens prontos. */
function draftFromDeficit(allocation: Allocation[], assets: Asset[]): PlanDraft {
  const holdings = allocation.filter((a) => a.kind === 'asset').map((a) => ({
    id: a.asset_id!, value: a.value_usd, targetPct: a.target_pct, isCash: a.class === 'cash', isCashLike: a.class === 'cash' || a.class === 'stable',
  }))
  const plan = generatePlanFromDeficit(holdings, 30, MIN_ORDER_USD)
  const [, month, year] = fmtDate(todayISO()).split('/')
  return {
    ...emptyDraft(),
    name: `Plano ${month}/${year}`,
    funding: assets.find((a) => a.class === 'stable')?.id ?? NONE,
    items: plan.items.map((i) => ({ asset_id: i.id, mode: 'fixed' as const, value: toInput(i.fixedAmount), frequency: i.frequency })),
    note: plan.items.length
      ? `Caixa disponível ${fmtMoney(plan.cash, 'USD')}. O plano usa ${fmtMoney(plan.total, 'USD')} e sobram ${fmtMoney(plan.reserve, 'USD')} de reserva. Nada é vendido.`
      : 'Não há caixa disponível ou nenhum ativo está abaixo da meta.',
  }
}

function buildPlan(d: PlanDraft): { input?: PlanInput; error?: string; preview: (PlannedExecution[] | null)[] } {
  const duration = Number(d.duration)
  const durationOk = Number.isInteger(duration) && duration >= 1 && duration <= 365
  const total = parseNumberBR(d.total)
  const needsTotal = d.items.some((i) => i.mode === 'percent')
  const preview = d.items.map((i) => {
    const v = parseNumberBR(i.value)
    if (!durationOk || !v || !D(v).gt(0) || (i.mode === 'percent' && (!total || D(v).gt(100)))) return null
    return generateExecutions(i.mode === 'percent' ? { frequency: i.frequency, percent: D(v) } : { frequency: i.frequency, fixedAmount: D(v) }, D(total ?? 0), d.start, duration)
  })
  const fail = (error: string) => ({ error, preview })
  if (!d.name.trim()) return fail('Dê um nome ao plano.')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.start)) return fail('Informe a data de início.')
  if (!durationOk) return fail('Duração entre 1 e 365 dias.')
  if (d.items.length === 0) return fail('Adicione pelo menos um ativo.')
  if (d.items.some((i) => !i.asset_id)) return fail('Escolha o ativo de cada linha.')
  if (new Set(d.items.map((i) => i.asset_id)).size < d.items.length) return fail('Há um ativo repetido.')
  if (needsTotal && (!total || !D(total).gt(0))) return fail('Informe o valor total do plano.')
  if (preview.some((p) => p == null)) return fail('Confira o valor de cada linha.')
  const pctSum = sum(d.items.filter((i) => i.mode === 'percent').map((i) => D(parseNumberBR(i.value)!)))
  if (pctSum.gt(100)) return fail('Os percentuais passam de 100%.')

  const planned = sum(preview.flatMap((p) => p!.map((e) => e.amount)))
  return {
    preview,
    input: {
      name: d.name.trim(), total_amount: (needsTotal ? D(total!) : planned).toFixed(2), source_currency: d.currency,
      funding_asset_id: d.funding === NONE ? null : d.funding, start_date: d.start, duration_days: duration,
      items: d.items.map((i, idx) => ({
        asset_id: i.asset_id, frequency: i.frequency, executions: preview[idx]!,
        percent: i.mode === 'percent' ? parseNumberBR(i.value) : null,
        fixed_amount: i.mode === 'fixed' ? parseNumberBR(i.value) : null,
      })),
    },
  }
}

function PlanForm(props: { initial: PlanDraft; assets: Asset[]; onDone: () => void }) {
  const [d, setD] = useState(props.initial)
  const [showError, setShowError] = useState(false)
  const create = useWrite(createPlan)
  const built = useMemo(() => buildPlan(d), [d])
  const set = (patch: Partial<PlanDraft>) => setD((s) => ({ ...s, ...patch }))
  const setItem = (i: number, patch: Partial<ItemDraft>) => setD((s) => ({ ...s, items: s.items.map((it, j) => (j === i ? { ...it, ...patch } : it)) }))
  const buyable = props.assets.filter((a) => a.class !== 'cash')
  const fundingOptions = props.assets.filter((a) => a.class === 'cash' || a.class === 'stable')
  const planned = sum(built.preview.flatMap((p) => p?.map((e) => e.amount) ?? []))

  return (
    <form className="flex flex-col gap-3" noValidate
      onSubmit={(e) => {
        e.preventDefault()
        if (built.input) create.mutate(built.input, { onSuccess: props.onDone })
        else setShowError(true)
      }}>
      {d.note && <p className="m-0 rounded-md border border-border bg-surface px-3 py-2 text-sm text-muted">{d.note}</p>}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Field label="Nome" className="col-span-2"><Input value={d.name} onChange={(e) => set({ name: e.target.value })} placeholder="Carteira cripto nov/2026" /></Field>
        <Field label="Início"><Input type="date" className="num" value={d.start} onChange={(e) => set({ start: e.target.value })} /></Field>
        <Field label="Duração (dias)"><NumberInput inputMode="numeric" value={d.duration} onChange={(e) => set({ duration: e.target.value })} /></Field>
        <Field label="Moeda de origem">
          <Segmented aria-label="Moeda de origem" value={d.currency} onChange={(v) => set({ currency: v })} options={[{ value: 'USD', label: 'US$' }, { value: 'BRL', label: 'R$' }]} />
        </Field>
        <Field label="Pagar com">
          <Select aria-label="Pagar com" value={d.funding} onChange={(v) => set({ funding: v })} options={[{ value: NONE, label: 'Não debitar' }, ...fundingOptions.map((a) => ({ value: a.id, label: a.ticker }))]} />
        </Field>
        <Field label={`Valor total (${sym(d.currency)})`} className="col-span-2" hint="Usado pelas linhas em %. Linhas de valor fixo somam por conta própria.">
          <NumberInput value={d.total} onChange={(e) => set({ total: e.target.value })} placeholder="2.000,00" />
        </Field>
      </div>

      <div className="flex flex-col gap-2 border-t border-border pt-3">
        {d.items.map((it, i) => {
          const p = built.preview[i]
          return (
            <div key={i} className="grid grid-cols-[1fr_1fr_auto] items-center gap-2 md:grid-cols-[110px_130px_96px_110px_1fr_auto]">
              <Select aria-label="Ativo" placeholder="Ativo" value={it.asset_id} onChange={(v) => setItem(i, { asset_id: v })} options={buyable.map((a) => ({ value: a.id, label: a.ticker }))} />
              <Select aria-label="Frequência" value={it.frequency} onChange={(v) => setItem(i, { frequency: v as Frequency })}
                options={(Object.keys(FREQ_LABEL) as Frequency[]).map((f) => ({ value: f, label: FREQ_LABEL[f] }))} />
              <Button variant="ghost" className="md:order-last" aria-label="Remover linha" onClick={() => set({ items: d.items.filter((_, j) => j !== i) })}><X size={16} /></Button>
              <Segmented aria-label="Tipo de valor" value={it.mode} onChange={(v) => setItem(i, { mode: v })} options={[{ value: 'percent', label: '%' }, { value: 'fixed', label: sym(d.currency) }]} />
              <NumberInput aria-label={it.mode === 'percent' ? 'Percentual do plano' : 'Valor por execução'} value={it.value} onChange={(e) => setItem(i, { value: e.target.value })} placeholder={it.mode === 'percent' ? '50' : '26,90'} />
              <span className="num col-span-3 truncate text-xs text-muted md:col-span-1">
                {p ? `${p.length}× = ${fmtMoney(sum(p.map((e) => e.amount)), d.currency)}` : ''}
              </span>
            </div>
          )
        })}
        <div><Button size="sm" onClick={() => set({ items: [...d.items, { asset_id: '', mode: 'fixed', value: '', frequency: 'daily' }] })}><Plus size={16} />Adicionar ativo</Button></div>
      </div>

      <div className="flex items-center justify-between border-t border-border pt-3 text-sm">
        <span className="text-muted">Total planejado</span>
        <span className="num font-medium">{fmtMoney(planned, d.currency)}</span>
      </div>
      {showError && built.error && <ErrorNote error={built.error} />}
      <ErrorNote error={create.error} />
      <div className="flex justify-end gap-2">
        <Button onClick={props.onDone}>Cancelar</Button>
        <Button type="submit" variant="primary" disabled={create.isPending}>Criar plano</Button>
      </div>
    </form>
  )
}

// ------------------------------------------------------------------ plano existente

type CellState = 'done' | 'skipped' | 'overdue' | 'today' | 'pending'
const CELL_LABEL: Record<CellState, string> = { done: 'Feita', skipped: 'Pulada', overdue: 'Atrasada', today: 'Para hoje', pending: 'Prevista' }
const CELL_CLASS: Record<CellState, string> = {
  done: 'bg-accent border-accent',
  skipped: 'bg-faint border-faint',
  overdue: 'bg-transparent border-down border-2',
  today: 'bg-accent-soft border-accent border-2',
  pending: 'bg-transparent border-border-strong',
}
const cellState = (e: Execution, today: string): CellState =>
  e.status !== 'pending' ? e.status : e.scheduled_date < today ? 'overdue' : e.scheduled_date === today ? 'today' : 'pending'

function PlanCard(props: { plan: Plan; assets: Asset[]; onRegister: (p: TradePrefill) => void; onEdit: () => void; onDelete: () => void }) {
  const { plan } = props
  const update = useWrite(updatePlan)
  const setStatus = useWrite(setExecutionStatus)
  const today = todayISO()
  const progress = planProgress(plan)
  const days = Array.from({ length: plan.duration_days }, (_, i) => addDays(plan.start_date, i))
  const ticker = (id: string) => props.assets.find((a) => a.id === id)?.ticker ?? '?'
  const ccy = plan.source_currency

  return (
    <Panel flush>
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border px-3 py-2">
        <h2 className="text-sm font-semibold">{plan.name}</h2>
        <Badge tone={plan.status === 'active' ? 'accent' : 'neutral'}>{PLAN_STATUS_LABEL[plan.status]}</Badge>
        <span className="num text-xs text-muted">{fmtDate(plan.start_date)} a {fmtDate(addDays(plan.start_date, plan.duration_days - 1))}</span>
        <span className="ml-auto inline-flex gap-1">
          {plan.status !== 'done' && (
            <Button size="sm" disabled={update.isPending} onClick={() => update.mutate({ id: plan.id, patch: { status: plan.status === 'active' ? 'paused' : 'active' } })}>
              {plan.status === 'active' ? <><Pause size={16} />Pausar</> : <><Play size={16} />Retomar</>}
            </Button>
          )}
          <Button size="sm" variant="ghost" aria-label="Editar plano" onClick={props.onEdit}><Pencil size={16} /></Button>
          <Button size="sm" variant="ghost" aria-label="Excluir plano" onClick={props.onDelete}><Trash2 size={16} /></Button>
        </span>
      </header>

      <div className="flex flex-col gap-1.5 px-3 py-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
          <span><span className="num font-medium">{fmtMoney(progress.executed, ccy)}</span> <span className="text-muted">de</span> <span className="num">{fmtMoney(progress.planned, ccy)}</span></span>
          <span className="num text-xs text-muted">{progress.doneCount} de {progress.count} execuções{progress.skipped > 0 && ` · ${progress.skipped} puladas`}</span>
        </div>
        <ProgressBar value={progress.executed} total={progress.planned} label="Executado do plano" />
      </div>

      <div className="overflow-x-auto border-t border-border px-3 py-3">
        <table className="border-collapse text-xs">
          <thead>
            <tr>
              <th className="sticky left-0 bg-surface pr-3 text-left font-medium text-muted">Calendário</th>
              {days.map((d, i) => (
                <th key={d} className="num h-4 w-[18px] min-w-[18px] p-0 text-left font-normal text-faint">
                  {i % 7 === 0 && <span className="absolute">{fmtDayMonth(d)}</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {plan.items.map((item) => (
              <tr key={item.id}>
                <td className="sticky left-0 h-[22px] bg-surface pr-3 font-semibold whitespace-nowrap">
                  {ticker(item.asset_id)} <span className="font-normal text-muted">{FREQ_LABEL[item.frequency].toLowerCase()}</span>
                </td>
                {days.map((d) => {
                  const e = item.executions.find((x) => x.scheduled_date === d)
                  if (!e) return <td key={d} className="p-0" />
                  const state = cellState(e, today)
                  return (
                    <td key={d} className="p-0">
                      <Popover align="center" trigger={
                        <button type="button" aria-label={`${ticker(item.asset_id)} ${fmtDate(d)}: ${CELL_LABEL[state]}`} className={cx('block size-3.5 cursor-pointer rounded-sm border p-0', CELL_CLASS[state])} />
                      }>
                        <div className="flex items-baseline justify-between">
                          <span className="font-semibold">{ticker(item.asset_id)}</span>
                          <span className="num text-muted">{fmtDate(d)}</span>
                        </div>
                        <div className="mt-1 flex items-baseline justify-between">
                          <span className="text-muted">{CELL_LABEL[state]}</span>
                          <span className="num font-medium">{fmtMoney(e.planned_amount, ccy)}</span>
                        </div>
                        {e.status === 'pending' && (
                          <div className="mt-3 flex gap-2">
                            <Button size="sm" variant="primary" onClick={() => props.onRegister({ assetId: item.asset_id, amount: e.planned_amount, amountCcy: ccy, executionId: e.id, fundingAssetId: plan.funding_asset_id })}>Registrar compra</Button>
                            <Button size="sm" disabled={setStatus.isPending} onClick={() => setStatus.mutate({ id: e.id, status: 'skipped' })}>Pular</Button>
                          </div>
                        )}
                        {e.status === 'skipped' && (
                          <div className="mt-3"><Button size="sm" disabled={setStatus.isPending} onClick={() => setStatus.mutate({ id: e.id, status: 'pending' })}>Reabrir</Button></div>
                        )}
                      </Popover>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
          {(Object.keys(CELL_LABEL) as CellState[]).map((s) => (
            <span key={s} className="inline-flex items-center gap-1.5"><span className={cx('block size-3 rounded-sm border', CELL_CLASS[s])} />{CELL_LABEL[s]}</span>
          ))}
        </div>
      </div>

      <table className="tbl border-t border-border">
        <thead><tr><th>Ativo</th><th>Frequência</th><th className="r">Por execução</th><th className="r">Feitas</th><th className="r">Total</th></tr></thead>
        <tbody>
          {plan.items.map((item) => {
            const done = item.executions.filter((e) => e.status === 'done').length
            return (
              <tr key={item.id}>
                <td className="font-semibold">{ticker(item.asset_id)}</td>
                <td>{FREQ_LABEL[item.frequency]}</td>
                <td className="r num">{fmtMoney(item.executions[0]?.planned_amount, ccy)}</td>
                <td className="r num">{done} de {item.executions.length}</td>
                <td className="r num">{fmtMoney(sum(item.executions.map((e) => e.planned_amount)), ccy)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </Panel>
  )
}

function EditPlan(props: { plan: Plan; assets: Asset[]; onDone: () => void }) {
  const [name, setName] = useState(props.plan.name)
  const [funding, setFunding] = useState(props.plan.funding_asset_id ?? NONE)
  const update = useWrite(updatePlan)
  const fundingOptions = props.assets.filter((a) => a.class === 'cash' || a.class === 'stable')
  return (
    <form className="flex flex-col gap-3" onSubmit={(e) => {
      e.preventDefault()
      if (name.trim()) update.mutate({ id: props.plan.id, patch: { name: name.trim(), funding_asset_id: funding === NONE ? null : funding } }, { onSuccess: props.onDone })
    }}>
      <Field label="Nome"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
      <Field label="Pagar com" hint="Para mudar valores ou ativos, crie um plano novo: as execuções já feitas ficam no histórico.">
        <Select aria-label="Pagar com" value={funding} onChange={setFunding} options={[{ value: NONE, label: 'Não debitar' }, ...fundingOptions.map((a) => ({ value: a.id, label: a.ticker }))]} />
      </Field>
      <ErrorNote error={update.error} />
      <div className="flex justify-end gap-2">
        <Button onClick={props.onDone}>Cancelar</Button>
        <Button type="submit" variant="primary" disabled={update.isPending}>Salvar</Button>
      </div>
    </form>
  )
}

export function Dca() {
  const plans = usePlans()
  const assets = useAssets()
  const allocation = useAllocation()
  const remove = useWrite(deletePlan)
  const [draft, setDraft] = useState<PlanDraft | null>(null)
  const [trade, setTrade] = useState<TradePrefill | null>(null)
  const [editing, setEditing] = useState<Plan | null>(null)
  const [deleting, setDeleting] = useState<Plan | null>(null)

  if (plans.error ?? assets.error) return <ErrorNote error={plans.error ?? assets.error} />
  if (!plans.data || !assets.data) return null

  const fromDeficit = () => allocation.data && setDraft(draftFromDeficit(allocation.data, assets.data))
  const buttons = (
    <>
      <Button onClick={fromDeficit} disabled={!allocation.data}>Gerar plano pelo que falta</Button>
      <Button variant="primary" onClick={() => setDraft(emptyDraft())}><Plus size={16} />Novo plano</Button>
    </>
  )

  return (
    <>
      <PageHeader title="DCA">{buttons}</PageHeader>
      {plans.data.length === 0 ? (
        <Panel flush><EmptyState text="Nenhum plano de DCA." action={<Button variant="primary" onClick={fromDeficit}>Gerar plano pelo que falta</Button>} /></Panel>
      ) : (
        <div className="flex flex-col gap-4">
          {plans.data.map((p) => (
            <PlanCard key={p.id} plan={p} assets={assets.data} onRegister={setTrade} onEdit={() => setEditing(p)} onDelete={() => setDeleting(p)} />
          ))}
        </div>
      )}

      <Modal wide open={draft != null} onOpenChange={(o) => !o && setDraft(null)} title="Novo plano de DCA">
        {draft && <PlanForm initial={draft} assets={assets.data} onDone={() => setDraft(null)} />}
      </Modal>
      <Modal open={editing != null} onOpenChange={(o) => !o && setEditing(null)} title="Editar plano">
        {editing && <EditPlan plan={editing} assets={assets.data} onDone={() => setEditing(null)} />}
      </Modal>
      <Modal open={deleting != null} onOpenChange={(o) => !o && setDeleting(null)} title="Excluir plano">
        {deleting && (
          <div className="flex flex-col gap-3">
            <p className="m-0 text-sm">O plano “{deleting.name}” e suas execuções serão apagados. As compras já registradas continuam em Lançamentos.</p>
            <ErrorNote error={remove.error} />
            <div className="flex justify-end gap-2">
              <Button onClick={() => setDeleting(null)}>Cancelar</Button>
              <Button variant="danger" disabled={remove.isPending} onClick={() => remove.mutate(deleting.id, { onSuccess: () => setDeleting(null) })}>Excluir plano</Button>
            </div>
          </div>
        )}
      </Modal>
      <TradeDialog prefill={trade} onClose={() => setTrade(null)} />
    </>
  )
}

