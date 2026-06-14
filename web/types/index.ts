// types/index.ts
// Shared TypeScript types for the TrueFlio web app

export type Plan = 'free' | 'solo' | 'business' | 'pro' | 'enterprise'
export type Role = 'owner' | 'admin' | 'staff' | 'accountant'
export type UploadedVia = 'whatsapp' | 'app' | 'web'
export type ReceiptCategory =
  | 'Food & Drink'
  | 'Transport'
  | 'Utilities'
  | 'Office Supplies'
  | 'Marketing'
  | 'Rent'
  | 'Salaries'
  | 'Other'

export interface Profile {
  id: string
  full_name: string | null
  phone: string | null
  avatar_url: string | null
  created_at: string
}

export interface Organization {
  id: string
  name: string
  type: string
  owner_id: string
  plan: Plan
  receipt_limit: number
  currency: string
  created_at: string
}

export interface OrgMember {
  id: string
  org_id: string
  user_id: string
  role: Role
  whatsapp_number: string | null
  whatsapp_active: boolean
  joined_at: string | null
  profiles?: Profile
}

export interface Receipt {
  id: string
  org_id: string
  uploaded_by: string | null
  uploaded_via: UploadedVia
  vendor_name: string | null
  amount: number
  currency: string
  tax_amount: number | null
  date: string
  category: ReceiptCategory
  notes: string | null
  image_url: string | null
  ai_confidence: 'high' | 'medium' | 'low' | null
  is_verified: boolean
  created_at: string
  profiles?: Profile
}

export interface Budget {
  id: string
  org_id: string
  category: ReceiptCategory
  amount: number
  period: 'monthly' | 'weekly'
  month: number | null
  year: number | null
}

export interface Reminder {
  id: string
  org_id: string
  title: string
  due_date: string
  recurrence: string
  category: string
  status: 'active' | 'fired' | 'dismissed'
}

export interface ShareLink {
  id: string
  org_id: string
  token: string
  permission: 'read' | 'export'
  expires_at: string | null
  created_at: string
}

export interface Client {
  id: string
  org_id: string
  name: string
  phone: string | null
  email: string | null
  address: string | null
  notes: string | null
  total_earned: number
  outstanding_balance: number
  status: 'active' | 'inactive' | 'archived'
  created_via: string
  created_at: string
}

export interface Project {
  id: string
  org_id: string
  client_id: string
  name: string
  description: string | null
  total_fee: number
  amount_received: number
  balance_due: number
  currency: string
  start_date: string
  deadline: string | null
  status: 'in_progress' | 'delivered' | 'completed' | 'cancelled' | 'on_hold'
  delivered_at: string | null
  completed_at: string | null
  notes: string | null
  created_at: string
  clients?: Client
}

export interface ClientPayment {
  id: string
  org_id: string
  client_id: string
  project_id: string | null
  amount: number
  currency: string
  payment_type: 'deposit' | 'part_payment' | 'full_payment' | 'retainer'
  payment_date: string
  payment_reference: string | null
  receipt_image_url: string | null
  notes: string | null
  created_at: string
}

export interface LineItem {
  description: string
  quantity: number
  unit_price: number
  total: number
}

export interface Invoice {
  id: string
  org_id: string
  client_id: string | null
  project_id: string | null
  invoice_number: string | null
  client_name: string | null
  client_email: string | null
  line_items: LineItem[]
  subtotal: number
  tax_rate: number
  tax_amount: number
  total_amount: number
  currency: string
  status: 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled'
  issue_date: string
  due_date: string | null
  paid_at: string | null
  pdf_url: string | null
  notes: string | null
  created_at: string
  clients?: { name: string; email: string | null } | null
}

export interface ScannedReceipt {
  vendor_name: string | null
  amount: number
  currency: string
  tax_amount: number | null
  date: string
  category: ReceiptCategory
  confidence: 'high' | 'medium' | 'low'
}
