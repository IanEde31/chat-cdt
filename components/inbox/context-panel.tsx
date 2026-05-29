'use client'

import type { CSSProperties, ReactNode } from 'react'
import { BadgeCheck, CircleDollarSign, ExternalLink } from 'lucide-react'

import type {
  ConversationView,
  DebtorContext,
} from '@/app/(app)/inbox/[id]/page'
import { formatBRL } from '@/lib/format/currency'
import { formatWaId } from '@/lib/format/phone'
import { windowRemaining } from '@/lib/format/time'
import { unitColor } from '@/lib/unit-colors'
import { cn } from '@/lib/utils'

const HANDOFF_LABEL: Record<string, string> = {
  payment_re_register: 'Recadastro de pagamento',
  cancel: 'Cancelamento',
  other_support: 'Suporte',
}

const ROUTING_LABEL: Record<string, string> = {
  ai: 'IA (bot)',
  queued: 'Aguardando humano',
  human: 'Em atendimento',
}

export function ContextPanel({
  conversation,
  debtor,
}: {
  conversation: ConversationView
  debtor: DebtorContext | null
}) {
  const contactName =
    conversation.contact?.name?.trim() ||
    formatWaId(conversation.contact?.wa_id ?? '') ||
    'Contato'
  const phone = formatWaId(conversation.contact?.wa_id ?? '')
  const initials = getInitials(contactName)

  const unitSeed = conversation.unit?.id ?? conversation.unit_id
  const uc = unitSeed ? unitColor(unitSeed) : null
  const unitName =
    conversation.unit?.name ||
    conversation.unit?.code?.toUpperCase() ||
    null

  const avatarStyle: CSSProperties = uc
    ? { backgroundColor: uc.bg, borderColor: uc.border, color: uc.fg }
    : {
        backgroundColor: 'hsl(240 9% 46% / 0.14)',
        borderColor: 'hsl(240 9% 46% / 0.35)',
        color: 'hsl(240 9% 60%)',
      }

  const matched = !!debtor?.matched
  const attempts =
    (debtor?.disparos ?? 0) + (debtor?.disparos_equipe ?? 0)
  const win = windowRemaining(conversation.customer_window_expires_at)

  return (
    <aside className="flex w-[280px] shrink-0 flex-col overflow-y-auto border-l border-border bg-background xl:w-[300px]">
      {/* Identity */}
      <div className="flex flex-col items-center gap-2 px-5 pb-3.5 pt-5 text-center">
        <div
          className="flex size-[52px] items-center justify-center rounded-full border text-[17px] font-bold"
          style={avatarStyle}
          aria-hidden
        >
          {initials}
        </div>
        <div>
          <div className="text-[14.5px] font-bold tracking-[-0.01em] text-foreground">
            {contactName}
          </div>
          <div className="mt-0.5 font-mono text-[11px] text-muted-foreground">
            {phone}
          </div>
        </div>
        {unitName && uc && (
          <span
            className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-[0.04em]"
            style={{ borderColor: uc.border, color: uc.fg }}
          >
            <span
              className="size-1.5 rounded-full"
              style={{ backgroundColor: uc.solid }}
              aria-hidden
            />
            {unitName}
          </span>
        )}
      </div>

      {/* Cobrança */}
      {matched && debtor ? (
        <DebtSection debtor={debtor} attempts={attempts} />
      ) : (
        <div className="border-b border-border px-5 pb-4 text-center">
          <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
            Cobrança
          </p>
          <p className="mt-2 text-[12.5px] text-muted-foreground">
            Sem cadastro de cobrança vinculado a este contato.
          </p>
        </div>
      )}

      {/* This conversation */}
      <Section label="Conversa">
        <Fact
          label="Motivo do handoff"
          value={
            conversation.handoff_reason
              ? (HANDOFF_LABEL[conversation.handoff_reason] ??
                conversation.handoff_reason)
              : '—'
          }
        />
        <Fact
          label="Roteamento"
          value={ROUTING_LABEL[conversation.routing] ?? conversation.routing}
        />
        <Fact
          label="Janela 24h"
          value={win.expired ? 'Fora da janela' : win.label}
          tone={win.expired ? 'danger' : undefined}
        />
        {conversation.contact?.crm_external_id && (
          <Fact label="CRM" value={conversation.contact.crm_external_id} />
        )}
      </Section>

      {/* Internal note placeholder — feature pending a notes table */}
      <div className="mt-auto px-5 py-4">
        <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground/70">
          Nota interna
        </p>
        <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground/60">
          Anotações da equipe chegam numa próxima versão.
        </p>
      </div>
    </aside>
  )
}

