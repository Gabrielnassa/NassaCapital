import { ArrowDown, ArrowUp } from 'lucide-react'
import { Fragment, useState } from 'react'
import { Link } from 'react-router'
import { Badge, Button, Delta, EmptyState, ErrorNote, PageHeader, Panel } from '../components/ui'
import { totals } from '../features/portfolio'
import { sum, ZERO, type Ccy, type Dec } from '../lib/calc/money'
import { CLASS_LABEL, CLASS_ORDER, DEFAULT_SETTINGS, pick, useSettings, type Allocation, type Position } from '../lib/data'
import { usePortfolio } from '../lib/live-context'
import { fmtAmount, fmtMoney, fmtPct, fmtPctSigned, fmtPrice, fmtQty } from '../lib/format'

interface Row {
  p: Position
  a: Allocation | undefined
  plMain: Dec | null
}

type SortKey = 'ticker' | 'quantity' | 'avg' | 'price' | 'brl' | 'usd' | 'pl' | 'plPct' | 'current' | 'target' | 'deviation' | 'missing'
const COLUMNS: { key: SortKey; label: string; get: (r: Row, main: Ccy) => Dec | string | null | undefined }[] = [
  { key: 'ticker', label: 'Ativo', get: (r) => r.p.ticker },
  { key: 'quantity', label: 'Qtd', get: (r) => r.p.quantity },
  { key: 'avg', label: 'Preço médio', get: (r) => r.p.avg_price },
  { key: 'price', label: 'Preço', get: (r) => r.p.price },
  { key: 'brl', label: 'Valor R$', get: (r) => r.p.value_brl },
  { key: 'usd', label: 'Valor US$', get: (r) => r.p.value_usd },
  { key: 'pl', label: 'L/P', get: (r) => r.plMain },
  { key: 'plPct', label: 'L/P %', get: (r) => r.p.pl_pct },
  { key: 'current', label: '% atual', get: (r) => r.a?.current_pct },
  { key: 'target', label: '% meta', get: (r) => r.a?.target_pct },
  { key: 'deviation', label: 'Desvio p.p.', get: (r) => r.a?.deviation_pct },
  { key: 'missing', label: 'Falta', get: (r, main) => pick(main, r.a?.missing_brl ?? null, r.a?.missing_usd ?? null) },
]

function compare(a: Dec | string | null | undefined, b: Dec | string | null | undefined) {
  if (a == null || b == null) return a == null ? (b == null ? 0 : 1) : -1 // vazios sempre no fim
  return typeof a === 'string' || typeof b === 'string' ? String(a).localeCompare(String(b)) : a.cmp(b)
}

