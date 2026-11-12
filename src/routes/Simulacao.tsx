import Decimal from 'decimal.js'
import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { Button, Delta, EmptyState, ErrorNote, Field, NumberInput, PageHeader, Panel, Stats } from '../components/ui'
import { convert, D, type Ccy, type Dec } from '../lib/calc/money'
import { btcChangeForTotal, btcChangePct, simulateScenario } from '../lib/calc/scenario'
import { defaultBeta, SEGMENT_LABEL, segmentOf, type Segment } from '../lib/calc/segments'
import { DEFAULT_SETTINGS, pick, saveBetas, useAssets, useSettings, useWrite, type Asset, type Position } from '../lib/data'
import { fmtMoney, fmtPct, fmtPrice, fmtQty, parseMoneyBR, parseNumberBR } from '../lib/format'
import { usePortfolio } from '../lib/live-context'

const PRESETS = [-30, 25, 50, 100, 200]
const toInput = (d: Dec, places = 2) => d.toDecimalPlaces(places).toFixed().replace('.', ',')
/** Valor inteiro com separador de milhar, como o dono digitaria: 112.681 */
const toMoneyInput = (d: Dec) => fmtQty(d.toDecimalPlaces(0))

interface Line {
  asset: Asset
  position: Position
  segment: Segment
  saved: Dec
}

function Simulator(props: { lines: Line[]; btcNow: Dec; main: Ccy; usdBrl: Dec | null }) {
  const { lines, btcNow, main } = props
  const other: Ccy = main === 'BRL' ? 'USD' : 'BRL'
  const save = useWrite(saveBetas)
  // O alvo inicial é fixado ao abrir a tela (BTC +50%), para não ficar mudando com o preço ao vivo.
  const [targetRaw, setTargetRaw] = useState(() => toMoneyInput(btcNow.times('1.5')))
  const [betaRaw, setBetaRaw] = useState<Record<string, string>>({})
  const [wantedRaw, setWantedRaw] = useState('')

  const betaOf = (l: Line): Dec | null => {
    const raw = betaRaw[l.asset.id]
    if (raw == null) return l.saved
    const n = parseNumberBR(raw)
    return n != null && D(n).lte(10) ? D(n) : null
  }
  const holdings = lines.map((l) => ({ id: l.asset.id, value: pick(main, l.position.value_brl, l.position.value_usd)!, beta: betaOf(l) ?? l.saved }))
  const target = parseMoneyBR(targetRaw)
  const scenario = useMemo(
    () => (target && D(target).gt(0) ? simulateScenario(holdings, btcChangePct(btcNow, D(target))) : null),
    // holdings é refeito a cada render; as dependências reais são os valores abaixo
    // oxlint-disable-next-line react-hooks/exhaustive-deps
    [target, btcNow.toFixed(), JSON.stringify(holdings.map((h) => [h.id, h.value.toFixed(2), h.beta.toFixed()]))],
  )
  const toOther = (v: Dec) => (props.usdBrl?.gt(0) ? convert(v, main, other, props.usdBrl) : null)

  const changed = lines.filter((l) => betaRaw[l.asset.id] != null && betaOf(l) && !betaOf(l)!.eq(l.saved))
  const invalid = lines.some((l) => betaOf(l) == null)

  const wanted = parseMoneyBR(wantedRaw)
  const needed = wanted && D(wanted).gt(0) ? btcChangeForTotal(holdings, D(wanted)) : undefined
  const rows = scenario ? [...scenario.rows].sort((a, b) => b.valueThen.cmp(a.valueThen)) : []
  const lineOf = (id: string) => lines.find((l) => l.asset.id === id)!

  return (
    <div className="flex flex-col gap-4">
      <Panel title="Se o Bitcoin chegar a">
        <div className="flex flex-wrap items-end gap-x-3 gap-y-2">
          <Field label="Preço do BTC (US$)" className="w-40">
            <NumberInput value={targetRaw} onChange={(e) => setTargetRaw(e.target.value)} placeholder="100.000" />
          </Field>
          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map((p) => (
              <Button key={p} size="sm" className="h-9" onClick={() => setTargetRaw(toMoneyInput(btcNow.times(D(100 + p).div(100))))}>
                {p > 0 ? `+${p}%` : `−${Math.abs(p)}%`}
              </Button>
            ))}
          </div>
        </div>
      </Panel>

      {scenario ? (
        <Stats items={[
          { label: 'Bitcoin hoje', value: fmtPrice(btcNow, 'USD') },
          { label: 'Bitcoin no cenário', value: fmtPrice(D(target!), 'USD'), sub: <Delta value={scenario.btcChangePct} /> },
          { label: 'Patrimônio hoje', value: fmtMoney(scenario.totalNow, main), sub: fmtMoney(toOther(scenario.totalNow), other) },
          { label: 'Patrimônio no cenário', value: fmtMoney(scenario.totalThen, main), sub: fmtMoney(toOther(scenario.totalThen), other) },
          { label: 'Diferença', value: <Delta value={scenario.gain} ccy={main} />, sub: <Delta value={scenario.gainPct} /> },
        ]} />
      ) : (
        <p className="m-0 text-sm text-muted">Informe um preço para o Bitcoin.</p>
      )}

      {scenario && (
        <Panel flush className="overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th>Ativo</th><th className="r w-24">Multiplicador</th><th className="r max-md:hidden">Variação</th>
                <th className="r max-md:hidden">Hoje</th><th className="r">No cenário</th><th className="r">Diferença</th><th className="r max-md:hidden">% da carteira</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const l = lineOf(r.id)
                const isBtc = l.segment === 'bitcoin'
                return (
                  <tr key={r.id}>
                    <td>
                      <span className="font-semibold">{l.asset.ticker}</span>
                      <span className="ml-2 text-muted max-md:hidden">{SEGMENT_LABEL[l.segment]}</span>
                    </td>
                    <td className="r">
                      {isBtc ? <span className="num text-muted">1</span> : (
                        <NumberInput aria-label={`Multiplicador de ${l.asset.ticker}`} className="h-7 w-16" aria-invalid={betaOf(l) == null}
                          value={betaRaw[r.id] ?? toInput(l.saved)} onChange={(e) => setBetaRaw((b) => ({ ...b, [r.id]: e.target.value }))} />
                      )}
                    </td>
                    <td className="r max-md:hidden"><Delta value={r.changePct} /></td>
                    <td className="r num max-md:hidden">{fmtMoney(r.valueNow, main)}</td>
                    <td className="r num font-medium">{fmtMoney(r.valueThen, main)}</td>
                    <td className="r"><Delta value={r.gain} ccy={main} /></td>
                    <td className="r num max-md:hidden">{fmtPct(r.shareThen)}</td>
                  </tr>
                )
              })}
              <tr className="total">
                <td colSpan={2}>Total</td>
                <td className="r max-md:hidden"><Delta value={scenario.gainPct} /></td>
                <td className="r num max-md:hidden">{fmtMoney(scenario.totalNow, main)}</td>
                <td className="r num">{fmtMoney(scenario.totalThen, main)}</td>
                <td className="r"><Delta value={scenario.gain} ccy={main} /></td>
                <td className="max-md:hidden" />
              </tr>
            </tbody>
          </table>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-3 py-2">
            <p className="m-0 max-w-2xl text-xs text-muted">
              É uma hipótese, não uma previsão. O multiplicador diz quanto o ativo se move para cada 1% do Bitcoin: 1,5 quer dizer
              que, se o BTC subir 10%, o ativo sobe 15% (e cai 15% se o BTC cair 10%). O padrão é 1,5 para altcoins e 0 para
              stablecoins, bolsa e caixa. O dólar fica no câmbio de hoje.
            </p>
            {(changed.length > 0 || invalid) && (
              <Button variant="primary" disabled={invalid || save.isPending}
                onClick={() => save.mutate(changed.map((l) => ({ id: l.asset.id, btc_beta: betaOf(l)!.toFixed() })), { onSuccess: () => setBetaRaw({}) })}>
                {invalid ? 'Multiplicador inválido (0 a 10)' : 'Salvar multiplicadores'}
              </Button>
            )}
          </div>
          {save.error && <div className="px-3 pb-3"><ErrorNote error={save.error} /></div>}
        </Panel>
      )}

      <Panel title="Quanto o Bitcoin precisa valer">
        <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
          <Field label={`Para o patrimônio chegar a (${main === 'BRL' ? 'R$' : 'US$'})`} className="w-56">
            <NumberInput value={wantedRaw} onChange={(e) => setWantedRaw(e.target.value)} placeholder={toMoneyInput(holdings.reduce((a, h) => a.plus(h.value), new Decimal(0)).times(2))} />
          </Field>
          <p className="m-0 pb-2 text-sm">
            {needed === undefined ? (
              <span className="text-muted">Usa os mesmos multiplicadores da tabela.</span>
            ) : needed === null ? (
              <span className="text-muted">Não dá para chegar a esse valor só com a variação do Bitcoin.</span>
            ) : (
              <>
                o Bitcoin precisaria ir a <span className="num font-medium">{fmtPrice(btcNow.times(needed.div(100).plus(1)), 'USD')}</span>{' '}
                <Delta value={needed} />
              </>
            )}
          </p>
        </div>
      </Panel>
    </div>
  )
}

