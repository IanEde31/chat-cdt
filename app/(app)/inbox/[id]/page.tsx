import { notFound, redirect } from 'next/navigation'

import { createClient } from '@/lib/supabase/server'
import {
  createMediaSignedUrl,
  extractMediaInfo,
} from '@/lib/storage/media'

import { ThreadPane } from '@/components/inbox/thread-pane'

export const dynamic = 'force-dynamic'

/**
 * Debtor/cobrança context for the right panel. Comes from the read-only,
 * unit-scoped RPC `chat_debtor_context` (migration 0007) — never a direct
 * read of the n8n `clientes_cobranca_*` tables.
 */
export type DebtorContext = {
  matched: boolean
  debtor_name: string | null
  matricula: string | null
  valor_inadimplente: number | null
  status: string | null
  regua: string | null
  disparos: number | null
  disparos_equipe: number | null
  pagamento_feito: boolean | null
  link_pagamento: string | null
  data_pagamento: string | null
  data_ultima_mensagem: string | null
  updated_at: string | null
}

/**
 * Shape of a single message row, as we render it. Keep this in sync with
 * the columns selected below and the `chat_*` enums in docs/03-database.md.
 */
export type Message = {
  id: string
  conversation_id: string
  wa_message_id: string | null
  direction: 'in' | 'out'
  type: string
  payload: Record<string, unknown> | null
  status: 'pending' | 'sent' | 'delivered' | 'read' | 'failed'
  error: Record<string, unknown> | null
  sent_by: 'ai' | 'operator' | 'system' | 'customer'
  operator_id: string | null
  created_at: string
}

/**
 * Denormalised view of a conversation that the thread UI needs. We embed
 * the contact + phone + waba so the header/composer don't need to do
 * follow-up reads.
 */
export type ConversationView = {
  id: string
  unit_id: string
  status: 'open' | 'snoozed' | 'closed'
  routing: 'ai' | 'queued' | 'human'
  handoff_reason: 'payment_re_register' | 'cancel' | 'other_support' | null
  priority: number
  last_inbound_at: string | null
  customer_window_expires_at: string | null
  assigned_operator_id: string | null
  contact: {
    id: string
    wa_id: string
    name: string | null
    profile: Record<string, unknown> | null
    crm_external_id: string | null
  } | null
  phone: {
    id: string
    phone_number_id: string
    display_phone: string | null
    waba: {
      id: string
      waba_id: string // Meta WABA id (text) — used as FK by template_inventory
      name: string | null
    } | null
  } | null
  unit: { id: string; code: string; name: string } | null
}

export default async function ThreadPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: convRaw, error: convErr } = await supabase
    .from('conversations')
    .select(
      `
        id, unit_id, status, routing, handoff_reason, priority,
        last_inbound_at, customer_window_expires_at, assigned_operator_id,
        contact:contacts(id, wa_id, name, profile, crm_external_id),
        phone:chat_phone_numbers(
          id, phone_number_id, display_phone,
          waba:wabas(id, waba_id, name)
        ),
        unit:units(id, code, name)
      `,
    )
    .eq('id', id)
    .maybeSingle()

  if (convErr) {
    console.error('[inbox/[id]] conversation lookup error', convErr)
    notFound()
  }
  if (!convRaw) notFound()

  // Supabase's typed return is structural — we trust the select shape.
  const conversation = convRaw as unknown as ConversationView

  const { data: messagesRaw, error: msgErr } = await supabase
    .from('messages')
    .select(
      'id, conversation_id, wa_message_id, direction, type, payload, status, error, sent_by, operator_id, created_at',
    )
    .eq('conversation_id', id)
    .order('created_at', { ascending: true })
    .limit(100)

  if (msgErr) {
    console.error('[inbox/[id]] messages lookup error', msgErr)
  }

  const messages = (messagesRaw ?? []) as unknown as Message[]

  // Pré-gera URLs assinadas (1h) para cada mensagem com mídia. Para cada msg
  // armazenamos { url, pending }:
  //   - url: signed URL ou null
  //   - pending: true se ainda dentro da janela em que esperamos o download
  //              do webhook (msg < 2 min); false → "indisponível" definitivo.
  const PENDING_WINDOW_MS = 2 * 60 * 1000
  const now = Date.now()
  const mediaUrlMap: Record<
    string,
    { url: string | null; pending: boolean }
  > = {}
  for (const m of messages) {
    const info = extractMediaInfo(m.payload, m.type)
    if (!info) continue
    const sub = (m.payload as Record<string, unknown> | null)?.[m.type] as
      | { storage_path?: string }
      | undefined
    const ageMs = now - new Date(m.created_at).getTime()
    if (!sub?.storage_path) {
      mediaUrlMap[m.id] = { url: null, pending: ageMs < PENDING_WINDOW_MS }
      continue
    }
    const url = await createMediaSignedUrl(supabase, sub.storage_path, 3600)
    mediaUrlMap[m.id] = { url, pending: false }
  }

  // Debtor/cobrança context (read-only, unit-scoped RPC). Failures degrade to
  // "no match" — the panel falls back to honest conversation-only context.
  let debtor: DebtorContext | null = null
  const { data: debtorRows, error: debtorErr } = await supabase.rpc(
    'chat_debtor_context',
    { p_conversation_id: id },
  )
  if (debtorErr) {
    console.error('[inbox/[id]] debtor context error', debtorErr)
  } else if (Array.isArray(debtorRows) && debtorRows.length > 0) {
    debtor = debtorRows[0] as DebtorContext
  }

  return (
    <ThreadPane
      initial={messages}
      conversation={conversation}
      userId={user.id}
      initialMediaUrls={mediaUrlMap}
      debtor={debtor}
    />
  )
}