function DebtSection({
  debtor,
  attempts,
}: {
  debtor: DebtorContext
  attempts: number
}) {
  const paid = !!debtor.pagamento_feito
  const value = debtor.valor_inadimplente

  return (
    <>
      {/* Headline */}
      <div className="border-b border-border px-5 pb-4 text-center">
        {paid ? (
          <div className="inline-flex items-center gap-1.5 font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-accent">
            <BadgeCheck className="size-3.5" />
            Pagamento confirmado
          </div>
        ) : value != null ? (
          <>
            <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
              Valor em aberto
            </p>
            <p className="mt-1 text-[28px] font-extrabold leading-none tracking-[-0.02em] tabular-nums text-foreground">
              {formatBRL(value)}
            </p>
            {debtor.status && (
              <p className="mt-1.5 font-mono text-[11px] capitalize text-amber-400">
                {debtor.status}
                {debtor.regua ? ` · ${debtor.regua}` : ''}
              </p>
            )}
          </>
        ) : (
          <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
            Sem valor em aberto
          </p>
        )}
      </div>

      {/* Facts */}
      <Section label="Cadastro de cobrança">
        {debtor.matricula && (
          <Fact label="Matrícula" value={debtor.matricula} mono />
        )}
        {debtor.status && !debtor.pagamento_feito && (
          <Fact label="Status" value={cap(debtor.status)} />
        )}
        {debtor.regua && <Fact label="Régua" value={debtor.regua} />}
        <Fact label="Tentativas de contato" value={String(Math.round(attempts))} mono />
        {debtor.data_ultima_mensagem && (
          <Fact label="Última cobrança" value={debtor.data_ultima_mensagem} mono />
        )}
        {debtor.pagamento_feito && debtor.data_pagamento && (
          <Fact label="Pago em" value={fmtDate(debtor.data_pagamento)} mono />
        )}
      </Section>

      {/* Actions — only real ones */}
      {debtor.link_pagamento && (
        <Section label="Ações">
          <a
            href={debtor.link_pagamento}
            target="_blank"
            rel="noopener noreferrer"
            className="group flex items-center gap-2 py-1.5 text-[13px] text-accent transition-colors hover:text-accent/80"
          >
            <CircleDollarSign className="size-4 shrink-0" />
            <span className="flex-1">Abrir link de pagamento</span>
            <ExternalLink className="size-3.5 text-muted-foreground transition-colors group-hover:text-accent" />
          </a>
        </Section>
      )}
    </>
  )
}

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="border-b border-border px-5 py-3.5">
      <p className="mb-1.5 font-mono text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </p>
      <div className="flex flex-col">{children}</div>
    </div>
  )
}

function Fact({
  label,
  value,
  mono,
  tone,
}: {
  label: string
  value: string
  mono?: boolean
  tone?: 'danger'
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <span className="text-[12.5px] text-muted-foreground">{label}</span>
      <span
        className={cn(
          'min-w-0 truncate text-right text-[12px] text-foreground',
          mono && 'font-mono-num',
          tone === 'danger' && 'text-red-400',
        )}
        title={value}
      >
        {value}
      </span>
    </div>
  )
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '??'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function fmtDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('pt-BR')
}
