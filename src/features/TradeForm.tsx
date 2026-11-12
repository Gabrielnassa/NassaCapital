import { useMemo, useState, type FormEvent } from 'react'
import { z } from 'zod'
import { Button, ErrorNote, Field, Input, Modal, NumberInput, Segmented, Select } from '../components/ui'
import { convert, D, type Ccy, type Dec } from '../lib/calc/money'
import { TX_LABEL, saveTransaction, useAssets, useBrokers, usePositions, useWrite, type Asset, type Position, type Transaction, type TxType } from '../lib/data'
import { fmtMoney, parseNumberBR, todayISO } from '../lib/format'

export interface TradePrefill {
  /** edição de um lançamento existente */
  tx?: Transaction
  assetId?: string
  /** valor previsto da compra (execução de DCA) */
  amount?: Dec
  amountCcy?: Ccy
  executionId?: string
  fundingAssetId?: string | null
}

const NONE = 'none'
const toInput = (d: Dec, places?: number) => (places == null ? d.toFixed() : d.toDecimalPlaces(places).toFixed()).replace('.', ',')

const number = (rule: 'positive' | 'zeroOrMore', message: string) =>
  z.string().transform((s, ctx) => {
    const n = parseNumberBR(s)
    if (n == null || (rule === 'positive' && !D(n).gt(0))) {
      ctx.addIssue({ code: 'custom', message })
      return z.NEVER
    }
    return n
  })

const formSchema = z.object({
  asset_id: z.string().min(1, 'Escolha o ativo.'),
  type: z.enum(['buy', 'sell', 'transfer_in', 'transfer_out']),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Informe a data.'),
  quantity: number('positive', 'Quantidade maior que zero.'),
  unit_price: number('zeroOrMore', 'Preço inválido.'),
  fee: number('zeroOrMore', 'Taxa inválida.'),
  currency: z.enum(['BRL', 'USD']),
  fx_rate_to_brl: number('positive', 'Informe o câmbio do dia.'),
})

type FormState = { [K in keyof z.input<typeof formSchema>]: string } & { broker_id: string; notes: string; debit: string }

function initialState(prefill: TradePrefill, assets: Asset[], positions: Position[]): FormState {
  const fx = positions.find((p) => p.usd_brl)?.usd_brl ?? null
  if (prefill.tx) {
    const t = prefill.tx
    return {
      asset_id: t.asset_id, type: t.type, date: t.date, quantity: toInput(t.quantity), unit_price: toInput(t.unit_price),
      fee: toInput(t.fee), currency: t.currency, fx_rate_to_brl: toInput(t.fx_rate_to_brl),
      broker_id: t.broker_id ?? NONE, notes: t.notes ?? '', debit: NONE,
    }
  }
  const asset = assets.find((a) => a.id === prefill.assetId)
  const pos = positions.find((p) => p.asset_id === prefill.assetId)
  const currency: Ccy = prefill.amountCcy ?? asset?.quote_currency ?? 'USD'
  const price = pos?.price && fx ? convert(pos.price, pos.quote_currency, currency, fx) : (pos?.price ?? null)
  const quantity = prefill.amount && price?.gt(0) ? prefill.amount.div(price) : null
  return {
    asset_id: prefill.assetId ?? '', type: 'buy', date: todayISO(),
    quantity: quantity ? toInput(quantity, 8) : '', unit_price: price ? toInput(price, 8) : '',
    fee: '0', currency, fx_rate_to_brl: fx ? toInput(fx, 4) : '',
    broker_id: NONE, notes: '', debit: prefill.fundingAssetId ?? NONE,
  }
}

