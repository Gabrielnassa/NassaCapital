import { useMemo, useState, type FormEvent } from 'react'
import { z } from 'zod'
import { Button, ErrorNote, Field, Input, Modal, NumberInput, Segmented, Select } from '../components/ui'
import { convert, D, type Ccy, type Dec } from '../lib/calc/money'
import { TX_LABEL, saveTransaction, useAssets, useBrokers, useWrite, type Asset, type Position, type Transaction, type TxType } from '../lib/data'
import { fmtMoney, fmtPrice, fmtQty, parseNumberBR, todayISO } from '../lib/format'
import { usePortfolio } from '../lib/live-context'

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

// O formulário pede o que o comprovante da corretora mostra: quanto saiu e quanto entrou.
// O preço unitário é sempre calculado (total ÷ quantidade), nunca digitado.
const formSchema = z.object({
  asset_id: z.string().min(1, 'Escolha o ativo.'),
  type: z.enum(['buy', 'sell', 'transfer_in', 'transfer_out']),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Informe a data.'),
  quantity: number('positive', 'Informe a quantidade do comprovante.'),
  total: number('zeroOrMore', 'Informe o valor do comprovante.'),
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
      asset_id: t.asset_id, type: t.type, date: t.date, quantity: toInput(t.quantity), total: toInput(t.quantity.times(t.unit_price), 8),
      fee: toInput(t.fee), currency: t.currency, fx_rate_to_brl: toInput(t.fx_rate_to_brl),
      broker_id: t.broker_id ?? NONE, notes: t.notes ?? '', debit: NONE,
    }
  }
  const asset = assets.find((a) => a.id === prefill.assetId)
  return {
    asset_id: prefill.assetId ?? '', type: 'buy', date: todayISO(),
    // A quantidade fica em branco de propósito: quem informa é o comprovante, não a estimativa.
    quantity: '', total: prefill.amount ? prefill.amount.toFixed(2).replace('.', ',') : '',
    fee: '0', currency: prefill.amountCcy ?? asset?.quote_currency ?? 'USD', fx_rate_to_brl: fx ? toInput(fx, 4) : '',
    broker_id: NONE, notes: '', debit: prefill.fundingAssetId ?? NONE,
  }
}

function Form(props: { prefill: TradePrefill; assets: Asset[]; positions: Position[]; onDone: () => void }) {
  const { prefill, assets, positions } = props
  const brokers = useBrokers()
  const [f, setF] = useState<FormState>(() => initialState(prefill, assets, positions))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const save = useWrite(saveTransaction)
  // Ao mexer num campo, o erro dele some.
  const set = (patch: Partial<FormState>) => {
    setF((s) => ({ ...s, ...patch }))
    setErrors((e) => Object.fromEntries(Object.entries(e).filter(([k]) => !(k in patch))))
  }
  const isNew = !prefill.tx
  const ccy = f.currency as Ccy
  const incoming = f.type === 'buy' || f.type === 'transfer_in'

  const calc = useMemo(() => {
    const q = parseNumberBR(f.quantity), t = parseNumberBR(f.total), fee = parseNumberBR(f.fee), fx = parseNumberBR(f.fx_rate_to_brl)
    const total = t ? D(t) : null
    const withFee = total && fee ? total.plus(fee) : null
    const other: Ccy = ccy === 'USD' ? 'BRL' : 'USD'
    const rate = fx && D(fx).gt(0) ? D(fx) : null
    return {
      unitPrice: q && total && D(q).gt(0) ? total.div(q) : null,
      withFee, other, rate,
      inOther: withFee && rate ? convert(withFee, ccy, other, rate) : null,
    }
  }, [f.quantity, f.total, f.fee, f.fx_rate_to_brl, ccy])

  // Estimativa pelo preço atual, só como referência para conferir o comprovante.
  const estimate = useMemo(() => {
    const pos = positions.find((p) => p.asset_id === f.asset_id)
    const t = parseNumberBR(f.total)
    if (!pos?.price?.gt(0) || !t || !calc.rate) return null
    return convert(D(t), ccy, pos.quote_currency, calc.rate).div(pos.price)
  }, [positions, f.asset_id, f.total, ccy, calc.rate])

  const fundingOptions = assets.filter((a) => (a.class === 'cash' || a.class === 'stable') && a.id !== f.asset_id)
  const funding = fundingOptions.find((a) => a.id === f.debit)
  const debitQty = funding && calc.withFee && calc.rate ? convert(calc.withFee, ccy, funding.quote_currency, calc.rate) : null
  const canDebit = isNew && f.type === 'buy' && fundingOptions.length > 0

  function changeAsset(id: string) {
    const asset = assets.find((a) => a.id === id)
    set({ asset_id: id, ...(isNew && asset && !prefill.amount ? { currency: asset.quote_currency } : {}), ...(f.debit === id ? { debit: NONE } : {}) })
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    const parsed = formSchema.safeParse(f)
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])))
      return
    }
    setErrors({})
    const { total, ...fields } = parsed.data
    save.mutate(
      {
        tx: {
          id: prefill.tx?.id, ...fields,
          unit_price: D(total).div(fields.quantity).toDecimalPlaces(12).toFixed(),
          broker_id: f.broker_id === NONE ? null : f.broker_id, notes: f.notes.trim() || null,
        },
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
      <Field label={`${incoming ? 'Total pago' : 'Total recebido'} (${ccy === 'USD' ? 'US$' : 'R$'})`} error={errors.total}>
        <NumberInput value={f.total} onChange={(e) => set({ total: e.target.value })} placeholder="0,00" />
      </Field>
      <Field label={incoming ? 'Quantidade recebida' : 'Quantidade vendida'} error={errors.quantity}
        hint={estimate ? `Estimativa pelo preço atual: ${fmtQty(estimate.toDecimalPlaces(8))}` : 'Como aparece no comprovante.'}>
        <NumberInput value={f.quantity} onChange={(e) => set({ quantity: e.target.value })} placeholder="0,00000000" autoFocus={isNew && !!prefill.amount} />
      </Field>
      <Field label="Moeda">
        <Segmented aria-label="Moeda" value={ccy} onChange={(v) => set({ currency: v })} options={[{ value: 'USD', label: 'US$' }, { value: 'BRL', label: 'R$' }]} />
      </Field>
      <Field label="Taxa à parte" error={errors.fee} hint="Só se foi cobrada fora do total.">
        <NumberInput value={f.fee} onChange={(e) => set({ fee: e.target.value })} />
      </Field>
      <Field label="Data" error={errors.date}>
        <Input type="date" className="num" value={f.date} onChange={(e) => set({ date: e.target.value })} />
      </Field>
      <Field label="Câmbio do dia (R$ por US$ 1)" error={errors.fx_rate_to_brl}>
        <NumberInput value={f.fx_rate_to_brl} onChange={(e) => set({ fx_rate_to_brl: e.target.value })} placeholder="5,60" />
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
          <span className="text-muted">Preço unitário</span>
          <span className="num font-medium">{calc.unitPrice ? fmtPrice(calc.unitPrice, ccy) : '—'}</span>
        </div>
        <div className="flex justify-between text-muted">
          <span>{calc.other === 'BRL' ? 'Total em reais' : 'Total em dólares'}</span>
          <span className="num">{calc.inOther ? fmtMoney(calc.inOther, calc.other) : '—'}</span>
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

/** Formulário de lançamento. Para execução de DCA, abre com o valor previsto; a quantidade vem do comprovante. */
export function TradeDialog(props: { prefill: TradePrefill | null; onClose: () => void }) {
  const assets = useAssets()
  const positions = { data: usePortfolio().positions }
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
