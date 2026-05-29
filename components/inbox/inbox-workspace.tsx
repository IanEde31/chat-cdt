'use client'

import { usePathname, useRouter } from 'next/navigation'
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from 'react'
import { toast } from 'sonner'

import {
  bulkAssignToMe,
  bulkClose,
} from '@/app/(app)/inbox/[id]/actions'
import {
  matchesSearch,
  matchesTab,
  sortItems,
  type ConversationListItem,
  type ConversationRow,
  type InboxTab,
} from '@/app/(app)/inbox/list-data'
import { extractPreview } from '@/app/(app)/inbox/preview'
import { waitMinutes } from '@/app/(app)/inbox/sla'
import { createClient } from '@/lib/supabase/client'

import { InboxListColumn } from './inbox-list-column'
import { useUnitFilter } from './unit-filter'

type MessageRow = {
  id: string
  conversation_id: string
  payload: Record<string, unknown> | null
  direction: 'in' | 'out'
  created_at: string
  type: string | null
}

export function InboxWorkspace({
  initial,
  userId,
  children,
}: {
  initial: ConversationListItem[]
  userId: string
  children: React.ReactNode
}) {
  const [items, setItems] = useState<ConversationListItem[]>(initial)
  const [tab, setTab] = useState<InboxTab>('queued')
  const [search, setSearch] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [, startTransition] = useTransition()

  const router = useRouter()
  const pathname = usePathname()
  const { selectedUnitId } = useUnitFilter()

  // Server data is authoritative on (re)entry / refresh.
  useEffect(() => {
    setItems(initial)
  }, [initial])

  // Active conversation id, derived from the URL (thread route).
  const activeId = useMemo(() => {
    const m = /^\/inbox\/([^/]+)/.exec(pathname)
    return m ? m[1] : null
  }, [pathname])

  // -- Realtime: keep the whole working set in sync (membership, not tab) ----
  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel('inbox-workspace')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'conversations' },
        (payload) => {
          const eventType = payload.eventType as
            | 'INSERT'
            | 'UPDATE'
            | 'DELETE'
          if (eventType === 'DELETE') {
            const old = payload.old as { id?: string } | null
            if (old?.id) setItems((c) => c.filter((x) => x.id !== old.id))
            return
          }
          const next = payload.new as ConversationRow | null
          if (!next) return
          setItems((curr) => {
            const idx = curr.findIndex((c) => c.id === next.id)
            if (idx === -1) {
              // New conversation we haven't seen. Add a stub (realtime payload
              // lacks joined contact/unit) — degrades gracefully; a future
              // navigation refreshes the server data.
              const stub: ConversationListItem = {
                id: next.id,
                unit_id: next.unit_id,
                status: next.status,
                routing: next.routing,
                handoff_reason: next.handoff_reason,
                priority: next.priority,
                last_inbound_at: next.last_inbound_at,
                customer_window_expires_at: next.customer_window_expires_at,
                assigned_operator_id: next.assigned_operator_id,
                contact: null,
                unit: null,
                preview: null,
              }
              return sortItems([stub, ...curr])
            }
            // Merge scalar fields, preserve joined contact/unit + preview.
            const merged: ConversationListItem = {
              ...curr[idx],
              unit_id: next.unit_id,
              status: next.status,
              routing: next.routing,
              handoff_reason: next.handoff_reason,
              priority: next.priority,
              last_inbound_at: next.last_inbound_at,
              customer_window_expires_at: next.customer_window_expires_at,
              assigned_operator_id: next.assigned_operator_id,
            }
            const copy = [...curr]
            copy[idx] = merged
            return sortItems(copy)
          })
        },
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload) => {
          const msg = payload.new as MessageRow | null
          if (!msg) return
          setItems((curr) => {
            const idx = curr.findIndex((c) => c.id === msg.conversation_id)
            if (idx === -1) return curr
            const { text, kind } = extractPreview(msg.payload, msg.type)
            const copy = [...curr]
            copy[idx] = {
              ...curr[idx],
              preview: {
                text,
                kind,
                direction: msg.direction,
                createdAt: msg.created_at,
              },
              last_inbound_at:
                msg.direction === 'in'
                  ? msg.created_at
                  : curr[idx].last_inbound_at,
            }
            return sortItems(copy)
          })
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  // -- Derived: per-unit set, tab counts, vitals, visible rows ---------------
  const unitScoped = useMemo(
    () =>
      selectedUnitId
        ? items.filter((c) => c.unit_id === selectedUnitId)
        : items,
    [items, selectedUnitId],
  )

  const counts = useMemo(() => {
    const c: Record<InboxTab, number> = {
      queued: 0,
      mine: 0,
      all: 0,
      closed: 0,
    }
    for (const it of unitScoped) {
      if (matchesTab(it, 'queued', userId)) c.queued++
      if (matchesTab(it, 'mine', userId)) c.mine++
      if (matchesTab(it, 'all', userId)) c.all++
      if (matchesTab(it, 'closed', userId)) c.closed++
    }
    return c
  }, [unitScoped, userId])

  const vitals = useMemo(() => {
    let waiting = 0
    let breached = 0
    let active = 0
    for (const it of unitScoped) {
      if (matchesTab(it, 'queued', userId)) {
        waiting++
        const w = waitMinutes(it.last_inbound_at)
        if (w != null && w >= 20) breached++
      }
      if (
        it.status === 'open' &&
        it.routing === 'human' &&
        it.assigned_operator_id !== null
      ) {
        active++
      }
    }
    return { waiting, breached, active }
  }, [unitScoped, userId])

  const rows = useMemo(() => {
    return sortItems(
      unitScoped.filter(
        (c) => matchesTab(c, tab, userId) && matchesSearch(c, search),
      ),
    )
  }, [unitScoped, tab, userId, search])

  // -- Keyboard J/K navigation within the visible rows -----------------------
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return
      const k = e.key
      if (k !== 'j' && k !== 'k' && k !== 'ArrowDown' && k !== 'ArrowUp') return
      if (rows.length === 0) return
      e.preventDefault()
      const idx = rows.findIndex((r) => r.id === activeId)
      const dir = k === 'j' || k === 'ArrowDown' ? 1 : -1
      const nextIdx =
        idx === -1
          ? dir === 1
            ? 0
            : rows.length - 1
          : Math.min(Math.max(idx + dir, 0), rows.length - 1)
      const target = rows[nextIdx]
      if (target) router.push(`/inbox/${target.id}`)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [rows, activeId, router])

  // -- Selection -------------------------------------------------------------
  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])
  const clearSelection = useCallback(() => setSelectedIds(new Set()), [])

  const runBulk = useCallback(
    (
      label: string,
      action: (ids: string[]) => Promise<{ error?: string }>,
    ) => {
      const ids = Array.from(selectedIds)
      if (ids.length === 0) return
      startTransition(async () => {
        const r = await action(ids)
        if (r?.error) toast.error(`${label}: ${r.error}`)
        else toast.success(`${label} (${ids.length})`)
        clearSelection()
      })
    },
    [selectedIds, clearSelection],
  )

  return (
    <div className="flex min-h-0 flex-1">
      <InboxListColumn
        rows={rows}
        counts={counts}
        vitals={vitals}
        tab={tab}
        onTab={setTab}
        search={search}
        onSearch={setSearch}
        activeId={activeId}
        selectedIds={selectedIds}
        onToggleSelect={toggleSelect}
        onClearSelection={clearSelection}
        onBulkAssign={() => runBulk('Atribuídas a você', bulkAssignToMe)}
        onBulkClose={() => runBulk('Encerradas', bulkClose)}
      />
      <section className="relative flex min-w-0 flex-1 overflow-hidden">
        {children}
      </section>
    </div>
  )
}
