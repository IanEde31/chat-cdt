'use client'

import type { CSSProperties } from 'react'

/**
 * The "command center" signal strip. All three vitals are real, scoped to the
 * human queue (NOT the 299 bot-owned conversations):
 *   - Aguardando: queued + unassigned
 *   - SLA estourado: of those, waiting ≥ 20 min
 *   - Em atendimento: open + assigned to a human
 */
export function QueueVitals({
  waiting,
  breached,
  active,
}: {
  waiting: number
  breached: number
  active: number
}) {
  return (
    <div className="mt-3 flex gap-5">
      <Vital label="Aguardando" value={waiting} hex="#fbbf24" />
      <Vital
        label="SLA estourado"
        value={breached}
        hex={breached > 0 ? '#f87171' : '#6b7280'}
        pulse={breached > 0}
      />
      <Vital label="Em atendimento" value={active} hex="#a3e635" />
    </div>
  )
}

function Vital({
  label,
  value,
  hex,
  pulse,
}: {
  label: string
  value: number
  hex: string
  pulse?: boolean
}) {
  const valueStyle: CSSProperties = { color: hex }
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-mono text-[8.5px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </span>
      <span
        className="flex items-center gap-1.5 text-[17px] font-extrabold leading-none tabular-nums"
        style={valueStyle}
      >
        {pulse && (
          <span
            className="live-dot size-1.5 rounded-full"
            style={{ backgroundColor: hex }}
            aria-hidden
          />
        )}
        {value}
      </span>
    </div>
  )
}
