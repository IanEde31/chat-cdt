import { redirect } from 'next/navigation'

import { createClient } from '@/lib/supabase/server'
import { ReportsDashboard } from '@/components/reports/reports-dashboard'

export const dynamic = 'force-dynamic'

export default async function ReportsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Data is fetched client-side via the SECURITY DEFINER report RPCs (unit
  // scope resolves from the user session). The sidebar unit selector + the
  // page's own period control drive the queries.
  return <ReportsDashboard />
}
