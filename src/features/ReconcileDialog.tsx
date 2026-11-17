import { useMemo, useState } from 'react'
import { Button, ErrorNote, Field, Modal, NumberInput, Segmented } from '../components/ui'
import { reconcile } from '../lib/calc/reconcile'
import { D, type Dec } from '../lib/calc/money'
import { saveAdjustments, useWrite, type Position } from '../lib/data'
import { fmtQty, parseNumberBR, todayISO } from '../lib/format'

/**
 * Conferir com a corretora: o dono digita a quantidade que a corretora mostra e o app lança a
 * diferença como ajuste sem custo. Campo vazio = não conferir (ex.: ativo guardado em outra carteira).
 */
export function ReconcileDialog(props: { open: boolean; onClose: () => void; positions: Position[] }) {
  const [raw, setRaw] = useState<Record<string, string>>({})
  const [positiveAs, setPositiveAs] = useState<'reward' | 'transfer_in'>('reward')
  const save = useWrite(saveAdjustments)
  const list = props.positions.filter((p) => p.class !== 'cash' && (p.quantity.gt(0) || raw[p.asset_id]))
  const fx = props.positions.find((p) => p.usd_brl)?.usd_brl ?? null

  const parsed = useMemo(() => {
    const map = new Map<string, Dec>()
    const bad = new Set<string>()
    for (const [id, v] of Object.entries(raw)) {
      if (!v.trim()) continue
      const n = parseNumberBR(v)
      if (n == null) bad.add(id)
      else map.set(id, D(n))
    }
    return { map, bad }
  }, [raw])
  const adjustments = reconcile(props.positions.map((p) => ({ id: p.asset_id, quantity: p.quantity })), parsed.map)
  const diffOf = (id: string) => adjustments.find((a) => a.id === id)?.diff

  const close = () => {
    setRaw({})
    save.reset()
    props.onClose()
  }

  return (
    <Modal open={props.open} onOpenChange={(o) => !o && close()} title="Conferir com a corretora">
      <p className="mt-0 mb-3 text-sm text-muted">
        Digite a quantidade que a corretora mostra. A diferença entra sem custo. Deixe em branco o que não quer conferir.
      </p>
      <Field label="Saldo a mais na corretora é" className="mb-3" hint={positiveAs === 'reward' ? 'Rendimentos do Earn: aparecem em "Rendimentos recebidos".' : 'Correção: não conta como rendimento.'}>
        <Segmented aria-label="Saldo a mais na corretora é" value={positiveAs} onChange={setPositiveAs}
          options={[{ value: 'reward', label: 'Rendimento' }, { value: 'transfer_in', label: 'Correção' }]} />
      </Field>
      <table className="tbl">
        <thead><tr><th>Ativo</th><th className="r max-sm:hidden">No app</th><th className="r">Na corretora</th><th className="r">Diferença</th></tr></thead>
        <tbody>
          {list.map((p) => {
            const diff = diffOf(p.asset_id)
            return (
              <tr key={p.asset_id}>
                <td className="py-1">
                  <div className="font-semibold">{p.ticker}</div>
                  <div className="num text-xs text-muted sm:hidden">{fmtQty(p.quantity)}</div>
                </td>
                <td className="r num text-muted max-sm:hidden">{fmtQty(p.quantity)}</td>
                <td className="r">
                  <NumberInput aria-label={`Quantidade de ${p.ticker} na corretora`} className="h-7 w-36 max-sm:w-32" aria-invalid={parsed.bad.has(p.asset_id)}
                    value={raw[p.asset_id] ?? ''} onChange={(e) => setRaw((r) => ({ ...r, [p.asset_id]: e.target.value }))} placeholder="—" />
                </td>
                <td className="r num">{diff ? <span className={`num ${diff.gt(0) ? 'text-up' : 'text-down'}`}>{diff.gt(0) ? '+' : '−'}{fmtQty(diff.abs())}</span> : raw[p.asset_id]?.trim() && !parsed.bad.has(p.asset_id) ? <span className="text-muted">confere</span> : ''}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <div className="mt-3 flex flex-col gap-3">
        <ErrorNote error={save.error} />
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-muted">{adjustments.length ? `${adjustments.length} ajuste${adjustments.length > 1 ? 's' : ''} a lançar` : ''}</span>
          <div className="flex gap-2">
            <Button onClick={close}>Cancelar</Button>
            <Button variant="primary" disabled={!adjustments.length || parsed.bad.size > 0 || !fx || save.isPending}
              onClick={() => save.mutate({ items: adjustments.map((a) => ({ asset_id: a.id, diff: a.diff })), fx_rate_to_brl: fx!.toFixed(), date: todayISO(), positiveAs }, { onSuccess: close })}>
              Lançar ajustes
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  )
}