function Form(props: { prefill: TradePrefill; assets: Asset[]; positions: Position[]; onDone: () => void }) {
  const { prefill, assets, positions } = props
  const brokers = useBrokers()
  const [f, setF] = useState<FormState>(() => initialState(prefill, assets, positions))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const save = useWrite(saveTransaction)
  const set = (patch: Partial<FormState>) => setF((s) => ({ ...s, ...patch }))
  const isNew = !prefill.tx

  const total = useMemo(() => {
    const q = parseNumberBR(f.quantity), p = parseNumberBR(f.unit_price), fee = parseNumberBR(f.fee), fx = parseNumberBR(f.fx_rate_to_brl)
    if (!q || !p || !fee) return null
    const inCcy = D(q).times(p).plus(fee)
    const ccy = f.currency as Ccy
    const other: Ccy = ccy === 'USD' ? 'BRL' : 'USD'
    return { inCcy, ccy, other, inOther: fx && D(fx).gt(0) ? convert(inCcy, ccy, other, D(fx)) : null, fx: fx ? D(fx) : null }
  }, [f.quantity, f.unit_price, f.fee, f.fx_rate_to_brl, f.currency])

  const fundingOptions = assets.filter((a) => (a.class === 'cash' || a.class === 'stable') && a.id !== f.asset_id)
  const funding = fundingOptions.find((a) => a.id === f.debit)
  const debitQty = funding && total?.fx?.gt(0) ? convert(total.inCcy, total.ccy, funding.quote_currency, total.fx) : null
  const canDebit = isNew && f.type === 'buy' && fundingOptions.length > 0

  function changeAsset(id: string) {
    const asset = assets.find((a) => a.id === id)
    const pos = positions.find((p) => p.asset_id === id)
    set({
      asset_id: id,
      ...(isNew && asset ? { currency: asset.quote_currency, unit_price: pos?.price ? toInput(pos.price, 8) : '' } : {}),
      ...(f.debit === id ? { debit: NONE } : {}),
    })
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    const parsed = formSchema.safeParse(f)
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])))
      return
    }
    setErrors({})
    save.mutate(
      {
        tx: { id: prefill.tx?.id, ...parsed.data, broker_id: f.broker_id === NONE ? null : f.broker_id, notes: f.notes.trim() || null },
        debit: canDebit && funding && debitQty ? { asset_id: funding.id, quantity: debitQty.toDecimalPlaces(8).toFixed(), currency: funding.quote_currency } : null,
        executionId: prefill.executionId,
      },
      { onSuccess: props.onDone },
    )
  }

  return (
    <form onSubmit={submit} className="grid grid-cols-2 gap-3" noValidate>
      <Field label="Ativo" error={errors.asset_id}>
        <Select aria-label="Ativo" value={f.asset_id} onChange={changeAsset} options={assets.map((a) => ({ value: a.id, label: a.ticker }))} />
      </Field>
      <Field label="Tipo">
        <Select aria-label="Tipo" value={f.type} onChange={(v) => set({ type: v })} options={(Object.keys(TX_LABEL) as TxType[]).map((t) => ({ value: t, label: TX_LABEL[t] }))} />
      </Field>
      <Field label="Quantidade" error={errors.quantity}>
        <NumberInput value={f.quantity} onChange={(e) => set({ quantity: e.target.value })} placeholder="0,00" />
      </Field>
      <Field label={`Preço unitário (${f.currency === 'USD' ? 'US$' : 'R$'})`} error={errors.unit_price}>
        <NumberInput value={f.unit_price} onChange={(e) => set({ unit_price: e.target.value })} placeholder="0,00" />
      </Field>
      <Field label="Moeda">
        <Segmented aria-label="Moeda" value={f.currency as Ccy} onChange={(v) => set({ currency: v })} options={[{ value: 'USD', label: 'US$' }, { value: 'BRL', label: 'R$' }]} />
      </Field>
      <Field label="Taxa" error={errors.fee}>
        <NumberInput value={f.fee} onChange={(e) => set({ fee: e.target.value })} />
      </Field>
      <Field label="Data" error={errors.date}>
        <Input type="date" className="num" value={f.date} onChange={(e) => set({ date: e.target.value })} />
      </Field>
      <Field label="Câmbio do dia (R$ por US$ 1)" error={errors.fx_rate_to_brl}>
        <NumberInput value={f.fx_rate_to_brl} onChange={(e) => set({ fx_rate_to_brl: e.target.value })} placeholder="5,05" />
      </Field>
      <Field label="Corretora" className={canDebit ? '' : 'col-span-2'}>
        <Select aria-label="Corretora" value={f.broker_id} onChange={(v) => set({ broker_id: v })}
          options={[{ value: NONE, label: 'Sem corretora' }, ...(brokers.data ?? []).map((b) => ({ value: b.id, label: b.name }))]} />
      </Field>
      {canDebit && (
        <Field label="Pagar com">
          <Select aria-label="Pagar com" value={f.debit} onChange={(v) => set({ debit: v })}
            options={[{ value: NONE, label: 'Não debitar' }, ...fundingOptions.map((a) => ({ value: a.id, label: a.ticker }))]} />
        </Field>
      )}
      <Field label="Notas" className="col-span-2">
        <Input value={f.notes} onChange={(e) => set({ notes: e.target.value })} />
      </Field>

      <div className="col-span-2 flex flex-col gap-0.5 border-t border-border pt-3 text-sm">
        <div className="flex justify-between">
          <span className="text-muted">Total com taxa</span>
          <span className="num font-medium">{total ? fmtMoney(total.inCcy, total.ccy) : '—'}</span>
        </div>
        <div className="flex justify-between text-muted">
          <span>{total?.other === 'BRL' ? 'Em reais' : 'Em dólares'}</span>
          <span className="num">{total?.inOther ? fmtMoney(total.inOther, total.other) : '—'}</span>
        </div>
        {canDebit && funding && debitQty && (
          <div className="flex justify-between text-muted">
            <span>Sai de {funding.ticker}</span>
            <span className="num">{fmtMoney(debitQty, funding.quote_currency)}</span>
          </div>
        )}
      </div>

      <div className="col-span-2">
        <ErrorNote error={save.error} />
      </div>
      <div className="col-span-2 flex justify-end gap-2">
        <Button onClick={props.onDone}>Cancelar</Button>
        <Button type="submit" variant="primary" disabled={save.isPending}>
          {isNew ? (f.type === 'buy' ? 'Registrar compra' : 'Registrar') : 'Salvar'}
        </Button>
      </div>
    </form>
  )
}

/** Formulário de lançamento. Para execução de DCA, abre já preenchido; o dono confirma ou corrige. */
export function TradeDialog(props: { prefill: TradePrefill | null; onClose: () => void }) {
  const assets = useAssets()
  const positions = usePositions()
  const title = props.prefill?.tx ? 'Editar lançamento' : props.prefill?.executionId ? 'Registrar compra' : 'Novo lançamento'
  return (
    <Modal open={props.prefill != null} onOpenChange={(o) => !o && props.onClose()} title={title}>
      {props.prefill && assets.data && positions.data ? (
        <Form prefill={props.prefill} assets={assets.data} positions={positions.data} onDone={props.onClose} />
      ) : (
        <p className="m-0 text-sm text-muted">Carregando</p>
      )}
    </Modal>
  )
}
