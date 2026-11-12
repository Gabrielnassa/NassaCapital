import { Pencil, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Button, EmptyState, ErrorNote, Modal, PageHeader, Panel, Select } from '../components/ui'
import { TradeDialog, type TradePrefill } from '../features/TradeForm'
import { TX_LABEL, deleteTransaction, useAssets, useBrokers, useTransactions, useWrite, type Transaction, type TxType } from '../lib/data'
import { fmtDate, fmtMoney, fmtPrice, fmtQty } from '../lib/format'

const ALL = 'all'

export function Lancamentos() {
  const txs = useTransactions()
  const assets = useAssets()
  const brokers = useBrokers()
  const remove = useWrite(deleteTransaction)
  const [trade, setTrade] = useState<TradePrefill | null>(null)
  const [toDelete, setToDelete] = useState<Transaction | null>(null)
  const [filter, setFilter] = useState({ asset: ALL, type: ALL, broker: ALL })

  if (txs.error ?? assets.error) return <ErrorNote error={txs.error ?? assets.error} />
  if (!txs.data || !assets.data) return null

  const ticker = (id: string) => assets.data.find((a) => a.id === id)?.ticker ?? '?'
  const brokerName = (id: string | null) => brokers.data?.find((b) => b.id === id)?.name ?? ''
  const list = txs.data.filter(
    (t) => (filter.asset === ALL || t.asset_id === filter.asset) && (filter.type === ALL || t.type === filter.type) && (filter.broker === ALL || t.broker_id === filter.broker),
  )
  const total = (t: Transaction) => t.quantity.times(t.unit_price).plus(t.fee)
  const actions = (t: Transaction) => (
    <span className="inline-flex gap-1">
      <Button size="sm" variant="ghost" aria-label={`Editar lançamento de ${ticker(t.asset_id)}`} onClick={() => setTrade({ tx: t })}><Pencil size={16} /></Button>
      <Button size="sm" variant="ghost" aria-label={`Excluir lançamento de ${ticker(t.asset_id)}`} onClick={() => setToDelete(t)}><Trash2 size={16} /></Button>
    </span>
  )

  return (
    <>
      <PageHeader title="Lançamentos">
        <Button variant="primary" onClick={() => setTrade({})}><Plus size={16} />Novo lançamento</Button>
      </PageHeader>

      <div className="mb-3 grid grid-cols-3 gap-2 md:max-w-xl">
        <Select aria-label="Filtrar por ativo" value={filter.asset} onChange={(v) => setFilter((f) => ({ ...f, asset: v }))}
          options={[{ value: ALL, label: 'Todos os ativos' }, ...assets.data.map((a) => ({ value: a.id, label: a.ticker }))]} />
        <Select aria-label="Filtrar por tipo" value={filter.type} onChange={(v) => setFilter((f) => ({ ...f, type: v }))}
          options={[{ value: ALL, label: 'Todos os tipos' }, ...(Object.keys(TX_LABEL) as TxType[]).map((t) => ({ value: t, label: TX_LABEL[t] }))]} />
        <Select aria-label="Filtrar por corretora" value={filter.broker} onChange={(v) => setFilter((f) => ({ ...f, broker: v }))}
          options={[{ value: ALL, label: 'Todas as corretoras' }, ...(brokers.data ?? []).map((b) => ({ value: b.id, label: b.name }))]} />
      </div>

      {list.length === 0 ? (
        <Panel flush>
          <EmptyState text="Nenhum lançamento." action={<Button variant="primary" onClick={() => setTrade({})}>Registrar compra</Button>} />
        </Panel>
      ) : (
        <>
          <Panel flush className="hidden overflow-x-auto md:block">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Data</th><th>Ativo</th><th>Tipo</th><th className="r">Quantidade</th><th className="r">Preço</th>
                  <th className="r">Taxa</th><th className="r">Total</th><th className="r">Câmbio</th><th>Corretora</th><th>Notas</th><th />
                </tr>
              </thead>
              <tbody>
                {list.map((t) => (
                  <tr key={t.id} className="row">
                    <td className="num">{fmtDate(t.date)}</td>
                    <td className="font-semibold">{ticker(t.asset_id)}</td>
                    <td>{TX_LABEL[t.type]}</td>
                    <td className="r num">{fmtQty(t.quantity)}</td>
                    <td className="r num">{fmtPrice(t.unit_price, t.currency)}</td>
                    <td className="r num">{fmtMoney(t.fee, t.currency)}</td>
                    <td className="r num">{fmtMoney(total(t), t.currency)}</td>
                    <td className="r num text-muted">{fmtQty(t.fx_rate_to_brl.toDecimalPlaces(4))}</td>
                    <td className="text-muted">{brokerName(t.broker_id)}</td>
                    <td className="max-w-48 truncate text-muted">{t.notes}</td>
                    <td className="r">{actions(t)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>

          <Panel flush className="md:hidden">
            {list.map((t) => (
              <div key={t.id} className="flex items-center gap-2 border-b border-border py-1.5 pr-1 pl-3 last:border-b-0">
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-sm"><span className="font-semibold">{ticker(t.asset_id)}</span> <span className="text-muted">{TX_LABEL[t.type]}</span></span>
                    <span className="num text-sm font-medium">{fmtMoney(total(t), t.currency)}</span>
                  </div>
                  <div className="num flex items-baseline justify-between gap-3 text-xs text-muted">
                    <span>{fmtDate(t.date)}</span>
                    <span className="truncate">{fmtQty(t.quantity)} × {fmtPrice(t.unit_price, t.currency)}</span>
                  </div>
                </div>
                {actions(t)}
              </div>
            ))}
          </Panel>
        </>
      )}

      <TradeDialog prefill={trade} onClose={() => setTrade(null)} />

      <Modal open={toDelete != null} onOpenChange={(o) => !o && setToDelete(null)} title="Excluir lançamento">
        {toDelete && (
          <div className="flex flex-col gap-3">
            <p className="m-0 text-sm">
              {TX_LABEL[toDelete.type]} de <span className="num">{fmtQty(toDelete.quantity)}</span> {ticker(toDelete.asset_id)} em <span className="num">{fmtDate(toDelete.date)}</span>.
              Saldo e preço médio são recalculados.{toDelete.dca_execution_id && ' A execução de DCA ligada a ele volta a ficar pendente.'}
            </p>
            <ErrorNote error={remove.error} />
            <div className="flex justify-end gap-2">
              <Button onClick={() => setToDelete(null)}>Cancelar</Button>
              <Button variant="danger" disabled={remove.isPending} onClick={() => remove.mutate(toDelete, { onSuccess: () => setToDelete(null) })}>Excluir</Button>
            </div>
          </div>
        )}
      </Modal>
    </>
  )
}