export function Simulacao() {
  const portfolio = usePortfolio()
  const assets = useAssets()
  const settings = useSettings()

  if (portfolio.error) return <ErrorNote error={portfolio.error} />
  if (!portfolio.positions || !assets.data) return null

  const main = (settings.data ?? DEFAULT_SETTINGS).main_currency
  const lines: Line[] = portfolio.positions
    .filter((p) => p.quantity.gt(0) && p.value_brl && p.value_usd)
    .flatMap((position) => {
      const asset = assets.data.find((a) => a.id === position.asset_id)
      if (!asset) return []
      const segment = segmentOf(asset)
      return [{ asset, position, segment, saved: segment === 'bitcoin' ? D(1) : (asset.btc_beta ?? defaultBeta(segment)) }]
    })
  const btc = portfolio.positions.find((p) => { const a = assets.data.find((x) => x.id === p.asset_id); return a && segmentOf(a) === 'bitcoin' })
  const usdBrl = portfolio.positions.find((p) => p.usd_brl)?.usd_brl ?? null
  const btcNow = btc?.price && btc.quote_currency === 'USD' ? btc.price : btc?.price && usdBrl ? btc.price.div(usdBrl) : null

  return (
    <>
      <PageHeader title="Simulação" />
      {btcNow && lines.length > 0 ? (
        <Simulator lines={lines} btcNow={btcNow} main={main} usdBrl={usdBrl} />
      ) : (
        <Panel flush>
          <EmptyState text="A simulação precisa do Bitcoin cadastrado com preço e de pelo menos uma posição." action={<Link to="/ajustes"><Button>Abrir Ajustes</Button></Link>} />
        </Panel>
      )}
    </>
  )
}
