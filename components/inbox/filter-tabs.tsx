'use client'

import { INBOX_TABS, type InboxTab } from '@/app/(app)/inbox/list-data'
import { cn } from '@/lib/utils'

export function FilterTabs({
  tab,
  onTab,
  counts,
}: {
  tab: InboxTab
  onTab: (t: InboxTab) => void
  counts: Record<InboxTab, number>
}) {
  return (
    <div className="mt-3.5 flex flex-wrap gap-1">
      {INBOX_TABS.map((t) => {
        const active = t.value === tab
        return (
          <button
            key={t.value}
            type="button"
            onClick={() => onTab(t.value)}
            aria-pressed={active}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[10.5px] font-semibold uppercase tracking-[0.06em] transition-colors',
              active
                ? 'border-accent bg-accent text-accent-foreground'
                : 'border-border text-muted-foreground hover:text-foreground',
            )}
          >
            {t.label}
            <span className={cn('tabular-nums', active ? 'opacity-60' : 'opacity-80')}>
              {counts[t.value]}
            </span>
          </button>
        )
      })}
    </div>
  )
}
