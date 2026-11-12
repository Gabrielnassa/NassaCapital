import { ArrowDown, ArrowUp } from 'lucide-react'
import { Fragment, useState } from 'react'
import { Link } from 'react-router'
import { Badge, Button, Delta, EmptyState, ErrorNote, PageHeader, Panel, SegmentBar, Stats } from '../components/ui'
import { totals } from '../features/portfolio'
import { sum, ZERO, type Ccy, type Dec } from '../lib/calc/money'
import { GROUPS, SEGMENTS, segmentOf, type Segment } from '../lib/calc/segments'
import { DEFAULT_SETTINGS, pick, useAssets, useSettings, type Allocation, type Position } from '../lib/data'
import { fmtAmount, fmtMoney, fmtPct, fmtPctSigned, fmtPrice, fmtQty } from '../lib/format'
import { usePortfolio } from '../lib/live-context'

interface Row {
  p: Position
  a: Allocation | undefined
  segment: Segment
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

/** Subtotais de um conjunto de linhas: valor nas duas moedas, L/P e participação na carteira. */
function subtotal(rows: Row[], main: Ccy, totalBrl: Dec) {
  const brl = sum(rows.map((r) => r.p.value_brl ?? ZERO))
  const usd = sum(rows.map((r) => r.p.value_usd ?? ZERO))
  const cost = sum(rows.map((r) => pick(main, r.p.cost_brl, r.p.cost_usd) ?? ZERO))
  const value = pick(main, brl, usd)!
  return { brl, usd, pl: value.minus(cost), plPct: cost.gt(0) ? value.div(cost).minus(1).times(100) : null, pct: totalBrl.gt(0) ? brl.div(totalBrl).times(100) : ZERO }
}

export function Carteira() {
  const portfolio = usePortfolio()
  const assets = useAssets()
  const settings = useSettings()
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: 'brl', desc: true })

  if (portfolio.error) return <ErrorNote error={portfolio.error} />
  if (!portfolio.positions || !portfolio.allocation || !assets.data) return null

  const main = (settings.data ?? DEFAULT_SETTINGS).main_currency
  const other: Ccy = main === 'BRL' ? 'USD' : 'BRL'
  const assetAlloc = portfolio.allocation.filter((a) => a.kind === 'asset')
  const rows: Row[] = portfolio.positions
    .map((p) => ({
      p,
      a: assetAlloc.find((a) => a.asset_id === p.asset_id),
      segment: segmentOf({ class: p.class, ticker: p.ticker, source_id: assets.data.find((x) => x.id === p.asset_id)?.source_id }),
      plMain: p.value_brl && p.cost_brl ? pick(main, p.value_brl.minus(p.cost_brl), p.value_usd!.minus(p.cost_usd!)) : null,
    }))
    .filter((r) => r.p.quantity.gt(0) || r.a?.target_pct)

  if (rows.length === 0) {
    return (
      <>
        <PageHeader title="Carteira" />
        <Panel flush><EmptyState text="Nenhuma posição." action={<Link to="/lancamentos"><Button variant="primary">Registrar compra</Button></Link>} /></Panel>
      </>
    )
  }

  const column = COLUMNS.find((c) => c.key === sort.key)!
  const sorted = [...rows].sort((x, y) => {
    const [a, b] = [column.get(x, main), column.get(y, main)]
    return a == null || b == null ? compare(a, b) : compare(a, b) * (sort.desc ? -1 : 1)
  })
  const t = totals(portfolio.positions)
  const all = subtotal(rows, main, t.brl)
  // Dois níveis: Cripto (Bitcoin, Altcoins, Stablecoins), Bolsa (Ações, FIIs, ETFs) e Caixa.
  const groups = GROUPS.map((g) => {
    const segments = SEGMENTS.filter((s) => s.group === g.id)
      .map((s) => ({ ...s, rows: sorted.filter((r) => r.segment === s.id) }))
      .filter((s) => s.rows.length)
      .map((s) => ({ ...s, sub: subtotal(s.rows, main, t.brl) }))
    const groupRows = segments.flatMap((s) => s.rows)
    return { ...g, segments, rows: groupRows, sub: subtotal(groupRows, main, t.brl), nested: segments.some((s) => s.label !== g.label) }
  }).filter((g) => g.rows.length)

  const anyLastTx = rows.some((r) => r.p.price_origin === 'last_tx' && r.p.quantity.gt(0))
  const toggle = (key: SortKey) => setSort((s) => ({ key, desc: s.key === key ? !s.desc : key !== 'ticker' }))
  const target = (r: Row) => (r.a?.target_pct ? <span className="num">{fmtPct(r.a.target_pct)}</span> : <Badge>fora da meta</Badge>)
  const subtotalCells = (s: ReturnType<typeof subtotal>, cls: string) => (
    <>
      <td className={`${cls} r num`}>{fmtAmount(s.brl)}</td>
      <td className={`${cls} r num`}>{fmtAmount(s.usd)}</td>
      <td className={`${cls} r`}><Delta value={s.pl} ccy={main} /></td>
      <td className={`${cls} r`}><Delta value={s.plPct} /></td>
      <td className={`${cls} r num`}>{fmtPct(s.pct)}</td>
      <td className={cls} colSpan={3} />
    </>
  )

  return (
    <>
      <PageHeader title="Carteira">
        <span className="text-xs text-muted">{portfolio.live ? 'Binance ao vivo' : 'Preços gravados pelo servidor'}</span>
      </PageHeader>

      <div className="mb-3 flex flex-col gap-3">
        <Stats items={[
          { label: 'Patrimônio', value: fmtMoney(pick(main, t.brl, t.usd), main), sub: fmtMoney(pick(other, t.brl, t.usd), other) },
          { label: 'Custo', value: fmtMoney(pick(main, t.brl, t.usd)!.minus(all.pl), main), sub: 'pelo preço médio' },
          { label: 'Lucro ou prejuízo', value: <Delta value={all.pl} ccy={main} />, sub: <Delta value={all.plPct} /> },
          { label: 'Hoje', value: t.dayPct ? <Delta value={pick(main, t.dayBrl, t.dayUsd)} ccy={main} /> : '—', sub: t.dayPct ? <Delta value={t.dayPct} /> : 'sem variação de 24h' },
        ]} />
        <SegmentBar aria-label="Composição da carteira"
          segments={groups.flatMap((g) => g.segments.map((s) => ({ label: s.label, pct: s.sub.pct, muted: s.id === 'cash' })))} />
      </div>

      {/* Desktop: tabela densa */}
      <Panel flush className="hidden overflow-x-auto md:block">
        <table className="tbl tbl-tight">
          <thead>
            <tr>
              {COLUMNS.map((c) => (
                <th key={c.key} className={c.key === 'ticker' ? '' : 'r'} aria-sort={sort.key === c.key ? (sort.desc ? 'descending' : 'ascending') : undefined}>
                  <button type="button" onClick={() => toggle(c.key)} className="inline-flex cursor-pointer items-center gap-1 border-0 bg-transparent p-0 font-medium text-inherit hover:text-text">
                    {c.key === 'missing' ? `Falta ${main === 'BRL' ? 'R$' : 'US$'}` : c.label}
                    {sort.key === c.key && (sort.desc ? <ArrowDown size={12} /> : <ArrowUp size={12} />)}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <Fragment key={g.id}>
                <tr>
                  <td className="group" colSpan={4}>{g.label}</td>
                  {subtotalCells(g.sub, 'group')}
                </tr>
                {g.segments.map((s) => (
                  <Fragment key={s.id}>
                    {g.nested && (
                      <tr className="nested">
                        <td className="subgroup" colSpan={4}>{s.label}</td>
                        {subtotalCells(s.sub, 'subgroup')}
                      </tr>
                    )}
                    {s.rows.map((r) => (
                      <tr key={r.p.asset_id} className={`row ${g.nested ? 'nested' : ''}`}>
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
                        <td className="r num">{r.a?.target_pct ? fmtAmount(pick(main, r.a.missing_brl, r.a.missing_usd)) : '—'}</td>
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </Fragment>
            ))}
            <tr className="total">
              <td colSpan={4}>Total</td>
              {subtotalCells(all, '')}
            </tr>
          </tbody>
        </table>
      </Panel>

      {/* Celular: lista compacta */}
      <div className="flex flex-col gap-3 md:hidden">
        {groups.map((g) => (
          <Panel key={g.id} flush title={g.label} action={<span className="num text-sm">{fmtMoney(pick(main, g.sub.brl, g.sub.usd), main)} · {fmtPct(g.sub.pct)}</span>}>
            {g.segments.map((s) => (
              <Fragment key={s.id}>
                {g.nested && (
                  <div className="flex items-baseline justify-between gap-3 border-b border-border-strong px-3 py-1 text-xs font-medium text-muted">
                    <span>{s.label}</span>
                    <span className="num">{fmtMoney(pick(main, s.sub.brl, s.sub.usd), main)} · {fmtPct(s.sub.pct)}</span>
                  </div>
                )}
                {s.rows.map((r) => (
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
              </Fragment>
            ))}
          </Panel>
        ))}
      </div>

      {anyLastTx && <p className="mt-2 mb-0 text-xs text-muted">* Sem cotação gravada: o preço é o do último lançamento.</p>}
    </>
  )
}
