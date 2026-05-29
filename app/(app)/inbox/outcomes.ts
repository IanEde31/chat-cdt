/**
 * Close outcomes — the EXIT axis of a handoff (resolution), orthogonal to
 * handoff_reason (the ENTRY axis: why the AI escalated). Mirrors the
 * chat_close_outcome enum (migration 0011).
 */

export type CloseOutcome =
  | 'resolvido'
  | 'nao_resolvido'
  | 'fora_de_escopo'
  | 'cliente_nao_respondeu'

export const CLOSE_OUTCOMES: { value: CloseOutcome; label: string; hint: string }[] =
  [
    { value: 'resolvido', label: 'Resolvido', hint: 'Demanda atendida' },
    {
      value: 'nao_resolvido',
      label: 'Não resolvido',
      hint: 'Pendente / depende de outra área',
    },
    {
      value: 'cliente_nao_respondeu',
      label: 'Cliente não respondeu',
      hint: 'Cliente sumiu durante o atendimento',
    },
    {
      value: 'fora_de_escopo',
      label: 'Fora de escopo',
      hint: 'Engano, spam ou assunto que não tratamos',
    },
  ]

export const CLOSE_OUTCOME_LABEL: Record<CloseOutcome, string> =
  Object.fromEntries(CLOSE_OUTCOMES.map((o) => [o.value, o.label])) as Record<
    CloseOutcome,
    string
  >

/** Badge tone per outcome (Tailwind classes), for the closed list/chips. */
export const CLOSE_OUTCOME_TONE: Record<CloseOutcome, string> = {
  resolvido: 'bg-accent/12 text-accent border border-accent/30',
  nao_resolvido: 'bg-amber-500/12 text-amber-400 border border-amber-500/30',
  cliente_nao_respondeu:
    'bg-secondary text-muted-foreground border border-border',
  fora_de_escopo: 'bg-secondary text-muted-foreground border border-border',
}
