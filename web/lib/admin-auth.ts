// lib/admin-auth.ts
// Server-side admin role resolution for /api/admin/* routes.
// Returns the caller's platform admin role ('super' | 'support' |
// 'finance' | 'readonly') or null. Accepts legacy is_super_admin.

import { createClient as createServerClient } from '@/lib/supabase-server'
import { createClient } from '@supabase/supabase-js'

export function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function requireAdmin(allowedRoles: string[]): Promise<
  { ok: true; userId: string; role: string } | { ok: false; status: number; error: string }
> {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, status: 401, error: 'Unauthorised' }

  const admin = getAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('admin_role, is_super_admin')
    .eq('id', user.id)
    .maybeSingle()

  const role = profile?.admin_role ?? (profile?.is_super_admin ? 'super' : null)
  if (!role || !allowedRoles.includes(role)) {
    return { ok: false, status: 403, error: 'Forbidden' }
  }
  return { ok: true, userId: user.id, role }
}
