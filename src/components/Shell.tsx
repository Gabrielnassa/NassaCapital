import { ArrowLeftRight, CalendarCheck, Menu, Repeat, Settings, Target, TrendingUp, Wallet, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { NavLink } from 'react-router'
import { usePriceStatus } from '../lib/data'
import { fmtDateTime } from '../lib/format'
import { usePortfolio } from '../lib/live-context'
import { cx } from './cx'

interface Item {
  to: string
  label: string
  icon: LucideIcon
}
const ALL: Item[] = [
  { to: '/', label: 'Hoje', icon: CalendarCheck },
  { to: '/carteira', label: 'Carteira', icon: Wallet },
  { to: '/metas', label: 'Metas', icon: Target },
  { to: '/dca', label: 'DCA', icon: Repeat },
  { to: '/simulacao', label: 'Simulação', icon: TrendingUp },
  { to: '/lancamentos', label: 'Lançamentos', icon: ArrowLeftRight },
  { to: '/ajustes', label: 'Ajustes', icon: Settings },
]
const MOBILE: Item[] = [ALL[0], ALL[1], ALL[3], { to: '/mais', label: 'Mais', icon: Menu }]

/** De onde vêm os preços agora: Binance ao vivo ou o último registro do servidor. */
function PriceSource() {
  const { live } = usePortfolio()
  const status = usePriceStatus()
  const at = status.data?.fetchedAt
  return (
    <div className="mt-auto px-2 text-xs text-muted">
      <div className="flex items-center gap-1.5">
        <span className={cx('block size-1.5 rounded-sm', live ? 'bg-accent' : 'bg-faint')} />
        {live ? 'Binance ao vivo' : 'Preços do servidor'}
      </div>
      {at && <div className="num mt-0.5 text-faint">{live ? 'demais ativos: ' : ''}{fmtDateTime(at)}</div>}
    </div>
  )
}

/** Barra lateral estreita no desktop; barra inferior com 4 itens no celular. */
export function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="md:pl-44">
      <nav aria-label="Principal" className="fixed inset-y-0 left-0 hidden w-44 flex-col border-r border-border bg-bg px-2 py-3 md:flex">
        <div className="mb-3 px-2 text-base font-semibold">Carteira</div>
        {ALL.map((i) => (
          <NavLink
            key={i.to}
            to={i.to}
            end={i.to === '/'}
            className={({ isActive }) =>
              cx(
                'flex h-8 items-center gap-2 rounded-md px-2 text-sm font-medium no-underline',
                isActive ? 'bg-accent-soft text-accent' : 'text-muted hover:bg-sunken hover:text-text',
              )
            }
          >
            <i.icon size={16} />
            {i.label}
          </NavLink>
        ))}
        <PriceSource />
      </nav>

      <main className="mx-auto max-w-6xl px-4 pt-4 pb-20 md:px-6 md:pt-5 md:pb-8">{children}</main>

      <nav
        aria-label="Principal"
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-border bg-bg pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        {MOBILE.map((i) => (
          <NavLink
            key={i.to}
            to={i.to}
            end={i.to === '/'}
            className={({ isActive }) =>
              cx('flex h-14 flex-col items-center justify-center gap-0.5 text-xs font-medium no-underline', isActive ? 'text-accent' : 'text-muted')
            }
          >
            <i.icon size={16} />
            {i.label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
