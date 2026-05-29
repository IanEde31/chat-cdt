/**
 * Shared types + filtering/sorting for the inbox list. Used by the server
 * working-set fetch (layout) and the client workspace (filtering + realtime).
 *
 * Filtering is CLIENT-SIDE: the layout fetches the operator's working set once
 * (all open + recent closed, RLS-scoped to their units) and the workspace
 * filters by tab/unit/search instantly — no server round-trip per click.
 */

import type { MessagePreview } from './preview'

export type InboxTab = 'queued' | 'mine' | 'all' | 'closed'

export const INBOX_TABS: { value: InboxTab; label: string }[] = [
  { value: 'queued', label: 'Aguardando' },
  { value: 'mine', label: 'Meus' },
  { value: 'all', label: 'Todos' },
  { value: 'closed', label: 'Encerrados' },
]

export type ConversationListItem = {
  id: string
  unit_id: string | null
  status: 'open' | 'snoozed' | 'closed'
  routing: 'ai' | 'queued' | 'human'
  handoff_reason: 'payment_re_register' | 'cancel' | 'other_support' | null
  priority: number
  last_inbound_at: string | null
  customer_window_expires_at: string | null
  assigned_operator_id: string | null
  contact: { id: string; wa_id: string; name: string | null } | null
  unit: { id: string; code: string; name: string } | null
  preview: MessagePreview | null
}

/** Minimal realtime row payload (no joins). */
export type ConversationRow = {
  id: string
  unit_id: string | null
  status: ConversationListItem['status']
  routing: ConversationListItem['routing']
  handoff_reason: ConversationListItem['handoff_reason']
  priority: number
  last_inbound_at: string | null
  customer_window_expires_at: string | null
  assigned_operator_id: string | null
}

/**
 * Tab membership. `userId` is the auth uid — `assigned_operator_id` stores the
 * auth uid (see actions.assignToMe), so "Meus" must compare against it.
 */
export function matchesTab(
  row: Pick<
    ConversationListItem,
    'status' | 'routing' | 'assigned_operator_id'
  >,
  tab: InboxTab,
  userId: string,
): boolean {
  if (tab === 'queued') {
    return (
      row.status === 'open' &&
      (row.routing === 'queued' || row.routing === 'human') &&
      row.assigned_operator_id === null
    )
  }
  if (tab === 'mine') {
    return row.status === 'open' && row.assigned_operator_id === userId
  }
  if (tab === 'all') {
    return row.status === 'open'
  }
  return row.status === 'closed'
}

/** Default order: priority desc, then most recent activity first. */
export function sortItems(
  list: ConversationListItem[],
): ConversationListItem[] {
  return [...list].sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority
    const ta = a.last_inbound_at ? new Date(a.last_inbound_at).getTime() : 0
    const tb = b.last_inbound_at ? new Date(b.last_inbound_at).getTime() : 0
    return tb - ta
  })
}

/** Free-text search over name, phone digits, and unit name/code. */
export function matchesSearch(
  item: ConversationListItem,
  query: string,
): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  const name = item.contact?.name?.toLowerCase() ?? ''
  const phone = item.contact?.wa_id ?? ''
  const unit = `${item.unit?.name ?? ''} ${item.unit?.code ?? ''}`.toLowerCase()
  return (
    name.includes(q) ||
    phone.includes(q.replace(/\D/g, '')) ||
    unit.includes(q)
  )
}
