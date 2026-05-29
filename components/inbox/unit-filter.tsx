'use client'

/**
 * Unit filter — the SINGLE source of truth for which unit the operator is
 * looking at. Lives above both the (global) sidebar and the inbox workspace
 * so the sidebar's UnitSelect drives the list filter without prop-drilling or
 * a URL round-trip (instant, no thread navigation side effects).
 *
 * Selection is persisted to localStorage so a refresh keeps the operator's
 * context. `null` means "Todas as unidades".
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

export type UnitOption = { id: string; code: string; name: string }

type UnitFilterValue = {
  units: UnitOption[]
  selectedUnitId: string | null
  selectedUnit: UnitOption | null
  setSelectedUnitId: (id: string | null) => void
}

const UnitFilterContext = createContext<UnitFilterValue | null>(null)
const STORAGE_KEY = 'chatcdt:selected-unit'

export function UnitFilterProvider({
  units,
  children,
}: {
  units: UnitOption[]
  children: ReactNode
}) {
  const [selectedUnitId, setState] = useState<string | null>(null)

  // Hydrate from localStorage on mount, validating against accessible units
  // (a stored unit the operator lost access to is silently ignored).
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY)
      if (stored && units.some((u) => u.id === stored)) setState(stored)
    } catch {
      /* localStorage unavailable (private mode / SSR) — ignore */
    }
  }, [units])

  const setSelectedUnitId = useCallback((id: string | null) => {
    setState(id)
    try {
      if (id) window.localStorage.setItem(STORAGE_KEY, id)
      else window.localStorage.removeItem(STORAGE_KEY)
    } catch {
      /* ignore */
    }
  }, [])

  const selectedUnit = useMemo(
    () => units.find((u) => u.id === selectedUnitId) ?? null,
    [units, selectedUnitId],
  )

  const value = useMemo(
    () => ({ units, selectedUnitId, selectedUnit, setSelectedUnitId }),
    [units, selectedUnitId, selectedUnit, setSelectedUnitId],
  )

  return (
    <UnitFilterContext.Provider value={value}>
      {children}
    </UnitFilterContext.Provider>
  )
}

export function useUnitFilter(): UnitFilterValue {
  const ctx = useContext(UnitFilterContext)
  if (!ctx)
    throw new Error('useUnitFilter must be used within a UnitFilterProvider')
  return ctx
}

/** Short, human label for a unit (drops trailing "001"/state suffixes noise). */
export function unitShortName(unit: UnitOption | null | undefined): string {
  if (!unit) return 'Todas as unidades'
  return unit.name?.trim() || unit.code?.toUpperCase() || '—'
}
