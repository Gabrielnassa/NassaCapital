// Lê o que o dono cola na tela de login: o código de 6 dígitos ou o link do e-mail do Supabase
// (https://<ref>.supabase.co/auth/v1/verify?token=<hash>&type=magiclink&redirect_to=...).
// Colar o link no app é o jeito de entrar pelo app da tela inicial do iPhone sem abrir o Safari.

export type LinkType = 'magiclink' | 'email' | 'signup' | 'recovery'
export type LoginInput = { kind: 'code'; token: string } | { kind: 'link'; tokenHash: string; type: LinkType }

const TYPES: LinkType[] = ['magiclink', 'email', 'signup', 'recovery']

export function parseLoginInput(text: string): LoginInput | null {
  const compact = text.replace(/\s+/g, '')
  if (!compact) return null
  if (/^\d{6,10}$/.test(compact)) return { kind: 'code', token: compact }
  const start = compact.search(/https?:\/\//i)
  if (start < 0) return null
  let url: URL
  try {
    url = new URL(compact.slice(start))
  } catch {
    return null
  }
  const tokenHash = url.searchParams.get('token') ?? url.searchParams.get('token_hash')
  if (!tokenHash) return null
  const raw = url.searchParams.get('type') as LinkType | null
  return { kind: 'link', tokenHash, type: raw && TYPES.includes(raw) ? raw : 'magiclink' }
}
