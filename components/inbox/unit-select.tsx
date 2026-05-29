'use client'

/**
 * Unit selector — the single control for the unit filter, living in the
 * sidebar. Custom dropdown (not the shadcn Select) to match the design:
 * colored dot per unit, "Todas as unidades" with a Users icon, code subtitle.
 */

import { Check, ChevronDown, Users } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { cn } from '@/lib/utils'
import { unitColor } from '@/lib/unit-colors'

import { useUnitFilter, unitShortName } from './unit-filter'

export function UnitSelect() {
  const { units, selectedUnitId, selectedUnit, setSelectedUnitId } =
    useUnitFilter()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)

  // Close on outside click + Escape.
  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node))
        setOpen(false)
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

  const isAll = selectedUnitId == null
  const selColor = selectedUnit ? unitColor(selectedUnit.id).solid : undefined

  return (
    <div className="relative" ref={rootRef}>
      <span className="block px-1 pb-1.5 font-mono text-[9px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        Unidade
      </span>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(
          'flex w-full items-center gap-2 rounded-[9px] border bg-secondary px-2.5 py-2 text-left text-[13px] transition-colors',
          open ? 'border-accent/45' : 'border-border hover:border-accent/30',
        )}
      >
        {isAll ? (
          <Users className="size-3.5 shrink-0 text-muted-foreground" />
        ) : (
          <span
            className="size-2 shrink-0 rounded-full"
            style={{ backgroundColor: selColor }}
            aria-hidden
          />
        )}
        <span className="min-w-0 flex-1 truncate font-medium text-foreground">
          {unitShortName(selectedUnit)}
        </span>
        <ChevronDown
          className={cn(
            'size-3.5 shrink-0 text-muted-foreground transition-transform',
            open && 'rotate-180',
          )}
        />
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute left-0 right-0 top-[calc(100%+5px)] z-50 max-h-80 overflow-y-auto rounded-[10px] border border-border bg-card p-1 shadow-[0_14px_36px_rgba(0,0,0,0.55)]"
        >
          <UnitRow
            label="Todas as unidades"
            active={isAll}
            icon={<Users className="size-3.5 text-muted-foreground" />}
            onSelect={() => {
              setSelectedUnitId(null)
              setOpen(false)
            }}
          />
          {units.length > 0 && (
            <div className="my-1 h-px bg-border" aria-hidden />
          )}
          {units.map((u) => (
            <UnitRow
              key={u.id}
              label={unitShortName(u)}
              code={u.code?.toUpperCase()}
              dot={unitColor(u.id).solid}
              active={selectedUnitId === u.id}
              onSelect={() => {
                setSelectedUnitId(u.id)
                setOpen(false)
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function UnitRow({
  label,
  code,
  dot,
  icon,
  active,
  onSelect,
}: {
  label: string
  code?: string
  dot?: string
  icon?: React.ReactNode
  active: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={active}
      onClick={onSelect}
      className={cn(
        'flex w-full items-center gap-2 rounded-[7px] px-2 py-2 text-left text-[13px] transition-colors',
        active
          ? 'bg-accent/10 text-accent'
          : 'text-foreground hover:bg-secondary',
      )}
    >
      {dot ? (
        <span
          className="size-2 shrink-0 rounded-full"
          style={{ backgroundColor: dot }}
          aria-hidden
        />
      ) : (
        <span className="shrink-0">{icon}</span>
      )}
      <span className="min-w-0 flex-1 truncate font-medium">{label}</span>
      {code && (
        <span className="shrink-0 font-mono text-[8.5px] tracking-[0.02em] text-muted-foreground">
          {code}
        </span>
      )}
      {active && <Check className="size-3.5 shrink-0" />}
    </button>
  )
}
