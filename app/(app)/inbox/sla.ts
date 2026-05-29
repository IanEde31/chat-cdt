/**
 * Queue / SLA signal helpers for the inbox triage column.
 *
 * The SLA "clock" is the time a customer has been waiting since their last
 * inbound message (`last_inbound_at`). Thresholds mirror the design handoff:
 *   < 8 min  → healthy (lime)
 *   8–19 min → at risk (amber)
 *   ≥ 20 min → breached (red)
 *
 * Pure functions — safe on server and client. Time-dependent, so callers that
 * need live updates should re-render on an interval.
 */

export type SlaTone = 'healthy' | 'risk' | 'breached'

export const SLA_HEX: Record<SlaTone, string> = {
  healthy: '#a3e635',
  risk: '#fbbf24',
  breached: '#f87171',
}

/** Minutes since the last inbound message, or null when unknown. */
export function waitMinutes(
  lastInboundAt: string | null,
  now: number = Date.now(),
): number | null {
  if (!lastInboundAt) return null
  const t = new Date(lastInboundAt).getTime()
  if (Number.isNaN(t)) return null
  return Math.max(0, Math.floor((now - t) / 60_000))
}

export function slaTone(minutes: number | null): SlaTone | null {
  if (minutes == null) return null
  if (minutes >= 20) return 'breached'
  if (minutes >= 8) return 'risk'
  return 'healthy'
}

/** Compact wait label: "3m", "2h05". */
export function formatWait(minutes: number | null): string {
  if (minutes == null) return '—'
  if (minutes <= 0) return 'agora'
  if (minutes < 60) return `${minutes}m`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`
}
