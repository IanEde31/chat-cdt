// Helpers pra mídia do WhatsApp:
//   - extractMediaInfo: lê o sub-objeto correto do payload (image/audio/...)
//   - extFromMime: deriva extensão sensata pra storage path
//   - downloadAndStore: baixa a URL da Meta e sobe pro bucket chat-media
//   - createMediaSignedUrl: gera URL temporária pra o frontend renderizar

import type { SupabaseClient } from '@supabase/supabase-js'

export const MEDIA_BUCKET = 'chat-media'

const MEDIA_TYPES = ['image', 'audio', 'video', 'document', 'sticker'] as const
export type MediaType = (typeof MEDIA_TYPES)[number]

export type MediaInfo = {
  type: MediaType
  /** Meta media id (durável; útil pra debug/refetch). */
  id: string
  /** URL temporária da Meta (`lookaside.fbsbx.com/...`). */
  url: string
  mime_type: string
  /** Só presente para documentos. */
  filename?: string
  /** Só áudio. */
  voice?: boolean
  /** Só sticker. */
  animated?: boolean
}

export function extractMediaInfo(
  payload: Record<string, unknown> | null | undefined,
  msgType: string | null | undefined
): MediaInfo | null {
  if (!payload || !msgType) return null
  if (!MEDIA_TYPES.includes(msgType as MediaType)) return null

  const sub = payload[msgType] as Record<string, unknown> | undefined
  if (!sub || typeof sub !== 'object') return null

  const id = typeof sub.id === 'string' ? sub.id : null
  const url = typeof sub.url === 'string' ? sub.url : null
  const mime_type = typeof sub.mime_type === 'string' ? sub.mime_type : null
  if (!id || !url || !mime_type) return null

  return {
    type: msgType as MediaType,
    id,
    url,
    mime_type,
    filename: typeof sub.filename === 'string' ? sub.filename : undefined,
    voice: typeof sub.voice === 'boolean' ? sub.voice : undefined,
    animated: typeof sub.animated === 'boolean' ? sub.animated : undefined,
  }
}

const MIME_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'audio/ogg': 'ogg',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/aac': 'aac',
  'audio/amr': 'amr',
  'audio/webm': 'webm',
  'video/mp4': 'mp4',
  'video/3gpp': '3gp',
  'video/quicktime': 'mov',
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.ms-powerpoint': 'ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation':
    'pptx',
  'text/plain': 'txt',
  'text/csv': 'csv',
}

export function extFromMime(mime: string): string {
  if (MIME_EXT[mime]) return MIME_EXT[mime]
  // fallback: pega o que vem depois da barra, lowercase, alfanumérico
  const after = mime.split('/').pop() ?? 'bin'
  return after.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8) || 'bin'
}

export function buildStoragePath(
  conversationId: string,
  waMessageId: string,
  mime: string
): string {
  return `${conversationId}/${waMessageId}.${extFromMime(mime)}`
}

/**
 * Baixa a URL da Meta (lookaside) e sobe pro bucket. Retorna o path no
 * Storage. Idempotente — `upsert: true` permite re-tentativa sem erro.
 *
 * A URL lookaside tem hash assinado e dispensa Bearer token, mas expira em
 * ~5 minutos. Por isso o caller (webhook) deve chamar AGORA, não depois.
 *
 * Limites: ignora arquivo > 50MB (paranoia contra ataque/abuse) — embora
 * o bucket permita até 100MB.
 */
export async function downloadAndStore(
  serviceSupabase: SupabaseClient,
  args: {
    conversationId: string
    waMessageId: string
    media: MediaInfo
  }
): Promise<{ storage_path: string } | { error: string }> {
  const { conversationId, waMessageId, media } = args
  const path = buildStoragePath(conversationId, waMessageId, media.mime_type)

  try {
    const res = await fetch(media.url, {
      // Tentamos sem Bearer porque lookaside.fbsbx.com aceita hash assinado.
      // Caso Meta mude o contrato, plugar fallback Graph aqui.
      redirect: 'follow',
    })
    if (!res.ok) {
      return { error: `meta fetch ${res.status}` }
    }

    const contentLength = Number(res.headers.get('content-length') ?? '0')
    if (contentLength > 50 * 1024 * 1024) {
      return { error: `too large (${contentLength} bytes)` }
    }

    const bytes = new Uint8Array(await res.arrayBuffer())

    const { error: upErr } = await serviceSupabase.storage
      .from(MEDIA_BUCKET)
      .upload(path, bytes, {
        contentType: media.mime_type,
        upsert: true,
      })

    if (upErr) {
      return { error: `storage upload: ${upErr.message}` }
    }

    return { storage_path: path }
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
}

/**
 * Cria URL assinada pra um arquivo do bucket. Default 1h — tempo confortável
 * pra navegação operacional. Retorna null se o storage_path não existir ou
 * o user não tem permissão (RLS bloqueia).
 */
export async function createMediaSignedUrl(
  supabase: SupabaseClient,
  storagePath: string,
  expiresInSec = 3600
): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(MEDIA_BUCKET)
    .createSignedUrl(storagePath, expiresInSec)
  if (error || !data?.signedUrl) return null
  return data.signedUrl
}
