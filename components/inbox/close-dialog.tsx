'use client'

import { useState } from 'react'
import { X } from 'lucide-react'

import {
  CLOSE_OUTCOMES,
  type CloseOutcome,
} from '@/app/(app)/inbox/outcomes'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

/**
 * Close dialog — forces a resolution outcome (the EXIT axis) before a
 * conversation can be closed. Used by the thread header and the bulk bar.
 */
export function CloseDialog({
  open,
  onOpenChange,
  count = 1,
  pending,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  /** How many conversations are being closed (>1 from the bulk bar). */
  count?: number
  pending?: boolean
  onConfirm: (outcome: CloseOutcome, note?: string) => void
}) {
  const [outcome, setOutcome] = useState<CloseOutcome | null>(null)
  const [note, setNote] = useState('')

  function reset() {
    setOutcome(null)
    setNote('')
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset()
        onOpenChange(v)
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <X className="size-4 text-muted-foreground" />
            {count > 1 ? `Encerrar ${count} atendimentos` : 'Encerrar atendimento'}
          </DialogTitle>
          <DialogDescription>
            Qual foi o desfecho? Isso alimenta as métricas de resolução.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-1.5">
          {CLOSE_OUTCOMES.map((o) => {
            const active = outcome === o.value
            return (
              <button
                key={o.value}
                type="button"
                onClick={() => setOutcome(o.value)}
                aria-pressed={active}
                className={cn(
                  'flex items-center gap-2.5 rounded-[10px] border px-3 py-2.5 text-left transition-colors',
                  active
                    ? 'border-accent bg-accent/10'
                    : 'border-border hover:border-accent/30 hover:bg-secondary',
                )}
              >
                <span
                  className={cn(
                    'flex size-4 shrink-0 items-center justify-center rounded-full border',
                    active ? 'border-accent' : 'border-muted-foreground/40',
                  )}
                >
                  {active && <span className="size-2 rounded-full bg-accent" />}
                </span>
                <span className="min-w-0">
                  <span className="block text-[13px] font-semibold text-foreground">
                    {o.label}
                  </span>
                  <span className="block text-[11px] text-muted-foreground">
                    {o.hint}
                  </span>
                </span>
              </button>
            )
          })}
        </div>

        <label className="block">
          <span className="mb-1 block font-mono text-[9px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Nota (opcional)
          </span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder="Detalhe rápido do atendimento…"
            className="w-full resize-none rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
          />
        </label>

        <div className="flex justify-end gap-2 pt-1">
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            Cancelar
          </Button>
          <Button
            onClick={() => outcome && onConfirm(outcome, note)}
            disabled={pending || !outcome}
          >
            {pending ? 'Encerrando…' : 'Encerrar'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
