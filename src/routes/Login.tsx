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

/** Traduz os erros do Supabase Auth que aparecem no login. */
function authMessage(message: string | undefined, step: 'send' | 'verify'): string {
  const m = (message ?? '').toLowerCase()
  if (m.includes('security purposes') || m.includes('rate limit') || m.includes('too many'))
    return 'Muitas tentativas seguidas. Espere um minuto e peça um código novo.'
  if (m.includes('signups not allowed') || m.includes('not allowed for otp') || m.includes('user not found'))
    return 'Este e-mail não tem acesso à Carteira. Use o mesmo e-mail do primeiro acesso.'
  if (step === 'verify' && (m.includes('expired') || m.includes('invalid')))
    return 'Código errado ou vencido. Confira o último e-mail ou peça um código novo.'
  return step === 'send' ? 'Não foi possível enviar o código. Tente de novo em um minuto.' : 'Não foi possível entrar. Tente de novo.'
}

/**
 * Login sem senha. O e-mail traz um código de 6 dígitos (digitado aqui, o que funciona também no
 * app instalado na tela inicial do iPhone) e um link (abre no navegador). Não cria conta nova:
 * só o e-mail já cadastrado entra.
 */
export function Login() {
  const [email, setEmail] = useState('')
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function send(e?: FormEvent) {
    e?.preventDefault()
    const parsed = z.email().safeParse((sentTo ?? email).trim().toLowerCase())
    if (!parsed.success) return setError('Digite um e-mail válido.')
    setBusy(true)
    setError(null)
    const { error } = await supabase.auth.signInWithOtp({
      email: parsed.data,
      options: { shouldCreateUser: false, emailRedirectTo: new URL(import.meta.env.BASE_URL, window.location.origin).href },
    })
    setBusy(false)
    if (error) setError(authMessage(error.message, 'send'))
    else {
      setSentTo(parsed.data)
      setCode('')
    }
  }

  async function verify(e: FormEvent) {
    e.preventDefault()
    const token = code.replace(/\D/g, '')
    if (token.length < 6) return setError('Digite o código que chegou no e-mail.')
    setBusy(true)
    setError(null)
    const { error } = await supabase.auth.verifyOtp({ email: sentTo!, token, type: 'email' })
    setBusy(false)
    // Com sucesso, o app troca sozinho para a tela inicial (onAuthStateChange).
    if (error) setError(authMessage(error.message, 'verify'))
  }

  if (sentTo) {
    return (
      <Frame>
        <form onSubmit={verify} className="flex flex-col gap-3" noValidate>
          <p className="m-0 text-sm">
            Enviamos um código para <strong>{sentTo}</strong>. Digite aqui os números do e-mail.
          </p>
          <Field label="Código" error={error}>
            <Input className="num text-center text-lg tracking-[0.3em]" inputMode="numeric" autoComplete="one-time-code" autoFocus
              maxLength={10} value={code} onChange={(e) => setCode(e.target.value)} placeholder="000000" />
          </Field>
          <Button type="submit" variant="primary" disabled={busy}>{busy ? 'Entrando' : 'Entrar'}</Button>
          <div className="flex justify-between gap-2">
            <Button variant="ghost" size="sm" onClick={() => { setSentTo(null); setError(null) }}>Trocar e-mail</Button>
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => send()}>Enviar outro código</Button>
          </div>
          <p className="m-0 text-xs text-muted">
            Se o e-mail trouxer só um link, abra-o neste mesmo navegador. No iPhone, o link abre no Safari, e não no app da tela inicial.
          </p>
        </form>
      </Frame>
    )
  }

  return (
    <Frame>
      <form onSubmit={send} className="flex flex-col gap-3" noValidate>
        <Field label="E-mail" error={error}>
          <Input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@exemplo.com" />
        </Field>
        <Button type="submit" variant="primary" disabled={busy}>
          {busy ? 'Enviando' : 'Receber código de acesso'}
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
