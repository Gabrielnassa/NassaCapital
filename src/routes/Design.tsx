import { Plus, Trash2 } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Badge, Button, Delta, EmptyState, ErrorNote, Field, Input, Modal, NumberInput, Panel, Popover, ProgressBar, SegmentBar, Segmented, Select, Stats, Tabs, TargetBar } from '../components/ui'
import { D } from '../lib/calc/money'
import { fmtMoney, fmtPct, fmtPrice, fmtQty } from '../lib/format'
import { applyTheme } from '../lib/theme'

const COLORS = [
  ['bg', 'Fundo'], ['surface', 'Superfície'], ['sunken', 'Rebaixado'], ['border', 'Borda'], ['border-strong', 'Borda forte'],
  ['text', 'Texto'], ['muted', 'Texto secundário'], ['faint', 'Texto apagado'],
  ['accent', 'Destaque'], ['accent-soft', 'Destaque suave'], ['up', 'Alta'], ['down', 'Baixa'], ['warn', 'Aviso'],
]

const SAMPLE = [
  { t: 'BTC', q: '0.00724287', pm: '73785.67', p: '75120.40', v: '2747.78', pl: '1.81', cur: '19.9', meta: '50' },
  { t: 'SOL', q: '4.18749155', pm: '82.76', p: '79.10', v: '1672.71', pl: '-4.42', cur: '12.9', meta: '8' },
  { t: 'AVAX', q: '16.37707821', pm: '8.46', p: '8.46', v: '700.08', pl: '0', cur: '5.2', meta: null },
]

function Section(props: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="border-b border-border pb-1.5 text-sm font-semibold text-muted">{props.title}</h2>
      {props.children}
    </section>
  )
}

