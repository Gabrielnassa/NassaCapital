import { createECDH, randomBytes } from 'node:crypto'
// @ts-expect-error http_ece não tem tipos; é a biblioteca de referência usada pelo pacote web-push
import ece from 'http_ece'
import { describe, expect, it } from 'vitest'
import { brasiliaNow, reminderText } from './reminder'
import { b64urlDecode, b64urlEncode, encryptPayload, generateVapidKeys, vapidJwt } from './webpush'

/** Um "aparelho" falso: par de chaves P-256 e segredo, como o navegador cria ao se inscrever. */
function fakeDevice() {
  const ecdh = createECDH('prime256v1')
  ecdh.generateKeys()
  const auth = randomBytes(16)
  return { ecdh, p256dh: b64urlEncode(new Uint8Array(ecdh.getPublicKey())), auth: b64urlEncode(new Uint8Array(auth)), authRaw: auth }
}

describe('Web Push: criptografia (RFC 8291)', () => {
  it('o aparelho consegue decifrar a mensagem', async () => {
    const device = fakeDevice()
    const message = JSON.stringify({ title: 'Comprar hoje', body: 'BTC US$ 26,90 · ação: compre' })
    const body = await encryptPayload(device, new TextEncoder().encode(message))
    const plain = ece.decrypt(Buffer.from(body), { version: 'aes128gcm', privateKey: device.ecdh, authSecret: device.authRaw })
    expect(plain.toString('utf8')).toBe(message)
  })
  it('cabeçalho: salt de 16 bytes, registro de 4096 e chave pública efêmera de 65 bytes', async () => {
    const body = await encryptPayload(fakeDevice(), new TextEncoder().encode('x'))
    expect(new DataView(body.buffer).getUint32(16)).toBe(4096)
    expect(body[20]).toBe(65)
    expect(body[21]).toBe(4) // ponto não comprimido
  })
  it('com segredo errado não decifra', async () => {
    const device = fakeDevice()
    const body = await encryptPayload(device, new TextEncoder().encode('segredo'))
    expect(() => ece.decrypt(Buffer.from(body), { version: 'aes128gcm', privateKey: device.ecdh, authSecret: randomBytes(16) })).toThrow()
  })
})

describe('Web Push: assinatura VAPID (RFC 8292)', () => {
  it('JWT ES256 assinado com a chave privada e verificável com a pública', async () => {
    const keys = await generateVapidKeys()
    const jwt = await vapidJwt('https://web.push.apple.com/QGuQyavXutnMH', { ...keys, subject: 'https://gabrielnassa.github.io/NassaCapital/' }, Date.UTC(2026, 10, 17, 12))
    const [h, c, s] = jwt.split('.')
    expect(JSON.parse(new TextDecoder().decode(b64urlDecode(h)))).toEqual({ typ: 'JWT', alg: 'ES256' })
    const claims = JSON.parse(new TextDecoder().decode(b64urlDecode(c)))
    expect(claims.aud).toBe('https://web.push.apple.com')
    expect(claims.exp).toBe(Date.UTC(2026, 10, 17, 12) / 1000 + 12 * 3600)
    expect(claims.sub).toBe('https://gabrielnassa.github.io/NassaCapital/')
    const pub = await crypto.subtle.importKey('raw', b64urlDecode(keys.publicKey), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify'])
    const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pub, b64urlDecode(s), new TextEncoder().encode(`${h}.${c}`))
    expect(ok).toBe(true)
    expect(b64urlDecode(keys.publicKey).length).toBe(65)
  })
})

describe('lembrete diário', () => {
  it('hora e data em Brasília', () => {
    expect(brasiliaNow(new Date('2026-11-17T13:00:00Z'))).toEqual({ hour: 10, date: '2026-11-17' })
    expect(brasiliaNow(new Date('2026-11-18T02:30:00Z'))).toEqual({ hour: 23, date: '2026-11-17' })
  })
  it('lista as compras de hoje e conta as atrasadas', () => {
    const items = [
      { ticker: 'BTC', amount: 26.9, currency: 'USD' as const, date: '2026-11-19' },
      { ticker: 'ETH', amount: 33.5, currency: 'USD' as const, date: '2026-11-19' },
      { ticker: 'BTC', amount: 26.9, currency: 'USD' as const, date: '2026-11-18' },
    ]
    expect(reminderText(items, '2026-11-19')).toEqual({ title: 'Comprar hoje', body: 'BTC US$ 26,90 · ETH US$ 33,50 · 1 atrasada' })
  })
  it('só atrasadas', () => {
    const items = [
      { ticker: 'BTC', amount: 26.9, currency: 'USD' as const, date: '2026-11-17' },
      { ticker: 'AAVE', amount: 16.75, currency: 'USD' as const, date: '2026-11-16' },
    ]
    expect(reminderText(items, '2026-11-18')).toEqual({ title: 'Compras atrasadas', body: '2 atrasadas: BTC, AAVE' })
  })
  it('nada para comprar: sem notificação', () => {
    expect(reminderText([], '2026-11-18')).toBeNull()
  })
})
