// Agrupamento da carteira em dois níveis: Cripto (Bitcoin, Altcoins, Stablecoins), Bolsa
// (Ações, FIIs, ETFs) e Caixa. Sai da classe do ativo; Bitcoin é reconhecido pelo ID do CoinGecko.
import Decimal from 'decimal.js'

export type Group = 'crypto' | 'market' | 'cash'
export type Segment = 'bitcoin' | 'altcoin' | 'stable' | 'stock' | 'fii' | 'etf' | 'cash'

export const SEGMENTS: { id: Segment; group: Group; label: string }[] = [
  { id: 'bitcoin', group: 'crypto', label: 'Bitcoin' },
  { id: 'altcoin', group: 'crypto', label: 'Altcoins' },
  { id: 'stable', group: 'crypto', label: 'Stablecoins' },
  { id: 'stock', group: 'market', label: 'Ações' },
  { id: 'fii', group: 'market', label: 'FIIs' },
  { id: 'etf', group: 'market', label: 'ETFs' },
  { id: 'cash', group: 'cash', label: 'Caixa' },
]
export const GROUPS: { id: Group; label: string }[] = [
  { id: 'crypto', label: 'Cripto' },
  { id: 'market', label: 'Bolsa' },
  { id: 'cash', label: 'Caixa' },
]
export const SEGMENT_LABEL = Object.fromEntries(SEGMENTS.map((s) => [s.id, s.label])) as Record<Segment, string>

export interface SegmentInput {
  class: 'crypto' | 'stock' | 'fii' | 'etf' | 'stable' | 'cash'
  ticker: string
  source_id?: string | null
}

export function segmentOf(asset: SegmentInput): Segment {
  if (asset.class !== 'crypto') return asset.class
  // Sem ID do CoinGecko (ativo manual), vale o ticker.
  const isBitcoin = asset.source_id ? asset.source_id === 'bitcoin' : asset.ticker === 'BTC'
  return isBitcoin ? 'bitcoin' : 'altcoin'
}

export const groupOf = (segment: Segment): Group => SEGMENTS.find((s) => s.id === segment)!.group

/**
 * Multiplicador padrão do simulador: quanto o ativo se move para cada 1% do Bitcoin.
 * É uma hipótese de partida, editável por ativo: altcoins costumam amplificar o movimento do BTC,
 * stablecoins e caixa não acompanham, e a bolsa é tratada como independente.
 */
export function defaultBeta(segment: Segment): Decimal {
  if (segment === 'bitcoin') return new Decimal(1)
  if (segment === 'altcoin') return new Decimal('1.5')
  return new Decimal(0)
}
