import { BarChart } from '../components/BarChart'
import { Delta, EmptyState, ErrorNote, PageHeader, Panel, Stats } from '../components/ui'
import { evolution } from '../lib/calc/evolution'
import type { Dec } from '../lib/calc/money'
import { DEFAULT_SETTINGS, pick, useSettings, useSnapshots } from '../lib/data'
import { fmtDate, fmtDayMonth, fmtMoney, fmtMoneyShortSigned } from '../lib/format'

// Eixo: só o número, com sinal (a moeda está no título do gráfico).
const axisFormat = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0, signDisplay: 'exceptZero' })
const compact = (v: Dec) => axisFormat.format(v.toNumber()).replace('-', '\u2212')

/** Ganho ou perda por dia: quanto a carteira vale a mais (ou a menos) do que foi investido. */
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

  const last = points.at(-1)!
  const best = points.reduce((a, b) => (b.gain.gt(a.gain) ? b : a))
  const worst = points.reduce((a, b) => (b.gain.lt(a.gain) ? b : a))
  const rows = [...points].reverse()

  return (
    <>
      <PageHeader title="Evolução" />
      <div className="flex flex-col gap-4">
        <Stats items={[
          { label: `Vale em ${fmtDayMonth(last.date)}`, value: fmtMoney(last.value, main) },
          { label: 'Investido', value: fmtMoney(last.cost, main), sub: 'o que você pagou' },
          { label: 'Ganho ou perda', value: <Delta value={last.gain} ccy={main} />, sub: <Delta value={last.gainPct} /> },
          { label: 'Melhor e pior dia', value: <Delta value={best.gain} ccy={main} />, sub: <>pior: <Delta value={worst.gain} ccy={main} /> em {fmtDayMonth(worst.date)}</> },
        ]} />

        <Panel title={`Ganho ou perda por dia (${main === 'BRL' ? 'R$' : 'US$'})`}>
          <BarChart
            aria-label={`Ganho ou perda por dia, de ${fmtDate(points[0].date)} a ${fmtDate(last.date)}. Último: ${fmtMoney(last.gain, main)}.`}
            labels={points.map((p) => fmtDayMonth(p.date))}
            values={points.map((p) => p.gain)}
            formatLabel={(v) => fmtMoneyShortSigned(v, main)}
            formatAxis={compact}
            tooltip={(i) => {
              const p = points[i]
              return (
                <>
                  <div className="num mb-1 font-medium">{fmtDate(p.date)}</div>
                  <div className="flex justify-between gap-4"><span className="text-muted">Valia</span><span className="num">{fmtMoney(p.value, main)}</span></div>
                  <div className="flex justify-between gap-4"><span className="text-muted">Investido</span><span className="num">{fmtMoney(p.cost, main)}</span></div>
                  <div className="flex justify-between gap-4"><span className="text-muted">Ganho ou perda</span><span><Delta value={p.gain} ccy={main} /> <Delta value={p.gainPct} /></span></div>
                </>
              )
            }}
          />
          <p className="mt-2 mb-0 text-xs text-muted">
            Cada barra compara quanto a carteira valia no fim do dia com quanto você pagou por ela. Acima da linha do zero, você está
            ganhando; abaixo, perdendo. Registro diário às 23:55.
          </p>
        </Panel>

        <Panel flush className="overflow-x-auto">
          <table className="tbl">
            <thead><tr><th>Data</th><th className="r">Valia</th><th className="r max-md:hidden">Investido</th><th className="r">Ganho ou perda</th><th className="r max-md:hidden">%</th></tr></thead>
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
