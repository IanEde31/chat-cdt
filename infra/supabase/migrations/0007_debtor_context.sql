-- 0007_debtor_context.sql
-- ---------------------------------------------------------------------------
-- Painel de contexto do devedor (coluna 4 do inbox redesenhado).
--
-- A UI precisa de dados de cobrança (valor em aberto, matrícula/contrato,
-- nº de disparos/tentativas, status da régua, link de pagamento) que vivem
-- nas tabelas do n8n `clientes_cobranca_*`. NÃO PODEMOS alterar essas tabelas
-- nem expô-las cruas (RLS delas é do fluxo n8n, baseada em
-- `user_unit_permissions`, e o operador CHAT-CDT não está lá).
--
-- Solução ADITIVA e SOMENTE-LEITURA: uma função `chat_debtor_context`
-- SECURITY DEFINER (mesmo padrão de `chat_my_units`/`chat_user_has_unit`) que:
--   1. resolve conversa -> unit_id + contato.wa_id
--   2. exige que o operador tenha a unidade (chat_user_has_unit) — senão vazio
--   3. casa o telefone com `clientes_cobranca_dashboard` por uma CHAVE
--      canônica BR (DDD + últimos 8 dígitos), restrita ao MESMO unit_id
--      (defesa contra colisão de telefone entre unidades)
--   4. devolve UMA linha (prefere bi_atual, depois updated_at, depois matrícula
--      pra desempate determinístico)
--
-- AMBIGUIDADE: a chave DDD+8 não é única por pessoa dentro de uma unidade
-- (~1% das conversas casam com 2 matrículas distintas). Quando isso acontece,
-- `ambiguous=true` e a UI mostra "confirme a matrícula" em vez de arriscar
-- exibir o devedor/elo de pagamento ERRADO.
--
-- Validação (2026-05-28): 307/309 conversas abertas casam com a mesma unidade;
-- nomes do contato batem com o nome cadastral do devedor.
-- ---------------------------------------------------------------------------

-- Normaliza um telefone para a chave canônica BR: DDD(2) || últimos 8 dígitos,
-- sem DDI 55. IMMUTABLE: usável em índice/where sem reexecução.
create or replace function public.chat_phone_match_key(phone text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select case
    when d is null or length(d) < 8 then null
    else substr(local2, 1, 2) || right(local2, 8)
  end
  from (
    select d,
           case
             when length(d) in (12, 13) and left(d, 2) = '55' then substr(d, 3)
             else d
           end as local2
    from (select regexp_replace(coalesce(phone, ''), '\D', '', 'g') as d) z
  ) y;
$$;

comment on function public.chat_phone_match_key(text) is
  'Chave canônica BR de telefone (DDD + últimos 8 dígitos, sem DDI 55). Usada para casar contacts.wa_id com clientes_cobranca_*.whatsapp.';

-- Return type mudou (coluna `ambiguous`): CREATE OR REPLACE não troca tipo de
-- retorno, então dropamos antes.
drop function if exists public.chat_debtor_context(uuid);

create function public.chat_debtor_context(p_conversation_id uuid)
returns table (
  matched              boolean,
  ambiguous            boolean,
  debtor_name          text,
  matricula            text,
  valor_inadimplente   numeric,
  status               text,
  regua                text,
  disparos             numeric,
  disparos_equipe      numeric,
  pagamento_feito      boolean,
  link_pagamento       text,
  data_pagamento       timestamptz,
  data_ultima_mensagem text,
  updated_at           timestamptz
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_unit uuid;
  v_wa   text;
  v_key  text;
  v_distinct int;
begin
  -- 1. resolve conversa -> unidade + telefone do contato
  select co.unit_id, c.wa_id
    into v_unit, v_wa
  from public.conversations co
  join public.contacts c on c.id = co.contact_id
  where co.id = p_conversation_id;

  if v_unit is null then
    return;                       -- conversa inexistente / sem unidade
  end if;

  -- 2. porteiro: operador precisa ter acesso à unidade
  if not public.chat_user_has_unit(v_unit) then
    return;                       -- não autorizado -> vazio (sem vazamento)
  end if;

  v_key := public.chat_phone_match_key(v_wa);
  if v_key is null then
    return;                       -- telefone inválido -> sem match
  end if;

  -- 3a. quantas matrículas DISTINTAS casam? (>1 = ambíguo)
  select count(distinct d.matricula)
    into v_distinct
  from public.clientes_cobranca_dashboard d
  where d.unit_id = v_unit
    and public.chat_phone_match_key(d.whatsapp) = v_key;

  if v_distinct = 0 then
    return;                       -- sem cadastro
  end if;

  -- 3b. casa por chave canônica + MESMA unidade; 4. desempate determinístico
  return query
  select
    true,
    v_distinct > 1,
    d.name,
    d.matricula,
    d.valor_inadimplente,
    d.status,
    d.regua,
    d.disparos,
    d.disparos_equipe,
    d.pagamento_feito,
    d.link_pagamento,
    d.data_pagamento,
    d.data_ultima_mensagem,
    d.updated_at
  from public.clientes_cobranca_dashboard d
  where d.unit_id = v_unit
    and public.chat_phone_match_key(d.whatsapp) = v_key
  order by d.bi_atual desc nulls last,
           d.updated_at desc nulls last,
           d.matricula asc
  limit 1;
end;
$$;

comment on function public.chat_debtor_context(uuid) is
  'Contexto de cobrança (somente leitura) de uma conversa, casado por telefone+unidade. Gated por chat_user_has_unit. ambiguous=true quando >1 matrícula casa. Não altera tabelas do n8n.';

-- Lockdown: revoga geral, concede só ao papel autenticado (igual chat_my_units).
revoke all on function public.chat_phone_match_key(text)   from public;
revoke all on function public.chat_debtor_context(uuid)    from public;
grant execute on function public.chat_phone_match_key(text) to authenticated;
grant execute on function public.chat_debtor_context(uuid)  to authenticated;
