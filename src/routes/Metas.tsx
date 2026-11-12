import Decimal from 'decimal.js'
import { useMemo, useState } from 'react'
import { Badge, Button, ErrorNote, Field, NumberInput, PageHeader, Panel, Segmented, Tabs, TargetBar } from '../components/ui'
import { simulateContribution } from '../lib/calc/contribution'
import { D, sum, ZERO, type Ccy, type Dec } from '../lib/calc/money'
import { CLASS_LABEL, CLASS_ORDER, DEFAULT_SETTINGS, pick, setTargets, useAssets, useSettings, useWrite, type Allocation, type AssetClass } from '../lib/data'
import { usePortfolio } from '../lib/live-context'
import { fmtMoney, fmtPct, parseNumberBR } from '../lib/format'

interface EditorRow {
  key: string
  label: string
  detail?: string
  current: Dec
  target: Dec | null
}

/** Editor de um conjunto de metas (por ativo ou por classe). Só salva quando a soma dá 100%. */
function TargetEditor(props: { kind: 'asset' | 'class'; rows: EditorRow[] }) {
  const save = useWrite(setTargets)
  const [draft, setDraft] = useState<Record<string, string>>(() =>
    Object.fromEntries(props.rows.map((r) => [r.key, r.target ? r.target.toFixed().replace('.', ',') : ''])),
  )
  const parsed = props.rows.map((r) => ({ ...r, value: draft[r.key]?.trim() ? parseNumberBR(draft[r.key]) : '0' }))
  const invalid = parsed.some((r) => r.value == null)
  const total = sum(parsed.map((r) => (r.value ? D(r.value) : ZERO)))
  const ok = !invalid && total.eq(100)
  const max = Decimal.max(10, ...props.rows.flatMap((r) => [r.current, r.target ?? ZERO])).times('1.1')

  return (
    <Panel flush>
      <table className="tbl">
        <thead>
          <tr><th>{props.kind === 'asset' ? 'Ativo' : 'Classe'}</th><th className="w-[40%] max-md:hidden">Atual vs meta</th><th className="r">% atual</th><th className="r w-24">% meta</th></tr>
        </thead>
        <tbody>
          {parsed.map((r) => {
            const live = r.value && D(r.value).gt(0) ? D(r.value) : null
            return (
              <tr key={r.key}>
                <td>
                  <span className="font-semibold">{r.label}</span>
                  {r.detail && <span className="ml-2 text-muted max-md:hidden">{r.detail}</span>}
                  {!live && r.current.gt(0) && <span className="ml-2"><Badge>fora da meta</Badge></span>}
                </td>
                <td className="max-md:hidden"><TargetBar current={r.current} target={live} max={max} /></td>
                <td className="r num">{fmtPct(r.current)}</td>
                <td className="r">
                  <NumberInput aria-label={`Meta de ${r.label} em %`} className="h-7 w-20" placeholder="0" value={draft[r.key] ?? ''}
                    aria-invalid={r.value == null} onChange={(e) => setDraft((d) => ({ ...d, [r.key]: e.target.value }))} />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border-strong px-3 py-2">
        <span className="text-sm">
          Soma <span className={`num font-medium ${ok ? 'text-up' : 'text-down'}`}>{fmtPct(total)}</span>
          {!ok && <span className="ml-2 text-muted">{invalid ? 'Há um valor inválido.' : total.lt(100) ? `Faltam ${fmtPct(D(100).minus(total))}.` : `Sobram ${fmtPct(total.minus(100))}.`}</span>}
        </span>
        <Button variant="primary" disabled={!ok || save.isPending}
          onClick={() => save.mutate({ kind: props.kind, items: parsed.map((r) => (props.kind === 'asset' ? { asset_id: r.key, percent: r.value! } : { class: r.key as AssetClass, percent: r.value! })) })}>
          {save.isSuccess && !save.isPending ? 'Metas salvas' : 'Salvar metas'}
        </Button>
      </div>
      {save.error && <div className="px-3 pb-3"><ErrorNote error={save.error} /></div>}
    </Panel>
  )
}

/** Simulador de aporte: quanto comprar de cada ativo para se aproximar da meta, sem vender nada. */
function Simulator(props: { allocation: Allocation[]; main: Ccy; usdBrl: Dec | null }) {
  const [raw, setRaw] = useState('')
  const [ccy, setCcy] = useState<Ccy>(props.main)
  const other: Ccy = ccy === 'BRL' ? 'USD' : 'BRL'
  const amount = parseNumberBR(raw)

  const result = useMemo(() => {
    if (!amount || !D(amount).gt(0)) return null
    const holdings = props.allocation.map((a) => ({ id: a.asset_id!, value: pick(ccy, a.value_brl, a.value_usd)!, targetPct: a.target_pct }))
    const total = sum(holdings.map((h) => h.value)).plus(amount)
    return simulateContribution(holdings, D(amount)).map((s) => {
      const a = props.allocation.find((x) => x.asset_id === s.id)!
      const before = pick(ccy, a.value_brl, a.value_usd)!
      return { ...s, ticker: a.ticker!, target: a.target_pct!, after: before.plus(s.amount).div(total).times(100) }
    }).sort((x, y) => y.amount.cmp(x.amount))
  }, [amount, ccy, props.allocation])

  const toOther = (v: Dec) => (props.usdBrl ? (ccy === 'USD' ? v.times(props.usdBrl) : v.div(props.usdBrl)) : null)

  return (
    <Panel title="Simulador de aporte" flush>
      <div className="flex flex-wrap items-end gap-2 p-3">
        <Field label="Valor do aporte" className="w-40">
          <NumberInput value={raw} onChange={(e) => setRaw(e.target.value)} placeholder="1.000,00" />
        </Field>
        <Segmented aria-label="Moeda do aporte" value={ccy} onChange={setCcy} options={[{ value: 'BRL', label: 'R$' }, { value: 'USD', label: 'US$' }]} />
      </div>
      {result && result.length > 0 && (
        <table className="tbl border-t border-border">
          <thead>
            <tr><th>Comprar</th><th className="r">{ccy === 'BRL' ? 'R$' : 'US$'}</th><th className="r">{other === 'BRL' ? 'R$' : 'US$'}</th><th className="r">% depois</th><th className="r">% meta</th></tr>
          </thead>
          <tbody>
            {result.map((s) => (
              <tr key={s.id}>
                <td className="font-semibold">{s.ticker}</td>
                <td className="r num font-medium">{fmtMoney(s.amount, ccy)}</td>
                <td className="r num text-muted">{fmtMoney(toOther(s.amount), other)}</td>
                <td className="r num">{fmtPct(s.after)}</td>
                <td className="r num text-muted">{fmtPct(s.target)}</td>
              </tr>
            ))}
            <tr>
              <td className="font-medium text-muted">Total</td>
              <td className="r num font-medium">{fmtMoney(sum(result.map((s) => s.amount)), ccy)}</td>
              <td colSpan={3} />
            </tr>
          </tbody>
        </table>
      )}
      {result && result.length === 0 && <p className="m-0 border-t border-border px-3 py-3 text-sm text-muted">Nenhum ativo abaixo da meta. Defina as metas por ativo.</p>}
    </Panel>
  )
}

export function Metas() {
  const portfolio = usePortfolio()
  const allocation = { data: portfolio.allocation, error: portfolio.error }
  const assets = useAssets()
  const settings = useSettings()
  const [tab, setTab] = useState('asset')

  if (allocation.error ?? assets.error) return <ErrorNote error={allocation.error ?? assets.error} />
  if (!allocation.data || !assets.data) return null

  const main = (settings.data ?? DEFAULT_SETTINGS).main_currency
  const byAsset = allocation.data.filter((a) => a.kind === 'asset')
  const byClass = allocation.data.filter((a) => a.kind === 'class')
  const totalBrl = sum(byAsset.map((a) => a.value_brl))
  const totalUsd = sum(byAsset.map((a) => a.value_usd))
  const usdBrl = totalUsd.gt(0) ? totalBrl.div(totalUsd) : null

  const assetRows: EditorRow[] = assets.data
    .map((a) => {
      const al = byAsset.find((x) => x.asset_id === a.id)
      return { key: a.id, label: a.ticker, detail: a.name, current: al?.current_pct ?? ZERO, target: al?.target_pct ?? null }
    })
    .sort((x, y) => (y.target ?? ZERO).cmp(x.target ?? ZERO) || y.current.cmp(x.current))
  const classRows: EditorRow[] = CLASS_ORDER.map((c) => {
    const al = byClass.find((x) => x.class === c)
    return { key: c, label: CLASS_LABEL[c], current: al?.current_pct ?? ZERO, target: al?.target_pct ?? null }
  })
  // A chave refaz o rascunho quando as metas gravadas mudam.
  const version = (rows: EditorRow[]) => rows.map((r) => `${r.key}:${r.target?.toFixed() ?? ''}`).join('|')

  return (
    <>
      <PageHeader title="Metas" />
      <div className="flex flex-col gap-4">
        <Tabs value={tab} onChange={setTab} tabs={[
          { value: 'asset', label: 'Por ativo', content: <TargetEditor key={version(assetRows)} kind="asset" rows={assetRows} /> },
          { value: 'class', label: 'Por classe', content: <TargetEditor key={version(classRows)} kind="class" rows={classRows} /> },
        ]} />
        <Simulator allocation={byAsset} main={main} usdBrl={usdBrl} />
      </div>
    </>
  )
}
