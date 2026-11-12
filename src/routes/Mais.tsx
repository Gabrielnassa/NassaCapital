import { ArrowLeftRight, ChevronRight, Settings, Target } from 'lucide-react'
import { Link } from 'react-router'
import { PageHeader, Panel } from '../components/ui'

const LINKS = [
  { to: '/metas', label: 'Metas e simulador de aporte', icon: Target },
  { to: '/lancamentos', label: 'Lançamentos', icon: ArrowLeftRight },
  { to: '/ajustes', label: 'Ajustes', icon: Settings },
]

export function Mais() {
  return (
    <>
      <PageHeader title="Mais" />
      <Panel flush>
        {LINKS.map((l) => (
          <Link key={l.to} to={l.to} className="flex h-11 items-center gap-2.5 border-b border-border px-3 text-sm text-text no-underline last:border-b-0 hover:bg-sunken">
            <l.icon size={16} className="text-muted" />
            <span className="flex-1">{l.label}</span>
            <ChevronRight size={16} className="text-faint" />
          </Link>
        ))}
      </Panel>
    </>
  )
}
