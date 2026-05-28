// Backfill de mídia: itera por mensagens com type image/audio/video/document/
// sticker mas sem storage_path no payload, baixa de novo via Graph API
// (media_id é válido ~30 dias) e sobe pro bucket.
//
// Como rodar (autenticado por CRON_SECRET):
//   curl -X POST https://chat.cdt.7bee.ai/api/internal/media/backfill \
//     -H "x-cron-secret: $CRON_SECRET"
//
// Parâmetros opcionais por query:
//   ?limit=50    máximo de mensagens por chamada (default 50)
//   ?conv=<id>   restringe a uma conversation específica

import { NextRequest, NextResponse } from 'next/server'

import { createServiceClient } from '@/lib/supabase/service'
import {
  downloadAndStore,
  extractMediaInfo,
} from '@/lib/storage/media'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MEDIA_TYPES = ['image', 'audio', 'video', 'document', 'sticker'] as const

export async function POST(req: NextRequest) {
  const provided = req.headers.get('x-cron-secret')
  const expected = process.env.CRON_SECRET
  if (!expected || provided !== expected) {
    return new NextResponse('forbidden', { status: 403 })
  }

  const accessToken = process.env.META_SYSTEM_USER_TOKEN
  const apiVersion = process.env.META_GRAPH_VERSION ?? 'v22.0'
  if (!accessToken) {
    return NextResponse.json(
      { error: 'META_SYSTEM_USER_TOKEN not configured' },
      { status: 500 }
    )
  }

  const url = new URL(req.url)
  const limit = Math.min(
    Math.max(1, parseInt(url.searchParams.get('limit') ?? '50', 10) || 50),
    200
  )
  const convFilter = url.searchParams.get('conv') ?? null

  const supabase = createServiceClient()

  let q = supabase
    .from('messages')
    .select('id, conversation_id, wa_message_id, type, payload')
    .in('type', MEDIA_TYPES as unknown as string[])
    .order('created_at', { ascending: false })
    .limit(limit)
  if (convFilter) q = q.eq('conversation_id', convFilter)

  const { data: rows, error } = await q
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const results: Array<{
    wa_message_id: string | null
    type: string
    ok: boolean
    reason?: string
  }> = []

  for (const row of rows ?? []) {
    const payload = row.payload as Record<string, unknown> | null
    const sub = payload?.[row.type] as { storage_path?: string } | undefined
    if (sub?.storage_path) {
      results.push({
        wa_message_id: row.wa_message_id,
        type: row.type,
        ok: true,
        reason: 'already had storage_path',
      })
      continue
    }

    const info = extractMediaInfo(payload, row.type)
    if (!info || !row.wa_message_id) {
      results.push({
        wa_message_id: row.wa_message_id,
        type: row.type,
        ok: false,
        reason: 'no media info or wa_message_id',
      })
      continue
    }

    const res = await downloadAndStore(supabase, {
      conversationId: row.conversation_id,
      waMessageId: row.wa_message_id,
      media: info,
      accessToken,
      apiVersion,
    })

    if ('error' in res) {
      results.push({
        wa_message_id: row.wa_message_id,
        type: row.type,
        ok: false,
        reason: res.error,
      })
      continue
    }

    // Patch payload com storage_path
    const subObj = (payload?.[row.type] ?? {}) as Record<string, unknown>
    const updatedPayload = {
      ...(payload ?? {}),
      [row.type]: { ...subObj, storage_path: res.storage_path },
    }
    const { error: updErr } = await supabase
      .from('messages')
      .update({ payload: updatedPayload })
      .eq('id', row.id)
    if (updErr) {
      results.push({
        wa_message_id: row.wa_message_id,
        type: row.type,
        ok: false,
        reason: `patch: ${updErr.message}`,
      })
      continue
    }
    results.push({
      wa_message_id: row.wa_message_id,
      type: row.type,
      ok: true,
    })
  }

  const ok = results.filter((r) => r.ok).length
  const failed = results.length - ok
  return NextResponse.json({
    processed: results.length,
    ok,
    failed,
    results,
  })
}
