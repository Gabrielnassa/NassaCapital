import { describe, expect, it } from 'vitest'
import { parseLoginInput } from './auth-link'

const link = 'https://ffyrnrqixhpigmiiatwz.supabase.co/auth/v1/verify?token=pkce_7f3a9c&type=magiclink&redirect_to=https%3A%2F%2Fgabrielnassa.github.io%2FNassaCapital%2F'

describe('login: o que o dono cola', () => {
  it('link do e-mail vira token_hash e tipo', () => {
    expect(parseLoginInput(link)).toEqual({ kind: 'link', tokenHash: 'pkce_7f3a9c', type: 'magiclink' })
  })
  it('link colado com espaços, quebra de linha ou texto antes', () => {
    expect(parseLoginInput(`  Entrar: ${link.slice(0, 40)}\n${link.slice(40)}  `)).toEqual({ kind: 'link', tokenHash: 'pkce_7f3a9c', type: 'magiclink' })
  })
  it('tipo desconhecido vira magiclink; token_hash também é aceito', () => {
    expect(parseLoginInput('https://x.supabase.co/auth/v1/verify?token=abc&type=outro')).toEqual({ kind: 'link', tokenHash: 'abc', type: 'magiclink' })
    expect(parseLoginInput('https://x.app/auth/confirm?token_hash=abc&type=email')).toEqual({ kind: 'link', tokenHash: 'abc', type: 'email' })
  })
  it('código de 6 dígitos, mesmo com espaços', () => {
    expect(parseLoginInput('123 456')).toEqual({ kind: 'code', token: '123456' })
  })
  it('texto que não serve devolve null', () => {
    expect(parseLoginInput('')).toBeNull()
    expect(parseLoginInput('olá')).toBeNull()
    expect(parseLoginInput('12345')).toBeNull()
    expect(parseLoginInput('https://x.supabase.co/auth/v1/verify?type=magiclink')).toBeNull()
  })
})