/** Vitrine dos tokens e componentes, nos temas claro e escuro. Serve para aprovar o visual antes das telas. */
export function Design() {
  const [theme, setTheme] = useState<'light' | 'dark'>(document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light')
  const [select, setSelect] = useState('btc')
  const [seg, setSeg] = useState<'BRL' | 'USD'>('BRL')
  const [tab, setTab] = useState('a')
  const [modal, setModal] = useState(false)

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-8 px-4 py-6">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl">Design</h1>
          <p className="m-0 text-sm text-muted">Tokens e componentes da Carteira.</p>
        </div>
        <Segmented aria-label="Tema" value={theme} onChange={(v) => { setTheme(v); applyTheme(v) }} options={[{ value: 'light', label: 'Claro' }, { value: 'dark', label: 'Escuro' }]} />
      </header>

      <Section title="Cores">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {COLORS.map(([token, label]) => (
            <div key={token} className="flex items-center gap-2 rounded-md border border-border bg-surface p-2">
              <div className="size-8 shrink-0 rounded-sm border border-border-strong" style={{ background: `var(--${token})` }} />
              <div className="min-w-0">
                <div className="truncate text-sm">{label}</div>
                <div className="num text-xs text-muted">--{token}</div>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Tipografia">
        <div className="flex flex-col gap-1.5">
          <div className="text-xl font-semibold">Título de página · IBM Plex Sans 600, 20px</div>
          <div className="text-base font-semibold">Título de painel · 600, 16px</div>
          <div className="text-sm">Texto · 400, 13 a 14px. Comprar hoje, falta para a meta, preço médio.</div>
          <div className="text-xs text-muted">Legenda e cabeçalho de tabela · 500, 12px</div>
          <div className="num text-2xl font-medium">{fmtMoney(D('13548.13'), 'BRL')}</div>
          <div className="num text-sm">IBM Plex Mono, algarismos tabulares: {fmtMoney(D('2682.60'), 'USD')} · {fmtPct(D('12.5'))} · {fmtQty(D('0.00724287'))}</div>
        </div>
      </Section>

      <Section title="Botões">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary">Registrar compra</Button>
          <Button>Cancelar</Button>
          <Button variant="ghost">Fantasma</Button>
          <Button variant="danger">Excluir</Button>
          <Button variant="primary" disabled>Desativado</Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="primary">Registrar</Button>
          <Button size="sm"><Plus size={16} />Adicionar</Button>
          <Button size="sm" variant="ghost" aria-label="Excluir"><Trash2 size={16} /></Button>
        </div>
      </Section>

      <Section title="Campos">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="Texto"><Input placeholder="Nome do plano" /></Field>
          <Field label="Número" hint="Aceita 1.234,56"><NumberInput defaultValue="1.234,56" /></Field>
          <Field label="Com erro" error="Quantidade maior que zero."><NumberInput defaultValue="0" aria-invalid /></Field>
          <Field label="Seleção">
            <Select aria-label="Ativo" value={select} onChange={setSelect} options={[{ value: 'btc', label: 'BTC' }, { value: 'eth', label: 'ETH' }, { value: 'sol', label: 'SOL' }]} />
          </Field>
        </div>
        <div><Segmented aria-label="Moeda" value={seg} onChange={setSeg} options={[{ value: 'BRL', label: 'R$' }, { value: 'USD', label: 'US$' }]} /></div>
      </Section>

      <Section title="Números-chave e composição">
        <Stats items={[
          { label: 'Patrimônio', value: fmtMoney(D('14060.13'), 'BRL'), sub: fmtMoney(D('2517.93'), 'USD') },
          { label: 'Custo', value: fmtMoney(D('14068.02'), 'BRL'), sub: 'pelo preço médio' },
          { label: 'Lucro ou prejuízo', value: <Delta value={D('-7.89')} ccy="BRL" />, sub: <Delta value={D('-0.06')} /> },
          { label: 'Hoje', value: <Delta value={D('184.2')} ccy="BRL" />, sub: <Delta value={D('1.33')} /> },
        ]} />
        <SegmentBar aria-label="Composição da carteira" segments={[
          { label: 'Bitcoin', pct: D('22.2') }, { label: 'Altcoins', pct: D('23.5') }, { label: 'Stablecoins', pct: D('44.3') },
          { label: 'Ações', pct: D('6') }, { label: 'Caixa', pct: D('4'), muted: true },
        ]} />
      </Section>

      <Section title="Tabela">
        <Panel flush className="overflow-x-auto">
          <table className="tbl">
            <thead><tr><th>Ativo</th><th className="r">Qtd</th><th className="r">Preço médio</th><th className="r">Preço</th><th className="r">Valor R$</th><th className="r">L/P %</th><th className="r">% atual</th><th className="r">% meta</th></tr></thead>
            <tbody>
              <tr><td className="group" colSpan={8}>Cripto</td></tr>
              <tr className="nested"><td className="subgroup" colSpan={8}>Altcoins</td></tr>
              {SAMPLE.map((r) => (
                <tr key={r.t} className="row">
                  <td className="font-semibold">{r.t}</td>
                  <td className="r num">{fmtQty(D(r.q))}</td>
                  <td className="r num">{fmtPrice(D(r.pm), 'USD')}</td>
                  <td className="r num">{fmtPrice(D(r.p), 'USD')}</td>
                  <td className="r num">{fmtMoney(D(r.v), 'BRL')}</td>
                  <td className="r"><Delta value={D(r.pl)} /></td>
                  <td className="r num">{fmtPct(D(r.cur))}</td>
                  <td className="r">{r.meta ? <span className="num">{fmtPct(D(r.meta))}</span> : <Badge>fora da meta</Badge>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      </Section>

      <Section title="Alta, baixa e selos">
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <Delta value={D('2.35')} />
          <Delta value={D('-1.2')} />
          <Delta value={D(0)} />
          <Delta value={D('184.2')} ccy="BRL" />
          <Delta value={D('-52.1')} ccy="USD" />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge>fora da meta</Badge><Badge tone="accent">Ativo</Badge><Badge tone="up">Feita</Badge><Badge tone="down">Atrasada</Badge><Badge tone="warn">Pausado</Badge>
        </div>
      </Section>

      <Section title="Barra de meta">
        <div className="grid grid-cols-[48px_1fr_150px] items-center gap-x-3 gap-y-2 text-sm">
          <span className="font-semibold">BTC</span><TargetBar current={D('19.9')} target={D(50)} max={D(55)} /><span className="num text-right text-muted">19,9% de 50,0%</span>
          <span className="font-semibold">SOL</span><TargetBar current={D('12.9')} target={D(8)} max={D(55)} /><span className="num text-right text-muted">12,9% de 8,0%</span>
          <span className="font-semibold">AVAX</span><TargetBar current={D('5.2')} target={null} max={D(55)} /><span className="num text-right text-muted">5,2% fora da meta</span>
        </div>
        <p className="m-0 text-xs text-muted">Preenchimento = % atual. Traço = meta. Cinza = fora da meta.</p>
        <ProgressBar value={D(215)} total={D(1062)} label="Executado do plano" />
      </Section>

      <Section title="Abas, painéis e estados">
        <Tabs value={tab} onChange={setTab} tabs={[
          { value: 'a', label: 'Por ativo', content: <p className="m-0 text-sm text-muted">Conteúdo da aba.</p> },
          { value: 'b', label: 'Por classe', content: <p className="m-0 text-sm text-muted">Outra aba.</p> },
        ]} />
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setModal(true)}>Abrir diálogo</Button>
          <Popover trigger={<Button>Abrir popover</Button>}><p className="m-0 text-muted">Painel pequeno, com borda de 1px e sombra mínima.</p></Popover>
        </div>
        <Panel flush title="Estado vazio"><EmptyState text="Nenhum lançamento." action={<Button variant="primary">Registrar compra</Button>} /></Panel>
        <ErrorNote error="Não foi possível salvar. Confira a conexão e tente de novo." />
      </Section>

      <Modal open={modal} onOpenChange={setModal} title="Registrar compra">
        <div className="flex flex-col gap-3">
          <Field label="Quantidade"><NumberInput defaultValue="0,00035812" /></Field>
          <div className="flex justify-end gap-2"><Button onClick={() => setModal(false)}>Cancelar</Button><Button variant="primary" onClick={() => setModal(false)}>Registrar compra</Button></div>
        </div>
      </Modal>
    </div>
  )
}
