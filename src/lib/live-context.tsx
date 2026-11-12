import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useAllocation, useAssets, usePositions } from './data'
import { allocationFromPositions, applyLive, FX_SYMBOL, parseTickerMessage, streamUrl, type LiveQuote } from './live'

interface LiveState {
  quotes: Map<string, LiveQuote>
  connected: boolean
}
const LiveContext = createContext<LiveState>({ quotes: new Map(), connected: false })

// Dois endereços públicos da Binance; se um não conecta, tenta o outro.
const HOSTS = ['wss://stream.binance.com:9443', 'wss://data-stream.binance.vision']

/** Mantém uma conexão com o stream de tickers da Binance para os pares cadastrados nos ativos. */
export function LiveProvider({ children }: { children: ReactNode }) {
  const assets = useAssets()
  const symbolsKey = [...new Set((assets.data ?? []).map((a) => a.binance_symbol).filter((s): s is string => !!s))].sort().join(',')
  const [state, setState] = useState<LiveState>({ quotes: new Map(), connected: false })

  useEffect(() => {
    if (!symbolsKey) return
    const symbols = [...symbolsKey.split(','), FX_SYMBOL]
    const buffer = new Map<string, LiveQuote>()
    let socket: WebSocket | null = null
    let retry: ReturnType<typeof setTimeout> | undefined
    let attempt = 0
    let closed = false
    let dirty = false

    const connect = () => {
      socket = new WebSocket(streamUrl(symbols, HOSTS[attempt % HOSTS.length]))
      socket.onopen = () => {
        attempt = 0
        setState((s) => ({ ...s, connected: true }))
      }
      socket.onmessage = (event) => {
        const parsed = typeof event.data === 'string' ? parseTickerMessage(event.data) : null
        if (parsed) {
          buffer.set(parsed.symbol, parsed.quote)
          dirty = true
        }
      }
      socket.onclose = () => {
        setState((s) => ({ ...s, connected: false }))
        if (closed) return
        attempt += 1
        retry = setTimeout(connect, Math.min(1000 * 2 ** Math.min(attempt, 5), 30_000))
      }
      socket.onerror = () => socket?.close()
    }
    connect()

    // A tela é atualizada no máximo uma vez por segundo, que é o ritmo do próprio stream.
    const flush = setInterval(() => {
      if (!dirty) return
      dirty = false
      setState((s) => ({ ...s, quotes: new Map(buffer) }))
    }, 1000)

    return () => {
      closed = true
      clearTimeout(retry)
      clearInterval(flush)
      socket?.close()
      setState({ quotes: new Map(), connected: false })
    }
  }, [symbolsKey])

  return <LiveContext.Provider value={state}>{children}</LiveContext.Provider>
}

/**
 * Carteira para as telas: posições e alocação do banco, com os preços da Binance por cima quando há
 * conexão. Sem conexão, vale o último preço gravado pelo servidor.
 */
// oxlint-disable-next-line react/only-export-components
export function usePortfolio() {
  const positions = usePositions()
  const allocation = useAllocation()
  const assets = useAssets()
  const live = useContext(LiveContext)

  const livePositions = useMemo(
    () => (positions.data && assets.data ? applyLive(positions.data, assets.data, live.quotes) : positions.data),
    [positions.data, assets.data, live.quotes],
  )
  const liveAllocation = useMemo(
    () => (allocation.data && livePositions && live.quotes.size > 0 ? allocationFromPositions(livePositions, allocation.data) : allocation.data),
    [allocation.data, livePositions, live.quotes],
  )
  return {
    positions: livePositions,
    allocation: liveAllocation,
    error: positions.error ?? allocation.error ?? assets.error,
    live: live.connected && live.quotes.size > 0,
  }
}
