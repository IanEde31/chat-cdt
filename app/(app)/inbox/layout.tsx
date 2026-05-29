import { redirect } from 'next/navigation'

import { createClient } from '@/lib/supabase/server'

import { InboxWorkspace } from '@/components/inbox/inbox-workspace'
import type { ConversationListItem } from './list-data'
import { extractPreview } from './preview'

export const dynamic = 'force-dynamic'

/**
 * Inbox shell. Renders the persistent triage list (left) alongside the thread
 * region ({children}). The list stays mounted across row clicks — only the
 * thread/context area swaps — which is the whole point of the 4-column layout.
 *
 * The working set (all open + recent closed, RLS-scoped to the operator's
 * units) is fetched ONCE here; the client workspace filters by tab/unit/search
 * with no further server round-trips.
 */
export default async function InboxLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const selectCols = `
    id, unit_id, status, routing, handoff_reason, priority,
    last_inbound_at, customer_window_expires_at, assigned_operator_id,
    contact:contacts(id, wa_id, name),
    unit:units(id, code, name)
  `

  // Open conversations (queued/human/ai) — covers Aguardando/Meus/Todos tabs.
  const { data: openRows, error: openErr } = await supabase
    .from('conversations')
    .select(selectCols)
    .eq('status', 'open')
    .order('priority', { ascending: false })
    .order('last_inbound_at', { ascending: false, nullsFirst: false })
    .limit(400)
  if (openErr) console.error('[inbox] open fetch failed', openErr)

  // Recent closed — bounded, for the Encerrados tab.
  const { data: closedRows, error: closedErr } = await supabase
    .from('conversations')
    .select(selectCols)
    .eq('status', 'closed')
    .order('last_inbound_at', { ascending: false, nullsFirst: false })
    .limit(100)
  if (closedErr) console.error('[inbox] closed fetch failed', closedErr)

  const conversations = [
    ...((openRows ?? []) as unknown as ConversationListItem[]),
    ...((closedRows ?? []) as unknown as ConversationListItem[]),
  ]

  // One messages query for previews across the whole working set.
  const ids = conversations.map((c) => c.id)
  const previewMap: Record<string, ConversationListItem['preview']> = {}
  if (ids.length > 0) {
    const { data: msgs, error: msgErr } = await supabase
      .from('messages')
      .select('conversation_id, payload, direction, created_at, type')
      .in('conversation_id', ids)
      .order('created_at', { ascending: false })
      .limit(ids.length * 4)
    if (msgErr) console.error('[inbox] preview fetch failed', msgErr)

    for (const m of msgs ?? []) {
      if (previewMap[m.conversation_id]) continue
      const { text, kind } = extractPreview(
        m.payload as Record<string, unknown> | null,
        m.type as string | null,
      )
      previewMap[m.conversation_id] = {
        text,
        kind,
        direction: m.direction as 'in' | 'out',
        createdAt: m.created_at as string,
      }
    }
  }

  const items: ConversationListItem[] = conversations.map((c) => ({
    ...c,
    preview: previewMap[c.id] ?? null,
  }))

  return (
    <InboxWorkspace initial={items} userId={user.id}>
      {children}
    </InboxWorkspace>
  )
}
