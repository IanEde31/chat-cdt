/**
 * Thread skeleton — shown while [id]/page fetches the conversation. Keeps the
 * persistent-column UX feeling instant instead of blanking on every row click.
 */
export default function ThreadLoading() {
  return (
    <div className="flex min-h-0 w-full animate-pulse">
      <div className="flex min-h-0 flex-1 flex-col">
        {/* Header */}
        <div className="flex shrink-0 items-center gap-3 border-b border-border bg-card/80 px-[22px] py-3">
          <div className="size-9 shrink-0 rounded-full bg-secondary" />
          <div className="flex flex-1 flex-col gap-1.5">
            <div className="h-3.5 w-40 rounded bg-secondary" />
            <div className="h-2.5 w-28 rounded bg-secondary/70" />
          </div>
          <div className="h-6 w-16 rounded-full bg-secondary" />
        </div>

        {/* Messages */}
        <div className="flex flex-1 flex-col gap-3 px-6 py-8">
          <div className="h-10 w-2/3 self-start rounded-2xl bg-secondary" />
          <div className="h-10 w-1/2 self-end rounded-2xl bg-secondary/80" />
          <div className="h-16 w-3/5 self-start rounded-2xl bg-secondary" />
          <div className="h-10 w-2/5 self-end rounded-2xl bg-secondary/80" />
          <div className="h-8 w-1/2 self-start rounded-2xl bg-secondary" />
        </div>

        {/* Composer */}
        <div className="shrink-0 border-t border-border px-[22px] py-4">
          <div className="h-11 w-full rounded-2xl bg-secondary" />
        </div>
      </div>
    </div>
  )
}