export function Carteira() {
  const portfolio = usePortfolio()
  const positions = { data: portfolio.positions, error: portfolio.error }
  const allocation = { data: portfolio.allocation, error: null }
  const settings = useSettings()
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: 'brl', desc: true })

  if (positions.error ?? allocation.error) return <ErrorNote error={positions.error ?? allocation.error} />
  if (!positions.data || !allocation.data) return null

  const main = (settings.data ?? DEFAULT_SETTINGS).main_currency
  const assetAlloc = allocation.data.filter((a) => a.kind === 'asset')
  const classAlloc = allocation.data.filter((a) => a.kind === 'class')
  const rows: Row[] = positions.data
    .map((p) => ({ p, a: assetAlloc.find((a) => a.asset_id === p.asset_id), plMain: p.value_brl && p.cost_brl ? pick(main, p.value_brl.minus(p.cost_brl), p.value_usd!.minus(p.cost_usd!)) : null }))
    .filter((r) => r.p.quantity.gt(0) || r.a?.target_pct)

  const column = COLUMNS.find((c) => c.key === sort.key)!
  const sorted = [...rows].sort((x, y) => {
    const [a, b] = [column.get(x, main), column.get(y, main)]
    return a == null || b == null ? compare(a, b) : compare(a, b) * (sort.desc ? -1 : 1)
  })
  const groups = CLASS_ORDER.map((c) => ({ class: c, rows: sorted.filter((r) => r.p.class === c), alloc: classAlloc.find((a) => a.class === c) })).filter((g) => g.rows.length)
  const t = totals(positions.data)
  const anyLastTx = rows.some((r) => r.p.price_origin === 'last_tx' && r.p.quantity.gt(0))
  const toggle = (key: SortKey) => setSort((s) => ({ key, desc: s.key === key ? !s.desc : key !== 'ticker' }))
  const groupValue = (rs: Row[], ccy: Ccy) => sum(rs.map((r) => pick(ccy, r.p.value_brl, r.p.value_usd) ?? ZERO))

  if (rows.length === 0) {
    return (
      <>
        <PageHeader title="Carteira" />
        <Panel flush><EmptyState text="Nenhuma posição." action={<Link to="/lancamentos"><Button variant="primary">Registrar compra</Button></Link>} /></Panel>
      </>
    )
  }

  const target = (r: Row) => (r.a?.target_pct ? <span className="num">{fmtPct(r.a.target_pct)}</span> : <Badge>fora da meta</Badge>)

  return (
    <>
      <PageHeader title="Carteira">
        <span className="num text-sm">
          <span className="font-medium">{fmtMoney(pick(main, t.brl, t.usd), main)}</span>
          <span className="ml-2 text-muted">{fmtMoney(pick(main === 'BRL' ? 'USD' : 'BRL', t.brl, t.usd), main === 'BRL' ? 'USD' : 'BRL')}</span>
        </span>
      </PageHeader>

      {/* Desktop: tabela densa */}
      <Panel flush className="hidden overflow-x-auto md:block">
        <table className="tbl tbl-tight">
          <thead>
            <tr>
              {COLUMNS.map((c) => (
                <th key={c.key} className={c.key === 'ticker' ? '' : 'r'} aria-sort={sort.key === c.key ? (sort.desc ? 'descending' : 'ascending') : undefined}>
                  <button type="button" onClick={() => toggle(c.key)} className="inline-flex cursor-pointer items-center gap-1 border-0 bg-transparent p-0 font-medium text-inherit hover:text-text">
                    {c.label}
                    {sort.key === c.key && (sort.desc ? <ArrowDown size={12} /> : <ArrowUp size={12} />)}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <Fragment key={g.class}>
                <tr>
                  <td className="group" colSpan={4}>{CLASS_LABEL[g.class]}</td>
                  <td className="group r num">{fmtAmount(groupValue(g.rows, 'BRL'))}</td>
                  <td className="group r num">{fmtAmount(groupValue(g.rows, 'USD'))}</td>
                  <td className="group" colSpan={2} />
                  <td className="group r num">{fmtPct(g.alloc?.current_pct)}</td>
                  <td className="group r num">{g.alloc?.target_pct ? fmtPct(g.alloc.target_pct) : ''}</td>
                  <td className="group" colSpan={2} />
                </tr>
                {g.rows.map((r) => (
                  <tr key={r.p.asset_id} className="row">
                    <td title={r.p.name}>
                      <span className="font-semibold">{r.p.ticker}</span>
                      <span className="ml-2 text-muted max-2xl:hidden">{r.p.name}</span>
                    </td>
                    <td className="r num">{fmtQty(r.p.quantity)}</td>
                    <td className="r num">{r.p.quantity.gt(0) ? fmtPrice(r.p.avg_price, r.p.quote_currency) : '—'}</td>
                    <td className={`r num ${r.p.price_origin === 'last_tx' ? 'text-muted' : ''}`}>
                      {fmtPrice(r.p.price, r.p.quote_currency)}{r.p.price_origin === 'last_tx' && '*'}
                    </td>
                    <td className="r num">{fmtAmount(r.p.value_brl)}</td>
                    <td className="r num">{fmtAmount(r.p.value_usd)}</td>
                    <td className="r"><Delta value={r.p.quantity.gt(0) ? r.plMain : null} ccy={main} /></td>
                    <td className="r"><Delta value={r.p.pl_pct} /></td>
                    <td className="r num">{fmtPct(r.a?.current_pct)}</td>
                    <td className="r">{target(r)}</td>
                    <td className="r num text-muted">{r.a?.deviation_pct ? fmtPctSigned(r.a.deviation_pct).replace('%', '') : '—'}</td>
                    <td className="r num">{r.a?.target_pct ? fmtMoney(pick(main, r.a.missing_brl, r.a.missing_usd), main) : '—'}</td>
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </Panel>

      {/* Celular: lista compacta */}
      <div className="flex flex-col gap-3 md:hidden">
        {groups.map((g) => (
          <Panel key={g.class} flush title={CLASS_LABEL[g.class]} action={<span className="num text-sm">{fmtMoney(groupValue(g.rows, main), main)} · {fmtPct(g.alloc?.current_pct)}</span>}>
            {g.rows.map((r) => (
              <div key={r.p.asset_id} className="border-b border-border px-3 py-2 last:border-b-0">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-sm font-semibold">{r.p.ticker}</span>
                  <span className="num text-sm font-medium">{fmtMoney(pick(main, r.p.value_brl, r.p.value_usd), main)}</span>
                </div>
                <div className="flex items-baseline justify-between gap-3 text-xs text-muted">
                  <span className="num">{fmtQty(r.p.quantity)} · PM {r.p.quantity.gt(0) ? fmtPrice(r.p.avg_price, r.p.quote_currency) : '—'}</span>
                  <Delta value={r.p.pl_pct} />
                </div>
                <div className="mt-0.5 flex items-baseline justify-between gap-3 text-xs text-muted">
                  <span className="num">
                    {fmtPct(r.a?.current_pct)} {r.a?.target_pct ? `de ${fmtPct(r.a.target_pct)}` : '· fora da meta'}
                  </span>
                  {r.a?.target_pct && r.a.missing_brl?.gt(0) && <span className="num">falta {fmtMoney(pick(main, r.a.missing_brl, r.a.missing_usd), main)}</span>}
                </div>
              </div>
            ))}
          </Panel>
        ))}
      </div>

      {anyLastTx && <p className="mt-2 mb-0 text-xs text-muted">* Sem cotação gravada: o preço é o do último lançamento.</p>}
    </>
  )
}
