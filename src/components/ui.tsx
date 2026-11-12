import * as Dialog from '@radix-ui/react-dialog'
import * as RPopover from '@radix-ui/react-popover'
import * as RSelect from '@radix-ui/react-select'
import * as RTabs from '@radix-ui/react-tabs'
import { Check, ChevronDown, X } from 'lucide-react'
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react'
import type { Ccy, Dec } from '../lib/calc/money'
import { cx } from './cx'
import { fmtMoneySigned, fmtPct, fmtPctSigned } from '../lib/format'


// ------------------------------------------------------------------ Botão

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md'
}
const buttonVariant = {
  primary: 'bg-accent text-on-accent border-accent hover:bg-accent-hover hover:border-accent-hover',
  secondary: 'bg-surface text-text border-border-strong hover:bg-sunken',
  ghost: 'bg-transparent text-muted border-transparent hover:bg-sunken hover:text-text',
  danger: 'bg-surface text-down border-border-strong hover:bg-sunken',
}
export function Button({ variant = 'secondary', size = 'md', className, type = 'button', ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      className={cx(
        'inline-flex shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-md border font-medium whitespace-nowrap',
        'disabled:cursor-not-allowed disabled:opacity-50',
        size === 'sm' ? 'h-7 px-2.5 text-xs' : 'h-9 px-3.5 text-sm',
        buttonVariant[variant],
        className,
      )}
      {...rest}
    />
  )
}

// ------------------------------------------------------------------ Campos

const inputBase =
  'h-9 w-full rounded-md border border-border-strong bg-surface px-2.5 text-sm text-text placeholder:text-faint ' +
  'hover:border-muted focus:border-accent focus:outline-none disabled:opacity-50'

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cx(inputBase, className)} {...rest} />
}

