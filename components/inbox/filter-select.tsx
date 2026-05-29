'use client'

/**
 * Custom single-select dropdown for the inbox filters. A native <select> can't
 * style its option popup (the OS renders it — square, bright highlight), so we
 * mirror the UnitSelect pattern: a pill trigger + an absolute listbox styled to
 * match the dark/accent design system.
 */

import { Check, ChevronDown } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { cn } from '@/lib/utils'

export type FilterOption = { value: string; label: string }

export function FilterSelect({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: string
  options: FilterOption[]
  onChange: (value: string) => void
  ariaLabel: string
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  const selected = options.find((o) => o.value === value) ?? options[0]
  const isDefault = value === options[0]?.value

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full border bg-secondary/40 py-1 pl-2.5 pr-1.5 font-mono text-[10.5px] font-semibold uppercase tracking-[0.04em] transition-colors',
          isDefault
            ? 'border-border text-muted-foreground hover:border-accent/30'
            : 'border-accent/40 text-accent',
        )}
      >
        <span className="max-w-[150px] truncate">{selected?.label}</span>
        <ChevronDown
          className={cn(
            'size-3 shrink-0 transition-transform',
            open && 'rotate-180',
          )}
        />
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute left-0 top-[calc(100%+5px)] z-50 max-h-72 min-w-[180px] overflow-y-auto rounded-[10px] border border-border bg-card p-1 shadow-[0_14px_36px_rgba(0,0,0,0.55)]"
        >
          {options.map((o) => {
            const active = o.value === value
            return (
              <button
                key={o.value}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => {
                  onChange(o.value)
                  setOpen(false)
                }}
                className={cn(
                  'flex w-full items-center gap-2 rounded-[7px] px-2 py-1.5 text-left text-[12px] font-medium transition-colors',
                  active
                    ? 'bg-accent/10 text-accent'
                    : 'text-foreground hover:bg-secondary',
                )}
              >
                <span className="min-w-0 flex-1 truncate">{o.label}</span>
                {active && <Check className="size-3.5 shrink-0" />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
