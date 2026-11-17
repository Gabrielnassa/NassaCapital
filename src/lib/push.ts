// Inscrição deste aparelho no lembrete diário (Web Push).
// No iPhone, só funciona no app aberto pela tela inicial (modo standalone), a partir do iOS 16.4.

export type PushSupport = 'ok' | 'install' | 'unsupported' | 'denied'

export function isStandalone(): boolean {
  return window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true
}

export function pushSupport(): PushSupport {
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent)
  if (ios && !isStandalone()) return 'install'
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported'
  if (Notification.permission === 'denied') return 'denied'
  return 'ok'
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  if (!('serviceWorker' in navigator)) return null
  const reg = await navigator.serviceWorker.getRegistration()
  return (await reg?.pushManager.getSubscription()) ?? null
}

function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const b64 = base64url.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((base64url.length + 3) % 4)
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
}

/**
 * Pede permissão e inscreve este aparelho. Chamar direto no toque do botão: o iPhone só mostra o
 * pedido de permissão em resposta a um gesto, por isso a chave pública já deve estar carregada.
 */
export async function subscribe(publicKey: string): Promise<{ endpoint: string; p256dh: string; auth: string }> {
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') throw new Error('Permissão negada. Libere as notificações da Carteira nos Ajustes do aparelho.')
  const reg = await navigator.serviceWorker.ready
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) }))
  const keys = sub.toJSON().keys ?? {}
  if (!keys.p256dh || !keys.auth) throw new Error('O aparelho não devolveu as chaves da inscrição.')
  return { endpoint: sub.endpoint, p256dh: keys.p256dh, auth: keys.auth }
}

export async function unsubscribe(): Promise<string | null> {
  const sub = await currentSubscription()
  if (!sub) return null
  await sub.unsubscribe()
  return sub.endpoint
}
