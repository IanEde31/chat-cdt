-- ============================================================================
-- 0006 — Bucket de mídia (Supabase Storage) pra inbound do WhatsApp.
--
-- Por quê: URLs da Meta no payload do webhook (`lookaside.fbsbx.com/...`)
-- expiram em ~5 min. Sem persistência local, qualquer abertura da thread
-- depois disso mostraria mídia quebrada. Inaceitável pra cobrança onde
-- operador volta no comprovante horas/dias depois.
--
-- Path: <conversation_id>/<wa_message_id>.<ext>
-- Limite: 100MB (limite da Meta pra vídeo, maior tipo aceito).
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'chat-media',
  'chat-media',
  false,
  104857600,
  array[
    'image/jpeg','image/png','image/webp','image/gif',
    'audio/ogg','audio/mpeg','audio/mp4','audio/aac','audio/amr','audio/webm',
    'video/mp4','video/3gpp','video/quicktime',
    'application/pdf',
    'application/msword',
    'application/vnd.ms-excel',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain','text/csv'
  ]
)
on conflict (id) do nothing;

drop policy if exists chat_media_select on storage.objects;
create policy chat_media_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'chat-media'
    and exists (
      select 1 from public.conversations c
       where c.id::text = split_part(storage.objects.name, '/', 1)
         and public.chat_user_has_unit(c.unit_id)
    )
  );
