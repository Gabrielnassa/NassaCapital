import { useEffect, useState } from 'react'
import { Button, ErrorNote, Field, Select } from '../components/ui'
import { deletePushSubscription, DEFAULT_SETTINGS, savePushSubscription, saveSettings, sendTestPush, usePushPublicKey, useSettings, useWrite } from '../lib/data'
import { currentSubscription, pushSupport, subscribe, unsubscribe } from '../lib/push'

const OFF = 'off'
const HOURS = Array.from({ length: 24 }, (_, h) => ({ value: String(h), label: `${h}h` }))

/** Lembrete diário: hora (vale para todos os aparelhos) e inscrição deste aparelho. */
export function ReminderForm() {
  const settings = useSettings()
  const prefs = settings.data ?? DEFAULT_SETTINGS
  const support = pushSupport()
  const publicKey = usePushPublicKey(support === 'ok')
  const [subscribed, setSubscribed] = useState<boolean | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const savePrefs = useWrite(saveSettings)
  const test = useWrite(sendTestPush)

  useEffect(() => {
    if (support !== 'ok') return
    currentSubscription().then((s) => setSubscribed(!!s)).catch(() => setSubscribed(false))
  }, [support])

  async function enable() {
    if (!publicKey.data) return
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      // Primeiro o pedido de permissão (precisa vir do toque); depois as gravações.
      const sub = await subscribe(publicKey.data)
      await savePushSubscription(sub)
      if (prefs.reminder_hour == null) await savePrefs.mutateAsync({ reminder_hour: 10 })
      setSubscribed(true)
      setMessage('Lembrete ativado neste aparelho.')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function disable() {
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const endpoint = await unsubscribe()
      if (endpoint) await deletePushSubscription(endpoint)
      setSubscribed(false)
      setMessage('Lembrete desativado neste aparelho.')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const status =
    support === 'install' ? 'No iPhone, abra a Carteira pelo ícone da tela inicial para ativar o lembrete.'
    : support === 'unsupported' ? 'Este navegador não recebe notificações.'
    : support === 'denied' ? 'As notificações da Carteira estão bloqueadas nos ajustes do aparelho.'
    : subscribed ? 'Ativo neste aparelho.'
    : subscribed === false ? 'Não ativado neste aparelho.'
    : ''

  return (
    <div className="flex flex-col gap-3 border-t border-border pt-3">
      <div className="text-sm font-medium">Lembrete diário</div>
      <Field label="Horário (Brasília)" hint="Avisa o que comprar no plano de DCA, só nos dias com compra.">
        <Select aria-label="Horário do lembrete" className="max-w-40"
          value={prefs.reminder_hour == null ? OFF : String(prefs.reminder_hour)}
          onChange={(v) => savePrefs.mutate({ reminder_hour: v === OFF ? null : Number(v) })}
          options={[{ value: OFF, label: 'Desligado' }, ...HOURS]} />
      </Field>
      {status && <p className="m-0 text-xs text-muted">{status}</p>}
      {support === 'ok' && (
        <div className="flex flex-wrap gap-2">
          {subscribed ? (
            <>
              <Button disabled={busy || test.isPending} onClick={() => test.mutate(undefined, {
                onSuccess: (r) => setMessage(r.sent ? 'Teste enviado. Deve chegar em alguns segundos.' : 'Nenhum aparelho recebeu o teste. Desative e ative de novo.'),
              })}>
                {test.isPending ? 'Enviando' : 'Enviar teste'}
              </Button>
              <Button variant="ghost" disabled={busy} onClick={disable}>Desativar neste aparelho</Button>
            </>
          ) : (
            <Button disabled={busy || !publicKey.data} onClick={enable}>
              {busy ? 'Ativando' : 'Ativar neste aparelho'}
            </Button>
          )}
        </div>
      )}
      {message && <p className="m-0 text-xs text-up">{message}</p>}
      {error && <p role="alert" className="m-0 text-xs text-down">{error}</p>}
      <ErrorNote error={publicKey.error ?? test.error ?? savePrefs.error} />
    </div>
  )
}
