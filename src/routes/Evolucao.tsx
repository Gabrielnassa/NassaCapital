import { Delta, EmptyState, ErrorNote, PageHeader, Panel, Stats } from '../components/ui'
import { LineChart } from '../components/LineChart'
import { evolution } from '../lib/calc/evolution'
import type { Ccy, Dec } from '../lib/calc/money'
import { DEFAULT_SETTINGS, pick, useSettings, useSnapshots } from '../lib/data'
import { fmtDate, fmtDayMonth, fmtMoney } from '../lib/format'

const compact = (ccy: Ccy) => {
  const f = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 })
  return (v: Dec) => `${ccy === 'BRL' ? 'R$' : 'US$'} ${f.format(v.toNumber())}`
}

/** Patrimônio vs custo (o que foi investido, pelo preço médio), um ponto por dia. */
export function Evolucao() {
  const snapshots = useSnapshots()
  const settings = useSettings()
  if (snapshots.error) return <ErrorNote error={snapshots.error} />
  if (!snapshots.data) return null

  const main = (settings.data ?? DEFAULT_SETTINGS).main_currency
  const points = evolution(snapshots.data.map((s) => ({ date: s.date, value: pick(main, s.value_brl, s.value_usd)!, cost: pick(main, s.cost_brl, s.cost_usd)! })))

  if (points.length === 0) {
    return (
      <>
        <PageHeader title="Evolução" />
        <Panel flush><EmptyState text="O primeiro registro diário é gravado às 23:55." /></Panel>
      </>
    )
  }

  const first = points[0], last = points.at(-1)!
  const best = points.reduce((a, b) => (b.value.gt(a.value) ? b : a))
  const rows = [...points].reverse()

  return (
    <>
      <PageHeader title="Evolução" />
      <div className="flex flex-col gap-4">
        <Stats items={[
          { label: `Patrimônio em ${fmtDayMonth(last.date)}`, value: fmtMoney(last.value, main) },
          { label: 'Custo', value: fmtMoney(last.cost, main), sub: 'o que foi investido' },
          { label: 'Lucro ou prejuízo', value: <Delta value={last.gain} ccy={main} />, sub: <Delta value={last.gainPct} /> },
          { label: `Desde ${fmtDayMonth(first.date)}`, value: <Delta value={last.value.minus(first.value)} ccy={main} />, sub: `máx. ${fmtMoney(best.value, main)} (${fmtDayMonth(best.date)})` },
        ]} />

        <Panel title="Patrimônio e custo, por dia">
          {points.length < 2 ? (
            <p className="m-0 text-sm text-muted">O gráfico aparece a partir do segundo dia de registro.</p>
          ) : (
            <LineChart aria-label={`Patrimônio de ${fmtMoney(first.value, main)} a ${fmtMoney(last.value, main)} entre ${fmtDate(first.date)} e ${fmtDate(last.date)}`}
              labels={points.map((p) => fmtDayMonth(p.date))}
              series={[
                { id: 'value', label: 'Patrimônio', color: 'var(--accent)', values: points.map((p) => p.value) },
                { id: 'cost', label: 'Custo', color: 'var(--chart-ref)', dashed: true, values: points.map((p) => p.cost) },
              ]}
              format={(v) => fmtMoney(v, main)} formatAxis={compact(main)} tooltipTitle={(i) => fmtDate(points[i].date)} />
          )}
          <p className="mt-2 mb-0 text-xs text-muted">Um registro por dia, às 23:55 de Brasília. Custo é a soma do que foi pago, pelo preço médio; sobe quando você compra.</p>
        </Panel>

        <Panel flush className="overflow-x-auto">
          <table className="tbl">
            <thead><tr><th>Data</th><th className="r">Patrimônio</th><th className="r max-md:hidden">Custo</th><th className="r">Lucro ou prejuízo</th><th className="r max-md:hidden">%</th></tr></thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.date} className="row">
                  <td className="num"><span className="max-md:hidden">{fmtDate(p.date)}</span><span className="md:hidden">{fmtDayMonth(p.date)}</span></td>
                  <td className="r num">{fmtMoney(p.value, main)}</td>
                  <td className="r num text-muted max-md:hidden">{fmtMoney(p.cost, main)}</td>
                  <td className="r"><Delta value={p.gain} ccy={main} /></td>
                  <td className="r max-md:hidden"><Delta value={p.gainPct} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      </div>
    </>
  )
}
