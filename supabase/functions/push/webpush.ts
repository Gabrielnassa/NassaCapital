// Web Push sem bibliotecas: criptografia aes128gcm (RFC 8291) e assinatura VAPID (RFC 8292),
// só com WebCrypto. Roda no Deno (Edge Function) e no Node (testes do Vitest).

export interface PushSubscriptionKeys {
  endpoint: string
  /** chave pública do aparelho (P-256, 65 bytes), base64url */
  p256dh: string
  /** segredo de autenticação do aparelho (16 bytes), base64url */
  auth: string
}

export interface VapidKeys {
  /** chave pública (65 bytes), base64url: vai para o navegador como applicationServerKey */
  publicKey: string
  /** chave privada em JWK (ECDSA P-256) */
  privateJwk: JsonWebKey
  /** contato do servidor de push: URL https ou mailto */
  subject: string
}

const enc = new TextEncoder()

export function b64urlEncode(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function b64urlDecode(text: string): Uint8Array {
  const b64 = text.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((text.length + 3) % 4)
  const bin = atob(b64)
  return Uint8Array.from(bin, (c) => c.charCodeAt(0))
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let i = 0
  for (const p of parts) {
    out.set(p, i)
    i += p.length
  }
  return out
}

async function hmac(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, data))
}

/** HKDF com um bloco de saída (até 32 bytes), como usado no RFC 8291. */
async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> {
  const prk = await hmac(salt, ikm)
  return (await hmac(prk, concat(info, new Uint8Array([1])))).slice(0, length)
}

/** Gera um par de chaves VAPID novo. */
export async function generateVapidKeys(): Promise<{ publicKey: string; privateJwk: JsonWebKey }> {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
  const raw = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey))
  return { publicKey: b64urlEncode(raw), privateJwk: await crypto.subtle.exportKey('jwk', pair.privateKey) }
}

/**
 * Criptografa a mensagem para um aparelho (RFC 8291, content-encoding aes128gcm).
 * Devolve o corpo pronto: cabeçalho (salt, tamanho do registro, chave pública efêmera) + texto cifrado.
 */
export async function encryptPayload(sub: Pick<PushSubscriptionKeys, 'p256dh' | 'auth'>, plaintext: Uint8Array): Promise<Uint8Array> {
  const uaPublic = b64urlDecode(sub.p256dh)
  const authSecret = b64urlDecode(sub.auth)
  const local = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', local.publicKey))
  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, [])
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, local.privateKey, 256))

  const ikm = await hkdf(authSecret, shared, concat(enc.encode('WebPush: info\0'), uaPublic, asPublic), 32)
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16)
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12)

  // Um registro só: mensagem + delimitador 0x02 (último registro).
  const padded = concat(plaintext, new Uint8Array([2]))
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt'])
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, padded))

  const rs = new Uint8Array(4)
  new DataView(rs.buffer).setUint32(0, 4096)
  return concat(salt, rs, new Uint8Array([asPublic.length]), asPublic, cipher)
}

/** JWT VAPID (ES256) para a origem do serviço de push. Validade de 12 horas. */
export async function vapidJwt(endpoint: string, vapid: VapidKeys, now = Date.now()): Promise<string> {
  const header = b64urlEncode(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })))
  const claims = b64urlEncode(enc.encode(JSON.stringify({
    aud: new URL(endpoint).origin,
    exp: Math.floor(now / 1000) + 12 * 3600,
    sub: vapid.subject,
  })))
  const key = await crypto.subtle.importKey('jwk', vapid.privateJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'])
  const signature = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(`${header}.${claims}`)))
  return `${header}.${claims}.${b64urlEncode(signature)}`
}

export interface SendResult {
  status: number
  /** 404 ou 410: o aparelho cancelou a inscrição; ela deve ser apagada */
  gone: boolean
}

/** Envia uma notificação. O conteúdo é JSON: { title, body, url }. */
export async function sendPush(sub: PushSubscriptionKeys, message: unknown, vapid: VapidKeys): Promise<SendResult> {
  const body = await encryptPayload(sub, enc.encode(JSON.stringify(message)))
  const jwt = await vapidJwt(sub.endpoint, vapid)
  const res = await fetch(sub.endpoint, {
    method: 'POST',
    headers: {
      Authorization: `vapid t=${jwt}, k=${vapid.publicKey}`,
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: '86400',
      Urgency: 'normal',
    },
    body,
  })
  await res.body?.cancel()
  return { status: res.status, gone: res.status === 404 || res.status === 410 }
}
