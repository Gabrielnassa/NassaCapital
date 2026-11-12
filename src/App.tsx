import { useEffect } from 'react'
import { Navigate, Route, Routes } from 'react-router'
import { Shell } from './components/Shell'
import { useSettings } from './lib/data'
import { useSession } from './lib/session'
import { isConfigured } from './lib/supabase'
import { applyTheme } from './lib/theme'
import { Ajustes } from './routes/Ajustes'
import { Carteira } from './routes/Carteira'
import { Dca } from './routes/Dca'
import { Design } from './routes/Design'
import { Hoje } from './routes/Hoje'
import { Lancamentos } from './routes/Lancamentos'
import { Login, SetupNeeded } from './routes/Login'
import { Mais } from './routes/Mais'
import { Metas } from './routes/Metas'

function Private() {
  const settings = useSettings()
  useEffect(() => {
    if (settings.data) applyTheme(settings.data.theme)
  }, [settings.data])

  return (
    <Shell>
      <Routes>
        <Route path="/" element={<Hoje />} />
        <Route path="/carteira" element={<Carteira />} />
        <Route path="/metas" element={<Metas />} />
        <Route path="/dca" element={<Dca />} />
        <Route path="/lancamentos" element={<Lancamentos />} />
        <Route path="/ajustes" element={<Ajustes />} />
        <Route path="/mais" element={<Mais />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Shell>
  )
}

function Gate() {
  const session = useSession()
  if (!isConfigured) return <SetupNeeded />
  if (session === undefined) return null
  return session ? <Private /> : <Login />
}

export default function App() {
  return (
    <Routes>
      {/* /design não exige login: é a vitrine dos componentes, para aprovar o visual. */}
      <Route path="/design" element={<Design />} />
      <Route path="*" element={<Gate />} />
    </Routes>
  )
}
