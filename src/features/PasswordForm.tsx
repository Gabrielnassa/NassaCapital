import { useState, type FormEvent } from 'react'
import { Button, ErrorNote, Field, Input } from '../components/ui'
import { setPassword, useWrite } from '../lib/data'

/** Define a senha de acesso, para entrar no celular com e-mail e senha. */
export function PasswordForm() {
  const [pw, setPw] = useState('')
  const [confirm, setConfirm] = useState('')
  const [code, setCode] = useState('')
  const [needCode, setNeedCode] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const save = useWrite(setPassword)

  function submit(e: FormEvent) {
    e.preventDefault()
    setDone(false)
    if (pw.length < 8) return setError('Use pelo menos 8 caracteres.')
    if (pw !== confirm) return setError('As duas senhas não são iguais.')
    if (needCode && !/^\d{6,10}$/.test(code.replace(/\s/g, ''))) return setError('Digite o código que chegou no e-mail.')
    setError(null)
    save.mutate(
      { password: pw, nonce: needCode ? code.replace(/\s/g, '') : undefined },
      {
        onSuccess: (result) => {
          if (result === 'code-sent') return setNeedCode(true)
          setPw('')
          setConfirm('')
          setCode('')
          setNeedCode(false)
          setDone(true)
        },
      },
    )
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 border-t border-border pt-3" noValidate>
      <div className="text-sm font-medium">Senha de acesso</div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Nova senha"><Input type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} /></Field>
        <Field label="Repita a senha"><Input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} /></Field>
      </div>
      {needCode && (
        <Field label="Código enviado por e-mail" hint="O Supabase pediu para confirmar que é você.">
          <Input className="num" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="123456" />
        </Field>
      )}
      {error && <p role="alert" className="m-0 text-xs text-down">{error}</p>}
      <ErrorNote error={save.error} />
      {done && <p className="m-0 text-xs text-up">Senha definida. No celular, entre com e-mail e senha.</p>}
      <div><Button type="submit" disabled={save.isPending}>{needCode ? 'Confirmar e definir senha' : 'Definir senha'}</Button></div>
    </form>
  )
}
