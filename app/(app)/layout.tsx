import { redirect } from 'next/navigation'

import { PushSetup } from '@/components/push-setup'
import { Sidebar } from '@/components/sidebar'
import { UnitFilterProvider, type UnitOption } from '@/components/inbox/unit-filter'
import { Toaster } from '@/components/ui/sonner'
import { createClient } from '@/lib/supabase/server'

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Resolve operator profile via auth.uid() -> profiles.user_id chain.
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, name')
    .eq('user_id', user.id)
    .maybeSingle()

  const sidebarUser = profile
    ? {
        id: profile.id as string,
        name: (profile.name as string) ?? user.email ?? 'Operador',
      }
    : { id: user.id, name: user.email ?? 'Operador' }

  // Units the operator can access — single fetch, shared by the sidebar's
  // UnitSelect (the unit filter source of truth) via UnitFilterProvider.
  // Uses chat_my_units() (SECURITY DEFINER): the pre-existing RLS on
  // user_units compares user_id with auth.uid() but user_id points at
  // profiles.id — a direct select returns empty. See migration 0005.
  const { data: unitRows, error: unitsError } = await supabase.rpc(
    'chat_my_units',
  )
  if (unitsError) {
    console.error('[app] failed to load units', unitsError)
  }
  const units: UnitOption[] = (unitRows ?? []) as UnitOption[]

  // Lightweight "aguardando" badge for the sidebar nav (RLS-scoped to the
  // operator's units). Server-rendered; the live count lives in the list.
  const { count: waitingCount } = await supabase
    .from('conversations')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'open')
    .in('routing', ['queued', 'human'])
    .is('assigned_operator_id', null)

  return (
    <UnitFilterProvider units={units}>
      <div className="flex h-screen w-full overflow-hidden bg-background">
        <Sidebar user={sidebarUser} waitingCount={waitingCount ?? 0} />
        <main className="flex h-screen min-w-0 flex-1 flex-col overflow-hidden">
          <PushSetup />
          {children}
        </main>
      </div>
      <Toaster theme="dark" />
    </UnitFilterProvider>
  )
}
