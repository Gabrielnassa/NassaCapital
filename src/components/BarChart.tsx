import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react'
import { niceTicks } from '../lib/calc/evolution'
import { ZERO, type Dec } from '../lib/calc/money'

/**
 * Barras de ganho ou perda a partir do zero, uma por dia. Acima da linha do zero = ganho
 * (verde), abaixo = perda (vermelho). A cor nunca é a única pista: a direção da barra e o
 * rótulo com sinal dizem o mesmo. Rótulo em cada barra quando cabe; dica ao tocar ou passar o mouse.
 */
export function BarChart(props: {
  labels: string[]
  values: Dec[]
  /** rótulo curto escrito na ponta da barra, ex.: "−R$ 799" */
  formatLabel: (v: Dec) => string
  formatAxis: (v: Dec) => string
  tooltip: (i: number) => ReactNode
  'aria-label': string
}) {
  const box = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(640)
  const [hover, setHover] = useState<number | null>(null)
  useEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(280, Math.round(e.contentRect.width))))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const n = props.values.length
  const height = 240
  const pad = { top: 22, right: 8, bottom: 42, left: 72 }
  const plotW = width - pad.left - pad.right
  const plotH = height - pad.top - pad.bottom
  const min = props.values.reduce((a, b) => (b.lt(a) ? b : a), ZERO)
  const max = props.values.reduce((a, b) => (b.gt(a) ? b : a), ZERO)
  const ticks = niceTicks(min, max)
  const lo = ticks[0], hi = ticks.at(-1)!
  const y = (v: Dec) => pad.top + (1 - v.minus(lo).div(hi.minus(lo)).toNumber()) * plotH
  const band = plotW / Math.max(n, 1)
  const barW = Math.max(6, Math.min(56, band * 0.62))
  const cx = (i: number) => pad.left + band * i + band / 2
  const zeroY = y(ZERO)
  // Rótulo em todas as barras quando cabe; senão só na última, na maior e na menor.
  const roomy = band >= 46
  const extremes = new Set([n - 1, props.values.indexOf(max), props.values.indexOf(min)])
  const labelEvery = Math.max(1, Math.ceil(36 / band))

  /** Retângulo com cantos de 4px só na ponta da barra (o lado do zero fica reto). */
  function barPath(i: number) {
    const v = props.values[i]
    const x0 = cx(i) - barW / 2, x1 = cx(i) + barW / 2
    const end = y(v)
    const h = Math.abs(end - zeroY)
    if (h < 0.5) return `M${x0},${zeroY - 0.5}H${x1}V${zeroY + 0.5}H${x0}Z`
    const r = Math.min(4, h, barW / 2)
    return v.gt(0)
      ? `M${x0},${zeroY}V${end + r}Q${x0},${end} ${x0 + r},${end}H${x1 - r}Q${x1},${end} ${x1},${end + r}V${zeroY}Z`
      : `M${x0},${zeroY}V${end - r}Q${x0},${end} ${x0 + r},${end}H${x1 - r}Q${x1},${end} ${x1},${end - r}V${zeroY}Z`
  }

  function move(e: PointerEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    const i = Math.floor((e.clientX - rect.left - pad.left) / band)
    setHover(i >= 0 && i < n ? i : null)
  }

  return (
    <div ref={box} className="relative">
      <svg width={width} height={height} role="img" aria-label={props['aria-label']} className="block touch-none select-none"
        onPointerMove={move} onPointerDown={move} onPointerLeave={() => setHover(null)}>
        {ticks.map((t) => (
          <g key={t.toFixed()}>
            <line x1={pad.left} x2={width - pad.right} y1={y(t)} y2={y(t)} stroke={t.isZero() ? 'var(--border-strong)' : 'var(--border)'} strokeWidth="1" />
            <text x={pad.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="num" fontSize="11" fill="var(--muted)">{props.formatAxis(t)}</text>
          </g>
        ))}
        {props.values.map((v, i) => {
          const up = v.gt(0)
          const showLabel = roomy || extremes.has(i) || hover === i
          return (
            <g key={props.labels[i]} opacity={hover == null || hover === i ? 1 : 0.55}>
              <path d={barPath(i)} fill={v.isZero() ? 'var(--faint)' : up ? 'var(--up)' : 'var(--down)'} />
              {showLabel && (
                <text x={cx(i)} y={up ? y(v) - 6 : y(v) + 6} dy={up ? '0' : '0.8em'} textAnchor="middle" className="num" fontSize="11" fontWeight="500" fill="var(--text)">
                  {props.formatLabel(v)}
                </text>
              )}
              {i % labelEvery === 0 && (
                <text x={cx(i)} y={height - 8} textAnchor="middle" className="num" fontSize="11" fill="var(--muted)">{props.labels[i]}</text>
              )}
            </g>
          )
        })}
      </svg>
      {hover != null && (
        <div className="pointer-events-none absolute top-2 z-10 min-w-44 rounded-md border border-border-strong bg-surface px-2.5 py-2 text-xs"
          style={cx(hover) > width / 2 ? { right: width - cx(hover) + barW / 2 + 6 } : { left: cx(hover) + barW / 2 + 6 }}>
          {props.tooltip(hover)}
        </div>
      )}
    </div>
  )
}
