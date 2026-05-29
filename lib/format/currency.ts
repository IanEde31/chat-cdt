/**
 * Brazilian Real formatting. Single source of truth for BRL across the app.
 */
export function formatBRL(
  value: number | null | undefined,
  opts?: { cents?: boolean },
): string {
  if (value == null || Number.isNaN(value)) return '—'
  const cents = opts?.cents !== false
  return value.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: cents ? 2 : 0,
    maximumFractionDigits: cents ? 2 : 0,
  })
}

/**
 * Compact BRL for tight spots (e.g. queue vitals): "R$ 12,3 mil", "R$ 1,2 mi".
 * Falls back to full formatting under 1.000.
 */
export function formatBRLCompact(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return '—'
  const abs = Math.abs(value)
  if (abs >= 1_000_000)
    return `R$ ${(value / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi`
  if (abs >= 1_000)
    return `R$ ${(value / 1_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil`
  return formatBRL(value, { cents: false })
}
