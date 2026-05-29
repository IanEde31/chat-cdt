'use client'

/**
 * Bespoke SVG/CSS chart primitives for the Relatórios dashboard. Custom (not a
 * chart lib) so everything sits inside the dark + lime design language. All
 * width-sensitive charts measure their container for crisp pixel rendering.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react'

import { cn } from '@/lib/utils'

export const LIME = '#a3e635'
const GRID = 'hsl(240 6% 90% / 0.08)'

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [w, setW] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      const cr = entries[0]?.contentRect
      if (cr) setW(cr.width)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, w] as const
}

// ---------------------------------------------------------------------------
// Number / duration helpers
// ---------------------------------------------------------------------------
export function fmtInt(n: number): string {
  return Math.round(n).toLocaleString('pt-BR')
}

export function fmtDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return '—'
  const s = Math.round(seconds)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) {
    const rs = s % 60
    return rs ? `${m}min ${rs}s` : `${m}min`
  }
  const h = Math.floor(m / 60)
  const rm = m % 60
  return rm ? `${h}h ${rm}min` : `${h}h`
}

// ---------------------------------------------------------------------------
// Section shell
// ---------------------------------------------------------------------------
export function Panel({
  title,
  subtitle,
  right,
  className,
  children,
}: {
  title?: string
  subtitle?: string
  right?: ReactNode
  className?: string
  children: ReactNode
}) {
  return (
    <div
      className={cn(
        'rounded-[16px] border border-border bg-card/60 p-4 sm:p-5',
        className,
      )}
    >
      {(title || right) && (
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            {title && (
              <h3 className="text-[14px] font-bold tracking-[-0.01em] text-foreground">
                {title}
              </h3>
            )}
            {subtitle && (
              <p className="mt-0.5 text-[11.5px] text-muted-foreground">
                {subtitle}
              </p>
            )}
          </div>
          {right && <div className="shrink-0">{right}</div>}
        </div>
      )}
      {children}
    </div>
  )
}

// ---------------------------------------------------------------------------
// KPI stat card
// ---------------------------------------------------------------------------
export function Stat({
  label,
  value,
  unit,
  hint,
  delta,
  tone = 'default',
  icon,
  big = false,
}: {
  label: string
  value: string
  unit?: string
  hint?: string
  delta?: { pct: number | null; positiveIsGood?: boolean }
  tone?: 'default' | 'accent' | 'warn' | 'danger'
  icon?: ReactNode
  big?: boolean
}) {
  const toneText =
    tone === 'accent'
      ? 'text-accent'
      : tone === 'warn'
        ? 'text-amber-400'
        : tone === 'danger'
          ? 'text-red-400'
          : 'text-foreground'

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-[14px] border bg-card/60 px-4 py-3.5',
        tone === 'accent' ? 'border-accent/30' : 'border-border',
      )}
    >
      {tone === 'accent' && (
        <div
          aria-hidden
          className="pointer-events-none absolute -right-6 -top-6 size-20 rounded-full opacity-20 blur-2xl"
          style={{ background: LIME }}
        />
      )}
      <div className="flex items-center gap-1.5">
        {icon && <span className={cn('shrink-0', toneText)}>{icon}</span>}
        <span className="font-mono text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          {label}
        </span>
      </div>
      <div className="mt-1.5 flex items-baseline gap-1">
        <span
          className={cn(
            'font-bold tabular-nums tracking-[-0.02em]',
            big ? 'text-[34px] leading-none' : 'text-[26px] leading-none',
            toneText,
          )}
        >
          {value}
        </span>
        {unit && (
          <span className="text-[13px] font-semibold text-muted-foreground">
            {unit}
          </span>
        )}
      </div>
      <div className="mt-1.5 flex items-center gap-2">
        {delta && <Delta pct={delta.pct} positiveIsGood={delta.positiveIsGood} />}
        {hint && (
          <span className="truncate text-[11px] text-muted-foreground">
            {hint}
          </span>
        )}
      </div>
    </div>
  )
}

export function Delta({
  pct,
  positiveIsGood = true,
}: {
  pct: number | null
  positiveIsGood?: boolean
}) {
  if (pct == null || !Number.isFinite(pct)) {
    return (
      <span className="font-mono text-[10px] text-muted-foreground/60">—</span>
    )
  }
  const up = pct > 0
  const good = up === positiveIsGood
  if (pct === 0) {
    return <span className="font-mono text-[10px] text-muted-foreground">0%</span>
  }
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 font-mono text-[10px] font-bold tabular-nums',
        good ? 'text-accent' : 'text-red-400',
      )}
    >
      {up ? '▲' : '▼'} {Math.abs(pct).toFixed(0)}%
    </span>
  )
}

// ---------------------------------------------------------------------------
// Area chart (demand curve, daily volume)
// ---------------------------------------------------------------------------
export function AreaChart({
  data,
  height = 150,
  color = LIME,
  xLabels,
  peakLabel,
}: {
  data: number[]
  height?: number
  color?: string
  /** Indices to label on the x-axis (e.g. [0,6,12,18,23]). */
  xLabels?: { at: number; text: string }[]
  /** Format the peak callout, given the peak index + value. */
  peakLabel?: (idx: number, value: number) => string
}) {
  const [ref, w] = useWidth<HTMLDivElement>()
  const H = height
  const padT = 14
  const padB = 4
  const n = data.length
  const max = Math.max(1, ...data)
  const peakIdx = data.reduce((b, v, i) => (v > data[b] ? i : b), 0)

  const X = (i: number) => (n <= 1 ? w / 2 : (i / (n - 1)) * w)
  const Y = (v: number) => padT + (1 - v / max) * (H - padT - padB)

  const line = data.map((v, i) => `${X(i)},${Y(v)}`).join(' ')
  const area = `M0,${H} L ${data.map((v, i) => `${X(i)},${Y(v)}`).join(' L ')} L ${w},${H} Z`
  const gid = 'areaGrad'

  return (
    <div>
      <div ref={ref} style={{ height: H }} className="relative w-full">
        {w > 0 && (
          <svg width={w} height={H} className="block">
            <defs>
              <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity="0.28" />
                <stop offset="100%" stopColor={color} stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d={area} fill={`url(#${gid})`} />
            <polyline
              points={line}
              fill="none"
              stroke={color}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {n > 0 && (
              <circle cx={X(peakIdx)} cy={Y(data[peakIdx])} r={3.5} fill={color} />
            )}
          </svg>
        )}
        {w > 0 && peakLabel && (
          <div
            className="pointer-events-none absolute -translate-x-1/2 rounded-full border border-accent/30 bg-card px-1.5 py-0.5 font-mono text-[9px] font-bold text-accent"
            style={{
              left: Math.min(Math.max(X(peakIdx), 30), w - 30),
              top: Math.max(Y(data[peakIdx]) - 22, 0),
            }}
          >
            {peakLabel(peakIdx, data[peakIdx])}
          </div>
        )}
      </div>
      {xLabels && (
        <div className="relative mt-1 h-3">
          {xLabels.map((l) => (
            <span
              key={l.at}
              className="absolute -translate-x-1/2 font-mono text-[8.5px] text-muted-foreground"
              style={{ left: n <= 1 ? '50%' : `${(l.at / (n - 1)) * 100}%` }}
            >
              {l.text}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Horizontal bar list
// ---------------------------------------------------------------------------
export function BarList({
  rows,
}: {
  rows: {
    key: string
    label: string
    value: number
    valueText?: string
    sub?: string
    color?: string
    highlight?: boolean
  }[]
}) {
  const max = Math.max(1, ...rows.map((r) => r.value))
  return (
    <div className="flex flex-col gap-2.5">
      {rows.map((r) => (
        <div key={r.key}>
          <div className="mb-1 flex items-center justify-between gap-2">
            <span className="flex min-w-0 items-center gap-1.5 text-[12.5px] text-foreground">
              {r.color && (
                <span
                  className="size-2 shrink-0 rounded-full"
                  style={{ backgroundColor: r.color }}
                />
              )}
              <span className="truncate">{r.label}</span>
              {r.highlight && (
                <span className="shrink-0 rounded-full bg-amber-500/15 px-1.5 font-mono text-[8.5px] font-bold uppercase tracking-wider text-amber-400">
                  outlier
                </span>
              )}
            </span>
            <span className="shrink-0 font-mono text-[11.5px] font-bold tabular-nums text-foreground">
              {r.valueText ?? fmtInt(r.value)}
              {r.sub && (
                <span className="ml-1 font-normal text-muted-foreground">
                  {r.sub}
                </span>
              )}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${(r.value / max) * 100}%`,
                backgroundColor: r.color ?? LIME,
                opacity: r.highlight ? 1 : 0.85,
              }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Ring (single percentage)
// ---------------------------------------------------------------------------
export function Ring({
  pct,
  size = 132,
  stroke = 12,
  color = LIME,
  centerTop,
  centerBottom,
}: {
  pct: number
  size?: number
  stroke?: number
  color?: string
  centerTop: string
  centerBottom: string
}) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const dash = (Math.min(100, Math.max(0, pct)) / 100) * c
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={GRID}
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c}`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[28px] font-bold leading-none tabular-nums text-foreground">
          {centerTop}
        </span>
        <span className="mt-1 font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
          {centerBottom}
        </span>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Funnel (3 stages)
// ---------------------------------------------------------------------------
export function Funnel({
  stages,
}: {
  stages: { label: string; value: number; color: string }[]
}) {
  const max = Math.max(1, ...stages.map((s) => s.value))
  return (
    <div className="flex flex-col gap-2">
      {stages.map((s, i) => {
        const prev = i === 0 ? null : stages[i - 1].value
        const conv =
          prev && prev > 0 ? Math.round((s.value / prev) * 100) : null
        return (
          <div key={s.label} className="flex items-center gap-3">
            <span className="w-20 shrink-0 font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
              {s.label}
            </span>
            <div className="relative h-8 flex-1 overflow-hidden rounded-lg bg-secondary">
              <div
                className="flex h-full items-center justify-end rounded-lg px-2 transition-all"
                style={{
                  width: `${Math.max((s.value / max) * 100, 6)}%`,
                  backgroundColor: s.color,
                  opacity: 0.85,
                }}
              >
                <span className="text-[12px] font-bold tabular-nums text-background">
                  {fmtInt(s.value)}
                </span>
              </div>
            </div>
            <span className="w-10 shrink-0 text-right font-mono text-[10px] tabular-nums text-muted-foreground">
              {conv != null ? `${conv}%` : ''}
            </span>
          </div>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Empty state (for sections with no data yet)
// ---------------------------------------------------------------------------
export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-[120px] flex-col items-center justify-center gap-1.5 rounded-[12px] border border-dashed border-border/70 px-6 py-8 text-center">
      <p className="text-[12.5px] text-muted-foreground">{children}</p>
    </div>
  )
}
