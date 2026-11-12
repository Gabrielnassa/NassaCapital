import { RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { Button, Delta, EmptyState, ErrorNote, Panel, Popover } from '../components/ui'
import { openExecutions, totals, type OpenExecution } from '../features/portfolio'
import { TradeDialog, type TradePrefill } from '../features/TradeForm'
import { sum, ZERO, type Ccy } from '../lib/calc/money'
import { DEFAULT_SETTINGS, pick, refreshPrices, seedInitialData, useAssets, usePlans, usePositions, usePriceStatus, useSettings, useWrite } from '../lib/data'
import { fmtDateTime, fmtDayMonth, fmtMoney, fmtQty, todayISO } from '../lib/format'

function PriceStatus() {
  const status = usePriceStatus()
  const refresh = useWrite(refreshPrices)
  const at = status.data?.fetchedAt
  return (
    <Popover
      align="end"
      trigger={
        <button type="button" className="num cursor-pointer rounded-sm border-0 bg-transparent p-0 text-xs text-muted underline decoration-border-strong underline-offset-2 hover:text-text">
          {at ? `Preços de ${fmtDateTime(at)}` : 'Sem cotação ainda'}
        </button>
      }
    >
      <p className="mt-0 mb-2 text-muted">
        {at
          ? 'Os preços são buscados pelo servidor a cada 15 minutos: cripto o dia todo, B3 e dólar só no pregão.'
          : 'Enquanto o servidor não grava as cotações, o app usa o preço do último lançamento de cada ativo.'}
      </p>
      <Button size="sm" onClick={() => refresh.mutate(undefined)} disabled={refresh.isPending}>
        <RefreshCw size={16} />
        {refresh.isPending ? 'Atualizando' : 'Atualizar agora'}
      </Button>
      {refresh.data?.skipped && <p className="mt-2 mb-0 text-xs text-muted">Já {refresh.data.skipped}.</p>}
      {refresh.data?.errors?.map((e) => <p key={e} className="mt-2 mb-0 text-xs text-down">{e}</p>)}
      {refresh.error && <p className="mt-2 mb-0 text-xs text-down">{refresh.error.message}</p>}
    </Popover>
  )
}

function ExecutionList(props: { title: string; rows: OpenExecution[]; main: Ccy; showDate?: boolean; onRegister: (e: OpenExecution) => void }) {
  const other: Ccy = props.main === 'BRL' ? 'USD' : 'BRL'
  const total = (ccy: Ccy) => sum(props.rows.map((r) => pick(ccy, r.amountBrl, r.amountUsd) ?? ZERO))
  return (
    <Panel
      flush
      title={props.title}
      action={
        <span className="num text-sm">
          <span className="font-medium">{fmtMoney(total(props.main), props.main)}</span>
          <span className="ml-2 text-muted">{fmtMoney(total(other), other)}</span>
        </span>
      }
    >
      <ul className="m-0 list-none p-0">
        {props.rows.map((r) => (
          <li key={r.execution.id} className="flex h-11 items-center gap-3 border-b border-border px-3 last:border-b-0">
            <div className="w-16 shrink-0">
              <div className="text-sm font-semibold">{r.asset?.ticker ?? '?'}</div>
              {props.showDate && <div className="num text-xs text-down">{fmtDayMonth(r.scheduledDate)}</div>}
            </div>
            <div className="min-w-0 flex-1 text-right">
              <div className="num text-sm font-medium">{fmtMoney(pick(props.main, r.amountBrl, r.amountUsd), props.main)}</div>
              <div className="num truncate text-xs text-muted">
                {fmtMoney(pick(other, r.amountBrl, r.amountUsd), other)}
                {r.estimatedQty && <span className="ml-2">≈ {fmtQty(r.estimatedQty.toDecimalPlaces(6))}</span>}
              </div>
            </div>
            <Button size="sm" variant="primary" onClick={() => props.onRegister(r)}>
              Registrar
            </Button>
          </li>
        ))}
      </ul>
    </Panel>
  )
}

export function Hoje() {
  const positions = usePositions()
  const plans = usePlans()
  const assets = useAssets()
  const settings = useSettings()
  const seed = useWrite(seedInitialData)
  const [trade, setTrade] = useState<TradePrefill | null>(null)

  const error = positions.error ?? plans.error ?? assets.error
  if (error) return <ErrorNote error={error} />
  if (!positions.data || !plans.data || !assets.data) return null

  const main = (settings.data ?? DEFAULT_SETTINGS).main_currency
  const other: Ccy = main === 'BRL' ? 'USD' : 'BRL'
  const t = totals(positions.data)
  const due = openExecutions(plans.data, assets.data, positions.data, todayISO())
  const register = (e: OpenExecution) =>
    setTrade({
      assetId: e.item.asset_id, amount: e.execution.planned_amount, amountCcy: e.plan.source_currency,
      executionId: e.execution.id, fundingAssetId: e.plan.funding_asset_id,
    })

  if (assets.data.length === 0) {
    return (
      <Panel flush>
        <EmptyState
          text="A carteira está vazia."
          action={
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" onClick={() => seed.mutate(undefined)} disabled={seed.isPending}>
                Carregar minha carteira de 11/11/2026
              </Button>
              <Link to="/ajustes"><Button>Cadastrar ativos</Button></Link>
            </div>
          }
        />
        <div className="px-3 pb-3"><ErrorNote error={seed.error} /></div>
      </Panel>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <header className="flex items-end justify-between gap-3">
        <div>
          <div className="text-xs font-medium text-muted">Patrimônio</div>
          <div className="num text-2xl leading-tight font-medium">{fmtMoney(pick(main, t.brl, t.usd), main)}</div>
          <div className="num text-sm text-muted">{fmtMoney(pick(other, t.brl, t.usd), other)}</div>
        </div>
        <div className="flex flex-col items-end gap-0.5">
          <div className="text-xs font-medium text-muted">Hoje</div>
          {t.dayPct ? (
            <div className="text-sm">
              <Delta value={pick(main, t.dayBrl, t.dayUsd)} ccy={main} /> <Delta value={t.dayPct} className="ml-1" />
            </div>
          ) : (
            <div className="num text-sm text-muted">—</div>
          )}
          <PriceStatus />
        </div>
      </header>

      {due.today.length > 0 ? (
        <ExecutionList title="Comprar hoje" rows={due.today} main={main} onRegister={register} />
      ) : (
        <Panel flush title="Comprar hoje">
          <EmptyState text="Nenhuma compra para hoje." action={<Link to="/dca"><Button>Ver planos de DCA</Button></Link>} />
        </Panel>
      )}
      {due.overdue.length > 0 && <ExecutionList title="Atrasadas" rows={due.overdue} main={main} showDate onRegister={register} />}

      <TradeDialog prefill={trade} onClose={() => setTrade(null)} />
    </div>
  )
}
