// app/admin/page.tsx — redirect /admin → /admin/stats
import { redirect } from 'next/navigation'
export default function AdminRoot() { redirect('/admin/stats') }
