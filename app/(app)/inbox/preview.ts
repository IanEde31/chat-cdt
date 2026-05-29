/**
 * Extracts a human-readable, single-line preview from a WhatsApp message
 * payload. Shared by the server list fetch (page/layout) and the client
 * realtime reducer so both stay in sync. Pure — safe on server and client.
 */
export type PreviewKind = 'text' | 'image' | 'video' | 'audio' | 'document' | 'button'

export type MessagePreview = {
  text: string
  kind: PreviewKind
  direction: 'in' | 'out'
  createdAt: string
}

export function firstLine(s: string): string {
  const trimmed = s.trim()
  const nl = trimmed.indexOf('\n')
  return nl === -1 ? trimmed : trimmed.slice(0, nl)
}

/**
 * Returns { text, kind } for a payload. `kind` lets the row render media
 * previews (icon + label) instead of a raw "[image]" string.
 */
export function extractPreview(
  payload: Record<string, unknown> | null,
  type: string | null,
): { text: string; kind: PreviewKind } {
  const mediaKind = (t: string | null): PreviewKind | null => {
    if (t === 'image' || t === 'video' || t === 'audio' || t === 'document')
      return t
    if (t === 'sticker') return 'image'
    return null
  }

  if (!payload) {
    const k = mediaKind(type)
    return { text: k ? mediaLabel(k) : type ? `[${type}]` : '', kind: k ?? 'text' }
  }

  const textObj = payload['text'] as { body?: unknown } | undefined
  if (textObj && typeof textObj.body === 'string') {
    return { text: firstLine(textObj.body), kind: 'text' }
  }
  if (typeof payload['body'] === 'string') {
    return { text: firstLine(payload['body'] as string), kind: 'text' }
  }

  for (const key of ['image', 'video', 'document', 'audio'] as const) {
    const m = payload[key] as { caption?: unknown } | undefined
    if (m) {
      const caption =
        typeof m.caption === 'string' && m.caption.length > 0
          ? firstLine(m.caption)
          : mediaLabel(key)
      return { text: caption, kind: key }
    }
  }

  const interactive = payload['interactive'] as
    | { button_reply?: { title?: string }; list_reply?: { title?: string } }
    | undefined
  if (interactive?.button_reply?.title)
    return { text: interactive.button_reply.title, kind: 'button' }
  if (interactive?.list_reply?.title)
    return { text: interactive.list_reply.title, kind: 'button' }

  const btn = payload['button'] as { text?: string } | undefined
  if (btn?.text) return { text: btn.text, kind: 'button' }

  const tpl = payload['template'] as { name?: string } | undefined
  if (tpl?.name) return { text: `Template: ${tpl.name}`, kind: 'text' }

  const k = mediaKind(type)
  return { text: k ? mediaLabel(k) : type ? `[${type}]` : '', kind: k ?? 'text' }
}

/** Backwards-compatible text-only extractor (legacy call sites). */
export function extractPreviewText(
  payload: Record<string, unknown> | null,
  type: string | null,
): string {
  return extractPreview(payload, type).text
}

function mediaLabel(kind: PreviewKind): string {
  switch (kind) {
    case 'image':
      return 'imagem'
    case 'video':
      return 'vídeo'
    case 'audio':
      return 'áudio'
    case 'document':
      return 'documento'
    default:
      return ''
  }
}
