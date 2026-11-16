import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { niceTicks } from '../lib/calc/evolution'
import type { Dec } from '../lib/calc/money'

export interface Series {
  id: string
  label: string
  /** var(--accent) para a série principal; var(--chart-ref) para referência (tracejada) */
  color: string
  dashed?: boolean
  values: Dec[]
}

/**
 * Gráfico de linhas com um eixo só, grade discreta, rótulo direto no fim de cada linha, legenda,
 * e cruz + dica ao passar o mouse ou o dedo. Sem animação.
 */
export function LineChart(props: {
  labels: string[]
  series: Series[]
  format: (v: Dec) => string
  formatAxis: (v: Dec) => string
  tooltipTitle: (i: number) => string
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

  const height = 220
  const narrow = width < 480
  const pad = { top: 12, right: narrow ? 16 : 84, bottom: 24, left: 78 }
  const n = props.labels.length
  const all = props.series.flatMap((s) => s.values)
  const ticks = niceTicks(all.reduce((a, b) => (b.lt(a) ? b : a)), all.reduce((a, b) => (b.gt(a) ? b : a)))
  const lo = ticks[0], hi = ticks.at(-1)!
  const x = (i: number) => pad.left + (n === 1 ? (width - pad.left - pad.right) / 2 : (i / (n - 1)) * (width - pad.left - pad.right))
  const y = (v: Dec) => pad.top + (1 - v.minus(lo).div(hi.minus(lo)).toNumber()) * (height - pad.top - pad.bottom)
  const path = (s: Series) => s.values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('')

  function move(e: PointerEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    const px = e.clientX - rect.left
    let best = 0
    for (let i = 1; i < n; i++) if (Math.abs(x(i) - px) < Math.abs(x(best) - px)) best = i
    setHover(best)
  }
  const labelEvery = Math.max(1, Math.ceil(n / Math.floor((width - pad.left - pad.right) / 64)))

  return (
    <div ref={box} className="relative">
      <ul className="m-0 mb-2 flex list-none gap-4 p-0 text-xs text-muted">
        {props.series.map((s) => (
          <li key={s.id} className="inline-flex items-center gap-1.5">
            <svg width="16" height="8" aria-hidden><line x1="0" y1="4" x2="16" y2="4" stroke={s.color} strokeWidth="2" strokeDasharray={s.dashed ? '4 3' : undefined} /></svg>
            {s.label}
          </li>
        ))}
      </ul>
      <svg width={width} height={height} role="img" aria-label={props['aria-label']} className="block touch-none select-none"
        onPointerMove={move} onPointerDown={move} onPointerLeave={() => setHover(null)}>
        {ticks.map((t) => (
          <g key={t.toFixed()}>
            <line x1={pad.left} x2={width - pad.right} y1={y(t)} y2={y(t)} stroke="var(--border)" strokeWidth="1" />
            <text x={pad.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="num" fontSize="11" fill="var(--muted)">{props.formatAxis(t)}</text>
          </g>
        ))}
        {props.labels.map((l, i) => i % labelEvery === 0 && (
          <text key={l} x={x(i)} y={height - 6} textAnchor="middle" className="num" fontSize="11" fill="var(--muted)">{l}</text>
        ))}
        {hover != null && <line x1={x(hover)} x2={x(hover)} y1={pad.top} y2={height - pad.bottom} stroke="var(--border-strong)" strokeWidth="1" />}
        {props.series.map((s) => (
          <g key={s.id}>
            <path d={path(s)} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" strokeDasharray={s.dashed ? '5 4' : undefined} />
            {s.values.map((v, i) => (
              <circle key={i} cx={x(i)} cy={y(v)} r={hover === i ? 5 : n <= 31 ? 3 : 0} fill={s.color} stroke="var(--surface)" strokeWidth="2" />
            ))}
            {!narrow && <text x={x(n - 1) + 8} y={y(s.values[n - 1])} dy="0.32em" fontSize="12" fill="var(--text)" fontWeight={s.dashed ? 400 : 600}>{s.label}</text>}
          </g>
        ))}
      </svg>
      {hover != null && (
        <div className="pointer-events-none absolute top-6 z-10 min-w-40 rounded-md border border-border-strong bg-surface px-2.5 py-2 text-xs"
          style={x(hover) > width / 2 ? { right: width - x(hover) + 10 } : { left: x(hover) + 10 }}>
          <div className="num mb-1 font-medium">{props.tooltipTitle(hover)}</div>
          {props.series.map((s) => (
            <div key={s.id} className="flex items-center justify-between gap-4">
              <span className="inline-flex items-center gap-1.5 text-muted">
                <svg width="12" height="8" aria-hidden><line x1="0" y1="4" x2="12" y2="4" stroke={s.color} strokeWidth="2" strokeDasharray={s.dashed ? '3 2' : undefined} /></svg>
                {s.label}
              </span>
              <span className="num">{props.format(s.values[hover])}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
