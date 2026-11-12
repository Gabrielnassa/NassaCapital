import { useState, type FormEvent } from 'react'
import { z } from 'zod'
import { Button, ErrorNote, Field, Input } from '../components/ui'
import { supabase } from '../lib/supabase'

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-4">
      <h1 className="mb-4 text-xl">Carteira</h1>
      {children}
    </div>
  )
}

export function Login() {
  const [email, setEmail] = useState('')
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    const parsed = z.email().safeParse(email.trim())
    if (!parsed.success) return setError('Digite um e-mail válido.')
    setBusy(true)
    setError(null)
    const { error } = await supabase.auth.signInWithOtp({ email: parsed.data, options: { emailRedirectTo: window.location.origin } })
    setBusy(false)
    if (error) setError('Não foi possível enviar o link. Tente de novo em um minuto.')
    else setSentTo(parsed.data)
  }

  if (sentTo) {
    return (
      <Frame>
        <p className="mt-0 mb-3 text-sm">
          Enviamos um link de acesso para <strong>{sentTo}</strong>. Abra o e-mail neste aparelho e toque no link.
        </p>
        <Button onClick={() => setSentTo(null)}>Usar outro e-mail</Button>
      </Frame>
    )
  }

  return (
    <Frame>
      <form onSubmit={submit} className="flex flex-col gap-3" noValidate>
        <Field label="E-mail" error={error}>
          <Input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@exemplo.com" />
        </Field>
        <Button type="submit" variant="primary" disabled={busy}>
          {busy ? 'Enviando' : 'Receber link de acesso'}
        </Button>
      </form>
    </Frame>
  )
}

export function SetupNeeded() {
  return (
    <Frame>
      <ErrorNote error="Falta configurar o Supabase. Copie .env.example para .env, preencha VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY e reinicie o app." />
    </Frame>
  )
}