/** Entrada de número: teclado decimal no celular, fonte mono, alinhada à direita. Aceita "1.234,56". */
export function NumberInput({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input inputMode="decimal" autoComplete="off" className={cx(inputBase, 'num text-right', className)} {...rest} />
}

export function Field(props: { label: string; hint?: string; error?: string | null; children: ReactNode; className?: string }) {
  return (
    <label className={cx('block', props.className)}>
      <span className="mb-1 block text-xs font-medium text-muted">{props.label}</span>
      {props.children}
      {props.error ? (
        <span className="mt-1 block text-xs text-down">{props.error}</span>
      ) : props.hint ? (
        <span className="mt-1 block text-xs text-faint">{props.hint}</span>
      ) : null}
    </label>
  )
}

export interface Option {
  value: string
  label: string
}
export function Select(props: {
  value: string
  onChange: (v: string) => void
  options: Option[]
  placeholder?: string
  className?: string
  'aria-label'?: string
}) {
  return (
    <RSelect.Root value={props.value || undefined} onValueChange={props.onChange}>
      <RSelect.Trigger
        aria-label={props['aria-label']}
        className={cx(inputBase, 'flex cursor-pointer items-center justify-between gap-2 text-left data-[placeholder]:text-faint', props.className)}
      >
        <span className="truncate">
          <RSelect.Value placeholder={props.placeholder ?? 'Selecionar'} />
        </span>
        <ChevronDown size={16} className="shrink-0 text-muted" />
      </RSelect.Trigger>
      <RSelect.Portal>
        <RSelect.Content
          position="popper"
          sideOffset={4}
          className="z-50 max-h-72 min-w-[var(--radix-select-trigger-width)] overflow-auto rounded-md border border-border-strong bg-surface p-1 shadow-[0_2px_6px_rgb(0_0_0/0.08)]"
        >
          <RSelect.Viewport>
            {props.options.map((o) => (
              <RSelect.Item
                key={o.value}
                value={o.value}
                className="flex h-8 cursor-pointer items-center justify-between gap-3 rounded-sm px-2 text-sm outline-none select-none data-[highlighted]:bg-sunken"
              >
                <RSelect.ItemText>{o.label}</RSelect.ItemText>
                <RSelect.ItemIndicator>
                  <Check size={16} className="text-accent" />
                </RSelect.ItemIndicator>
              </RSelect.Item>
            ))}
          </RSelect.Viewport>
        </RSelect.Content>
      </RSelect.Portal>
    </RSelect.Root>
  )
}

/** Alternância curta entre 2 ou 3 opções (moeda, tema). */
export function Segmented<T extends string>(props: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: string }[]
  'aria-label': string
}) {
  return (
    <div role="radiogroup" aria-label={props['aria-label']} className="inline-flex h-9 rounded-md border border-border-strong bg-surface p-0.5">
      {props.options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === props.value}
          onClick={() => props.onChange(o.value)}
          className={cx(
            'cursor-pointer rounded-sm px-3 text-sm font-medium',
            o.value === props.value ? 'bg-accent-soft text-accent' : 'text-muted hover:text-text',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

// ------------------------------------------------------------------ Painéis

/** Diálogo: centralizado no desktop, folha inferior no celular. */
export function Modal(props: { open: boolean; onOpenChange: (o: boolean) => void; title: string; children: ReactNode; wide?: boolean }) {
  return (
    <Dialog.Root open={props.open} onOpenChange={props.onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/35" />
        <Dialog.Content
          aria-describedby={undefined}
          className={cx(
            'fixed z-50 flex max-h-[92dvh] flex-col border border-border-strong bg-bg',
            'inset-x-0 bottom-0 rounded-t-md sm:inset-x-auto sm:top-1/2 sm:bottom-auto sm:left-1/2 sm:w-[calc(100vw-48px)] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-md',
            props.wide ? 'sm:max-w-3xl' : 'sm:max-w-md',
          )}
        >
          <div className="flex h-12 shrink-0 items-center justify-between border-b border-border px-4">
            <Dialog.Title className="text-base font-semibold">{props.title}</Dialog.Title>
            <Dialog.Close aria-label="Fechar" className="-mr-1.5 flex size-8 cursor-pointer items-center justify-center rounded-md text-muted hover:bg-sunken hover:text-text">
              <X size={16} />
            </Dialog.Close>
          </div>
          <div className="overflow-y-auto p-4">{props.children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

export function Popover(props: { trigger: ReactNode; children: ReactNode; align?: 'start' | 'center' | 'end' }) {
  return (
    <RPopover.Root>
      <RPopover.Trigger asChild>{props.trigger}</RPopover.Trigger>
      <RPopover.Portal>
        <RPopover.Content
          align={props.align ?? 'start'}
          sideOffset={6}
          collisionPadding={12}
          className="z-50 w-64 rounded-md border border-border-strong bg-surface p-3 text-sm shadow-[0_2px_6px_rgb(0_0_0/0.08)]"
        >
          {props.children}
        </RPopover.Content>
      </RPopover.Portal>
    </RPopover.Root>
  )
}

export function Tabs(props: { value: string; onChange: (v: string) => void; tabs: { value: string; label: string; content: ReactNode }[] }) {
  return (
    <RTabs.Root value={props.value} onValueChange={props.onChange}>
      <RTabs.List className="flex gap-5 border-b border-border">
        {props.tabs.map((t) => (
          <RTabs.Trigger
            key={t.value}
            value={t.value}
            className="-mb-px h-9 cursor-pointer border-b-2 border-transparent text-sm font-medium text-muted hover:text-text data-[state=active]:border-accent data-[state=active]:text-text"
          >
            {t.label}
          </RTabs.Trigger>
        ))}
      </RTabs.List>
      {props.tabs.map((t) => (
        <RTabs.Content key={t.value} value={t.value} className="pt-4 outline-none">
          {t.content}
        </RTabs.Content>
      ))}
    </RTabs.Root>
  )
}

/** Bloco com borda de 1px. Sem sombra. */
export function Panel(props: { title?: string; action?: ReactNode; children: ReactNode; className?: string; flush?: boolean }) {
  return (
    <section className={cx('rounded-md border border-border bg-surface', props.className)}>
      {props.title && (
        <header className="flex h-10 items-center justify-between gap-3 border-b border-border px-3">
          <h2 className="text-sm font-semibold">{props.title}</h2>
          {props.action}
        </header>
      )}
      <div className={props.flush ? '' : 'p-3'}>{props.children}</div>
    </section>
  )
}

export function PageHeader(props: { title: string; children?: ReactNode }) {
  return (
    <div className="mb-4 flex min-h-9 flex-wrap items-center justify-between gap-x-3 gap-y-2">
      <h1 className="text-xl">{props.title}</h1>
      <div className="flex items-center gap-2">{props.children}</div>
    </div>
  )
}

/** Estado vazio: uma frase e um botão. */
export function EmptyState(props: { text: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-3 px-3 py-5">
      <p className="m-0 text-sm text-muted">{props.text}</p>
      {props.action}
    </div>
  )
}

export function ErrorNote({ error }: { error: unknown }) {
  if (!error) return null
  const message = error instanceof Error ? error.message : typeof error === 'object' && 'message' in error ? String(error.message) : String(error)
  return (
    <p role="alert" className="m-0 rounded-md border border-down px-3 py-2 text-sm text-down">
      {message}
    </p>
  )
}

// ------------------------------------------------------------------ Números

/** Alta e baixa: cor dessaturada e sempre com sinal (a cor nunca é a única informação). */
export function Delta(props: { value: Dec | null | undefined; ccy?: Ccy; className?: string }) {
  const v = props.value
  const tone = v == null || v.isZero() ? 'text-muted' : v.gt(0) ? 'text-up' : 'text-down'
  return <span className={cx('num', tone, props.className)}>{props.ccy ? fmtMoneySigned(v, props.ccy) : fmtPctSigned(v)}</span>
}

export function Badge(props: { tone?: 'neutral' | 'accent' | 'up' | 'down' | 'warn'; children: ReactNode }) {
  const tone = {
    neutral: 'border-border-strong text-muted',
    accent: 'border-accent text-accent',
    up: 'border-up text-up',
    down: 'border-down text-down',
    warn: 'border-warn text-warn',
  }[props.tone ?? 'neutral']
  return <span className={cx('inline-flex h-5 items-center rounded-sm border px-1.5 text-xs font-medium whitespace-nowrap', tone)}>{props.children}</span>
}

/**
 * Barra de meta: preenchimento = % atual, traço vertical = % meta.
 * `max` é a escala comum das barras de uma mesma lista, para serem comparáveis.
 */
export function TargetBar(props: { current: Dec; target: Dec | null; max: Dec; className?: string }) {
  const scale = (v: Dec) => `${Math.min(v.div(props.max).times(100).toNumber(), 100)}%`
  const label = props.target ? `Atual ${fmtPct(props.current)}, meta ${fmtPct(props.target)}` : `Atual ${fmtPct(props.current)}, fora da meta`
  return (
    <div role="img" aria-label={label} className={cx('relative h-2 w-full rounded-sm bg-sunken', props.className)}>
      <div className={cx('h-full rounded-sm', props.target ? 'bg-accent' : 'bg-faint')} style={{ width: scale(props.current) }} />
      {props.target && <div className="absolute -top-1 h-4 w-0.5 bg-text" style={{ left: scale(props.target) }} />}
    </div>
  )
}

/** Faixa de números-chave: rótulo pequeno, valor em mono. Sem cards: só divisórias de 1px. */
export function Stats(props: { items: { label: string; value: ReactNode; sub?: ReactNode }[] }) {
  return (
    <dl className="m-0 grid grid-cols-2 overflow-hidden rounded-md border border-border bg-surface md:auto-cols-fr md:grid-flow-col md:grid-cols-none">
      {props.items.map((item) => (
        <div key={item.label} className="-mb-px -ml-px border-b border-l border-border px-3 py-2">
          <dt className="text-xs font-medium text-muted">{item.label}</dt>
          <dd className="num m-0 text-base leading-snug font-medium">{item.value}</dd>
          {item.sub != null && <dd className="num m-0 text-xs text-muted">{item.sub}</dd>}
        </div>
      ))}
    </dl>
  )
}

/**
 * Composição da carteira numa barra só, com legenda em texto. Uma única cor, em tons que vão
 * clareando; a parte sem tom (muted) é a que não é investimento, como caixa.
 */
export function SegmentBar(props: { segments: { label: string; pct: Dec; muted?: boolean }[]; 'aria-label': string }) {
  const shown = props.segments.filter((s) => s.pct.gt(0))
  const tones = [100, 68, 44, 28, 18]
  const colored = shown.map((s, i) => {
    const tone = tones[Math.min(shown.slice(0, i).filter((x) => !x.muted).length, tones.length - 1)]
    return { ...s, color: s.muted ? 'var(--faint)' : `color-mix(in srgb, var(--accent) ${tone}%, var(--sunken))` }
  })
  return (
    <div>
      <div role="img" aria-label={`${props['aria-label']}: ${colored.map((s) => `${s.label} ${fmtPct(s.pct)}`).join(', ')}`} className="flex h-2 w-full gap-px overflow-hidden rounded-sm bg-sunken">
        {colored.map((s) => (
          <div key={s.label} style={{ width: `${s.pct.toNumber()}%`, background: s.color }} />
        ))}
      </div>
      <ul className="m-0 mt-2 flex list-none flex-wrap gap-x-4 gap-y-1 p-0 text-xs">
        {colored.map((s) => (
          <li key={s.label} className="inline-flex items-center gap-1.5">
            <span className="block size-2 rounded-sm" style={{ background: s.color }} />
            <span className="text-muted">{s.label}</span>
            <span className="num font-medium">{fmtPct(s.pct)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Barra de progresso simples (executado vs planejado). */
export function ProgressBar(props: { value: Dec; total: Dec; label: string }) {
  const pct = props.total.gt(0) ? Math.min(props.value.div(props.total).times(100).toNumber(), 100) : 0
  return (
    <div role="progressbar" aria-label={props.label} aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} className="h-2 w-full rounded-sm bg-sunken">
      <div className="h-full rounded-sm bg-accent" style={{ width: `${pct}%` }} />
    </div>
  )
}

