import { Hexagon } from 'lucide-react'

/**
 * Empty thread state — shown in the thread region when no conversation is
 * selected. The persistent list lives in the inbox layout, so this only fills
 * the right side.
 */
export default function InboxIndexPage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3.5 px-6 text-center">
      <Hexagon
        className="size-14 fill-accent/10 text-accent/50"
        aria-hidden
      />
      <p className="text-[15px] font-semibold text-foreground">
        Selecione uma conversa
      </p>
      <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-muted-foreground">
        J / K para navegar · ↵ para abrir
      </p>
    </div>
  )
}
