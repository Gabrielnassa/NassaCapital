import { useState, type FormEvent } from 'react'
import { z } from 'zod'
import { Button, ErrorNote, Field, Input } from '../components/ui'
import { parseLoginInput } from '../lib/auth-link'
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
function authMessage(message: string | undefined, step: 'password' | 'send' | 'verify'): string {
  const m = (message ?? '').toLowerCase()
  if (m.includes('security purposes') || m.includes('rate limit') || m.includes('too many'))
    return 'Muitas tentativas seguidas. Espere um minuto e tente de novo.'
  if (m.includes('invalid login credentials'))
    return 'E-mail ou senha errados. Se ainda não definiu uma senha, entre sem senha e defina em Ajustes.'
  if (m.includes('email not confirmed')) return 'E-mail ainda não confirmado. Entre sem senha uma vez.'
  if (m.includes('signups not allowed') || m.includes('not allowed for otp') || m.includes('user not found'))
    return 'Este e-mail não tem acesso à Carteira. Use o mesmo e-mail do primeiro acesso.'
  if (step === 'verify' && (m.includes('expired') || m.includes('invalid')))
    return 'Link ou código vencido ou já usado. Peça um novo e cole sem abrir o link antes.'
  if (step === 'send') return 'Não foi possível enviar o e-mail. Tente de novo em um minuto.'
  return 'Não foi possível entrar. Tente de novo.'
}

type Step = { name: 'password' } | { name: 'send' } | { name: 'paste'; email: string }

/**
 * Login. Principal: e-mail e senha (a senha é definida em Ajustes, num aparelho já conectado).
 * Reserva: o app manda o link por e-mail e o dono cola o link (ou o código) aqui, sem abrir o
 * Safari. Assim funciona também no app da tela inicial do iPhone, que não recebe a sessão do Safari.
 * Nenhum dos dois cria conta nova.
 */
export function Login() {
  const [step, setStep] = useState<Step>({ name: 'password' })
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [pasted, setPasted] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const go = (next: Step) => {
    setError(null)
    setStep(next)
  }
  const cleanEmail = () => {
    const parsed = z.email().safeParse(email.trim().toLowerCase())
    if (!parsed.success) setError('Digite um e-mail válido.')
    return parsed.success ? parsed.data : null
  }

  async function signIn(e: FormEvent) {
    e.preventDefault()
    const addr = cleanEmail()
    if (!addr) return
    if (!password) return setError('Digite a senha.')
    setBusy(true)
    setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email: addr, password })
    setBusy(false)
    // Com sucesso, o app troca sozinho para a tela inicial (onAuthStateChange).
    if (error) setError(authMessage(error.message, 'password'))
  }

  async function send(e?: FormEvent) {
    e?.preventDefault()
    const addr = step.name === 'paste' ? step.email : cleanEmail()
    if (!addr) return
    setBusy(true)
    setError(null)
    const { error } = await supabase.auth.signInWithOtp({
      email: addr,
      options: { shouldCreateUser: false, emailRedirectTo: new URL(import.meta.env.BASE_URL, window.location.origin).href },
    })
    setBusy(false)
    if (error) return setError(authMessage(error.message, 'send'))
    setPasted('')
    go({ name: 'paste', email: addr })
  }

  async function verify(e: FormEvent) {
    e.preventDefault()
    if (step.name !== 'paste') return
    const input = parseLoginInput(pasted)
    if (!input) return setError('Cole o link inteiro do e-mail (ou o código de 6 dígitos).')
    setBusy(true)
    setError(null)
    const { error } = input.kind === 'code'
      ? await supabase.auth.verifyOtp({ email: step.email, token: input.token, type: 'email' })
      : await supabase.auth.verifyOtp({ token_hash: input.tokenHash, type: input.type })
    setBusy(false)
    if (error) setError(authMessage(error.message, 'verify'))
  }

  if (step.name === 'paste') {
    return (
      <Frame>
        <form onSubmit={verify} className="flex flex-col gap-3" noValidate>
          <p className="m-0 text-sm">
            Enviamos um e-mail para <strong>{step.email}</strong>. Não toque no link: toque e segure, escolha <strong>Copiar link</strong> e cole aqui.
          </p>
          <Field label="Link do e-mail ou código" error={error}>
            <Input autoFocus autoComplete="one-time-code" autoCapitalize="off" autoCorrect="off" spellCheck={false}
              value={pasted} onChange={(e) => setPasted(e.target.value)} placeholder="https://… ou 123456" />
          </Field>
          <Button type="submit" variant="primary" disabled={busy}>{busy ? 'Entrando' : 'Entrar'}</Button>
          <div className="flex justify-between gap-2">
            <Button variant="ghost" size="sm" onClick={() => go({ name: 'password' })}>Voltar</Button>
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => send()}>Enviar outro e-mail</Button>
          </div>
          <p className="m-0 text-xs text-muted">
            O link vale por pouco tempo e só uma vez. Se já tocou nele, peça outro.
          </p>
        </form>
      </Frame>
    )
  }

  if (step.name === 'send') {
    return (
      <Frame>
        <form onSubmit={send} className="flex flex-col gap-3" noValidate>
          <Field label="E-mail" error={error}>
            <Input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@exemplo.com" />
          </Field>
          <Button type="submit" variant="primary" disabled={busy}>{busy ? 'Enviando' : 'Enviar link por e-mail'}</Button>
          <Button variant="ghost" size="sm" onClick={() => go({ name: 'password' })}>Entrar com senha</Button>
        </form>
      </Frame>
    )
  }

  return (
    <Frame>
      <form onSubmit={signIn} className="flex flex-col gap-3" noValidate>
        <Field label="E-mail">
          <Input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@exemplo.com" />
        </Field>
        <Field label="Senha" error={error}>
          <Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <Button type="submit" variant="primary" disabled={busy}>{busy ? 'Entrando' : 'Entrar'}</Button>
        <Button variant="ghost" size="sm" onClick={() => go({ name: 'send' })}>Entrar sem senha (link por e-mail)</Button>
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
