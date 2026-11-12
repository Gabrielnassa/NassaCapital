import { Pencil, Plus, Search, Trash2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { z } from 'zod'
import { Button, ErrorNote, Field, Input, Modal, PageHeader, Panel, Segmented, Select } from '../components/ui'
import {
  CLASS_LABEL, CLASS_ORDER, DEFAULT_SETTINGS, addBroker, deleteAsset, deleteBroker, lookupAsset, saveAsset, saveSettings,
  useAssets, useBrokers, useSettings, useWrite, type Asset, type AssetClass, type AssetInput, type Source,
} from '../lib/data'
import { useSession } from '../lib/session'
import { supabase } from '../lib/supabase'
import { applyTheme, type Theme } from '../lib/theme'

const SOURCE_LABEL: Record<Source, string> = { coingecko: 'CoinGecko', brapi: 'B3 (brapi)', manual: 'Manual' }

const assetSchema = z
  .object({
    ticker: z.string().trim().toUpperCase().min(1, 'Informe o ticker.').max(20),
    name: z.string().trim().min(1, 'Informe o nome.'),
    class: z.enum(['crypto', 'stock', 'fii', 'etf', 'stable', 'cash']),
    source: z.enum(['coingecko', 'brapi', 'manual']),
    source_id: z.string().trim(),
    quote_currency: z.enum(['BRL', 'USD']),
  })
  .refine((a) => a.source === 'manual' || a.source_id.length > 0, { path: ['source_id'], message: 'Informe o ID do CoinGecko ou o ticker da B3.' })

function AssetForm(props: { asset: Asset | null; onDone: () => void }) {
  const a = props.asset
  const [f, setF] = useState({
    ticker: a?.ticker ?? '', name: a?.name ?? '', class: a?.class ?? ('crypto' as AssetClass), source: a?.source ?? ('coingecko' as Source),
    source_id: a?.source_id ?? '', quote_currency: a?.quote_currency ?? ('USD' as 'BRL' | 'USD'),
  })
  const [query, setQuery] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const save = useWrite(saveAsset)
  const lookup = useWrite(lookupAsset)
  const set = (patch: Partial<typeof f>) => setF((s) => ({ ...s, ...patch }))

  function changeSource(source: Source) {
    set({ source, ...(source === 'brapi' ? { quote_currency: 'BRL' as const, class: 'stock' as const } : source === 'coingecko' ? { quote_currency: 'USD' as const, class: 'crypto' as const } : {}) })
    lookup.reset()
  }
  function submit(e: FormEvent) {
    e.preventDefault()
    const parsed = assetSchema.safeParse(f)
    if (!parsed.success) return setErrors(Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])))
    setErrors({})
    const input: AssetInput = { ...parsed.data, id: a?.id, source_id: parsed.data.source === 'manual' ? null : parsed.data.source_id }
    save.mutate(input, { onSuccess: props.onDone })
  }

  return (
    <form onSubmit={submit} className="grid grid-cols-2 gap-3" noValidate>
      <Field label="Fonte de preço" className="col-span-2">
        <Segmented aria-label="Fonte de preço" value={f.source} onChange={changeSource} options={(Object.keys(SOURCE_LABEL) as Source[]).map((s) => ({ value: s, label: SOURCE_LABEL[s] }))} />
      </Field>

      {f.source !== 'manual' && (
        <div className="col-span-2 flex flex-col gap-2">
          <Field label={f.source === 'coingecko' ? 'Buscar no CoinGecko' : 'Validar ticker na B3'}>
            <div className="flex gap-2">
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={f.source === 'coingecko' ? 'bitcoin, BTC' : 'PETR4, MXRF11'}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (query.trim()) lookup.mutate({ source: f.source as 'coingecko' | 'brapi', query }) } }} />
              <Button disabled={!query.trim() || lookup.isPending} onClick={() => lookup.mutate({ source: f.source as 'coingecko' | 'brapi', query })}>
                <Search size={16} />{lookup.isPending ? 'Buscando' : 'Buscar'}
              </Button>
            </div>
          </Field>
          {lookup.error && <p className="m-0 text-xs text-down">{lookup.error.message} Você também pode preencher os campos abaixo à mão.</p>}
          {lookup.data?.length === 0 && <p className="m-0 text-xs text-muted">Nada encontrado.</p>}
          {lookup.data && lookup.data.length > 0 && (
            <ul className="m-0 max-h-44 list-none overflow-y-auto rounded-md border border-border p-0">
              {lookup.data.map((r) => (
                <li key={r.source_id} className="border-b border-border last:border-b-0">
                  <button type="button" onClick={() => set({ ticker: r.ticker, name: r.name, source_id: r.source_id })}
                    className={`flex w-full cursor-pointer flex-col border-0 px-2.5 py-1.5 text-left text-sm hover:bg-sunken ${f.source_id === r.source_id ? 'bg-accent-soft' : 'bg-transparent'}`}>
                    <span><span className="font-semibold">{r.ticker}</span> <span className="text-muted">{r.name}</span></span>
                    <span className="text-xs text-muted">{r.detail}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <Field label="Ticker" error={errors.ticker}><Input value={f.ticker} onChange={(e) => set({ ticker: e.target.value.toUpperCase() })} /></Field>
      <Field label="Nome" error={errors.name}><Input value={f.name} onChange={(e) => set({ name: e.target.value })} /></Field>
      {f.source !== 'manual' && (
        <Field label={f.source === 'coingecko' ? 'ID no CoinGecko' : 'Ticker na B3'} className="col-span-2" error={errors.source_id}
          hint={f.source === 'coingecko' ? 'Sempre o ID (ex.: avalanche-2), nunca só o ticker: existem tokens falsos com o mesmo ticker.' : undefined}>
          <Input className="num" value={f.source_id} onChange={(e) => set({ source_id: e.target.value })} />
        </Field>
      )}
      <Field label="Classe">
        <Select aria-label="Classe" value={f.class} onChange={(v) => set({ class: v as AssetClass })} options={CLASS_ORDER.map((c) => ({ value: c, label: CLASS_LABEL[c] }))} />
      </Field>
      <Field label="Moeda de cotação">
        <Segmented aria-label="Moeda de cotação" value={f.quote_currency} onChange={(v) => set({ quote_currency: v })} options={[{ value: 'USD', label: 'US$' }, { value: 'BRL', label: 'R$' }]} />
      </Field>

      <div className="col-span-2"><ErrorNote error={save.error} /></div>
      <div className="col-span-2 flex justify-end gap-2">
        <Button onClick={props.onDone}>Cancelar</Button>
        <Button type="submit" variant="primary" disabled={save.isPending}>{a ? 'Salvar' : 'Adicionar ativo'}</Button>
      </div>
    </form>
  )
}

export function Ajustes() {
  const assets = useAssets()
  const brokers = useBrokers()
  const settings = useSettings()
  const session = useSession()
  const removeAsset = useWrite(deleteAsset)
  const newBroker = useWrite(addBroker)
  const removeBroker = useWrite(deleteBroker)
  const savePrefs = useWrite(saveSettings)
  const [assetDialog, setAssetDialog] = useState<{ asset: Asset | null } | null>(null)
  const [brokerName, setBrokerName] = useState('')

  if (assets.error) return <ErrorNote error={assets.error} />
  const prefs = settings.data ?? DEFAULT_SETTINGS

  return (
    <>
      <PageHeader title="Ajustes" />
      <div className="flex flex-col gap-4">
        <Panel flush title="Ativos" action={<Button size="sm" onClick={() => setAssetDialog({ asset: null })}><Plus size={16} />Adicionar</Button>}>
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead><tr><th>Ticker</th><th className="max-md:hidden">Nome</th><th>Classe</th><th className="max-md:hidden">Fonte</th><th>ID na fonte</th><th className="max-md:hidden">Moeda</th><th /></tr></thead>
              <tbody>
                {(assets.data ?? []).map((a) => (
                  <tr key={a.id} className="row">
                    <td className="font-semibold">{a.ticker}</td>
                    <td className="text-muted max-md:hidden">{a.name}</td>
                    <td>{CLASS_LABEL[a.class]}</td>
                    <td className="max-md:hidden">{SOURCE_LABEL[a.source]}</td>
                    <td className="num text-muted">{a.source_id ?? '—'}</td>
                    <td className="max-md:hidden">{a.quote_currency === 'USD' ? 'US$' : 'R$'}</td>
                    <td className="r">
                      <span className="inline-flex gap-1">
                        <Button size="sm" variant="ghost" aria-label={`Editar ${a.ticker}`} onClick={() => setAssetDialog({ asset: a })}><Pencil size={16} /></Button>
                        <Button size="sm" variant="ghost" aria-label={`Excluir ${a.ticker}`} disabled={removeAsset.isPending} onClick={() => removeAsset.mutate(a.id)}><Trash2 size={16} /></Button>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {removeAsset.error && <div className="border-t border-border p-3"><ErrorNote error={removeAsset.error} /></div>}
        </Panel>

        <div className="grid gap-4 md:grid-cols-2">
          <Panel flush title="Corretoras">
            <ul className="m-0 list-none p-0">
              {(brokers.data ?? []).map((b) => (
                <li key={b.id} className="flex h-9 items-center justify-between border-b border-border pr-1 pl-3 text-sm">
                  {b.name}
                  <Button size="sm" variant="ghost" aria-label={`Excluir ${b.name}`} onClick={() => removeBroker.mutate(b.id)}><Trash2 size={16} /></Button>
                </li>
              ))}
            </ul>
            <form className="flex gap-2 p-3" onSubmit={(e) => { e.preventDefault(); if (brokerName.trim()) newBroker.mutate(brokerName, { onSuccess: () => setBrokerName('') }) }}>
              <Input aria-label="Nome da corretora" value={brokerName} onChange={(e) => setBrokerName(e.target.value)} placeholder="Nova corretora" />
              <Button type="submit" disabled={!brokerName.trim() || newBroker.isPending}>Adicionar</Button>
            </form>
            {newBroker.error && <div className="px-3 pb-3"><ErrorNote error={newBroker.error} /></div>}
          </Panel>

          <Panel title="Preferências">
            <div className="flex flex-col gap-3">
              <Field label="Moeda principal">
                <Segmented aria-label="Moeda principal" value={prefs.main_currency} onChange={(v) => savePrefs.mutate({ main_currency: v })} options={[{ value: 'BRL', label: 'Real (R$)' }, { value: 'USD', label: 'Dólar (US$)' }]} />
              </Field>
              <Field label="Tema">
                <Segmented aria-label="Tema" value={prefs.theme}
                  onChange={(v: Theme) => { applyTheme(v); savePrefs.mutate({ theme: v }) }}
                  options={[{ value: 'system', label: 'Do aparelho' }, { value: 'light', label: 'Claro' }, { value: 'dark', label: 'Escuro' }]} />
              </Field>
              <ErrorNote error={savePrefs.error} />
              <div className="flex items-center justify-between gap-3 border-t border-border pt-3 text-sm">
                <span className="truncate text-muted">{session?.user.email}</span>
                <Button onClick={() => supabase.auth.signOut()}>Sair</Button>
              </div>
            </div>
          </Panel>
        </div>
      </div>

      <Modal open={assetDialog != null} onOpenChange={(o) => !o && setAssetDialog(null)} title={assetDialog?.asset ? `Editar ${assetDialog.asset.ticker}` : 'Adicionar ativo'}>
        {assetDialog && <AssetForm asset={assetDialog.asset} onDone={() => setAssetDialog(null)} />}
      </Modal>
    </>
  )
}
