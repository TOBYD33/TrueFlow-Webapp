// types/index.ts
// All shared TypeScript interfaces for TrueFlow WhatsApp bot.

export interface Profile {
  id: string
  full_name: string | null
  phone: string | null
  avatar_url: string | null
  expo_push_token: string | null
  created_at: string
}

export interface Organization {
  id: string
  name: string
  type: string
  owner_id: string
  plan: 'free' | 'solo' | 'business' | 'pro' | 'enterprise'
  receipt_limit: number
  currency: string
  default_tax_country: string
  paystack_customer_id: string | null
  paystack_subscription_id: string | null
  created_at: string
}

export interface OrgMember {
  id: string
  org_id: string
  user_id: string
  role: 'owner' | 'admin' | 'staff' | 'family_member' | 'viewer' | 'accountant'
  whatsapp_number: string | null
  whatsapp_active: boolean
  can_see_clients: boolean
  can_see_income: boolean
  can_export: boolean
  invited_at: string
  joined_at: string | null
  removed_at: string | null
}

export interface Receipt {
  id: string
  org_id: string
  uploaded_by: string | null
  uploaded_via: 'whatsapp' | 'app' | 'web'
  vendor_name: string | null
  amount: number | null
  currency: string
  tax_amount: number | null
  date: string
  category: string
  notes: string | null
  image_url: string | null
  ai_confidence: 'high' | 'medium' | 'low' | null
  is_verified: boolean
  created_at: string
}

export interface Budget {
  id: string
  org_id: string
  category: string
  amount: number
  period: 'monthly' | 'weekly'
  month: number | null
  year: number | null
  created_at: string
}

export interface Reminder {
  id: string
  org_id: string
  title: string
  due_date: string
  recurrence: 'once' | 'daily' | 'weekly' | 'monthly' | 'yearly'
  category: 'tax' | 'salary' | 'supplier' | 'bill' | 'compliance' | 'custom'
  status: 'active' | 'fired' | 'dismissed'
  fired_at: string | null
  created_at: string
}

export interface WhatsAppSession {
  id: string
  phone_number: string
  org_id: string | null
  user_id: string | null
  is_new: boolean
  last_active_at: string
  created_at: string
}

export interface ScannedReceipt {
  vendor_name: string | null
  amount: number | null
  currency: string
  tax_amount: number | null
  date: string
  category: string
  notes: string | null
  ai_confidence: 'high' | 'medium' | 'low'
}

export interface SpendingCategory {
  name: string
  amount: number
  count: number
}

export interface MonthlySpending {
  total: number
  count: number
  categories: SpendingCategory[]
}

export interface BudgetStatus {
  category: string
  limit: number
  spent: number
  period: string
}

export interface UserContext {
  user_id: string
  org_id: string
  org_name: string
  org_status: string
  full_name: string
  plan: string
  currency: string
  receipt_limit: number
  whatsapp_number: string
  role: 'owner' | 'admin' | 'staff' | 'family_member' | 'viewer' | 'accountant' | string
  whatsapp_active: boolean
  can_see_clients: boolean
  can_see_income: boolean
  can_export: boolean
  default_tax_country: string
}

export interface TwilioWebhookBody {
  From: string
  To: string
  Body: string
  NumMedia: string
  MediaUrl0?: string
  MediaContentType0?: string
  MessageSid: string
  AccountSid: string
}
