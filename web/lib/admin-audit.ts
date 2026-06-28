// lib/admin-audit.ts
// Reusable helper for writing to admin_audit_log.
// Always call this from every admin action handler — never duplicate inline.

import { createClient } from '@supabase/supabase-js'

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

interface AuditEntry {
  adminId: string
  action: string
  targetTable?: string
  targetId?: string
  details?: Record<string, unknown>
}

export async function logAdminAction({
  adminId,
  action,
  targetTable,
  targetId,
  details,
}: AuditEntry): Promise<void> {
  const admin = getAdmin()
  const { error } = await admin.from('admin_audit_log').insert({
    admin_id: adminId,
    action,
    target_table: targetTable ?? null,
    target_id: targetId ?? null,
    details: details ?? null,
  })
  if (error) {
    console.error('logAdminAction failed:', error.message)
  }
}
