'use client'

import { UserCheck, X, XCircle } from 'lucide-react'

import { cn } from '@/lib/utils'

const pill =
  'inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 font-mono text-[10.5px] font-semibold uppercase tracking-[0.05em] text-foreground transition-colors hover:border-accent/50 hover:text-accent'

export function BulkActionBar({
  count,
  onAssign,
  onClose,
  onClear,
}: {
  count: number
  onAssign: () => void
  onClose: () => void
  onClear: () => void
}) {
  return (
    <div className="flex shrink-0 items-center gap-2.5 border-y border-border bg-accent/[0.06] px-[18px] py-2">
      <span className="font-mono text-[11px] font-bold text-accent">
        {count} selecionada{count > 1 ? 's' : ''}
      </span>
      <button type="button" onClick={onAssign} className={pill}>
        <UserCheck className="size-3" />
        Atribuir a mim
      </button>
      <button type="button" onClick={onClose} className={cn(pill)}>
        <XCircle className="size-3" />
        Encerrar
      </button>
      <button
        type="button"
        onClick={onClear}
        aria-label="Limpar seleção"
        className="ml-auto text-muted-foreground transition-colors hover:text-foreground"
      >
        <X className="size-3.5" />
      </button>
    </div>
  )
}
