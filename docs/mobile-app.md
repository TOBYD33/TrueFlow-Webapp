# Phase 3 — Mobile App (React Native + Expo)
> Read CLAUDE.md first — it has the full schema, env vars, and coding rules.
> Build Phase 1 (WhatsApp bot) and Phase 2 (web app) before starting this.
> Uses the same Supabase backend — no new tables needed.

---

## Goal

The TrueFlio iOS and Android app for business owners who want to scan receipts
and check their finances on their phone. Same Supabase account as WhatsApp bot
and web app — scan on WhatsApp, see it in the app in real time.

Primary users: business owners checking dashboard on the go, scanning receipts
when not near a laptop, receiving push notifications for budget alerts.

---

## Folder Structure

```
/mobile
  /app                          ← Expo Router (file-based routing)
    _layout.tsx                 ← Root layout, auth check
    /(auth)
      login.tsx
      signup.tsx
    /(tabs)
      _layout.tsx               ← Bottom tab bar
      index.tsx                 ← Dashboard (home tab)
      scan.tsx                  ← Camera scanner tab
      receipts.tsx              ← Receipt list tab
      reports.tsx               ← Charts and reports tab
      settings.tsx              ← Account and subscription tab
    /receipt/[id].tsx           ← Receipt detail screen
    /team/index.tsx             ← Team management screen
    /budgets/index.tsx          ← Budget management screen
    /reminders/index.tsx        ← Reminders list screen
    /invoice/index.tsx          ← Invoice list (Pro plan)
    /paywall.tsx                ← Upgrade screen shown when limit hit
  /components
    StatCard.tsx                ← Number card with label and trend
    ReceiptItem.tsx             ← Single receipt row with channel badge
    ChannelBadge.tsx            ← WhatsApp / App / Web badge
    CategoryDonut.tsx           ← Victory Native pie chart
    SpendTrendChart.tsx         ← Victory Native line chart
    BudgetBar.tsx               ← Progress bar per category
    PlanGate.tsx                ← Hides content for lower plan users
    EmptyState.tsx              ← Empty screen with icon and message
  /hooks
    useReceipts.ts              ← Fetch + realtime subscription
    useOrg.ts                   ← Current org + members
    useBudgets.ts               ← Budgets + % used
    useReminders.ts             ← Upcoming reminders
    useAuth.ts                  ← Current user session
  /services
    supabase.ts                 ← Supabase client with SecureStore adapter
    receipt-scanner.ts          ← Claude Vision API — same prompt as bot
    push-notifications.ts       ← Register + handle Expo push tokens
  /types
    index.ts
```

---

## Every Screen — What It Contains

### Dashboard (Home Tab)
- Greeting: "Good morning, {name}" with date
- 3 stat cards: Total Spent, Receipt Count, Budget Health
- Main balance card with 6-month mini bar chart
- Quick action buttons: Scan Receipt, View Reports
- Recent receipts feed — last 5 items with ChannelBadge
- Real-time: updates instantly when WhatsApp scan arrives (Supabase Realtime)
- Budget alert banner if any category is over 80%

### Scan Tab
- Full-screen camera viewfinder with scan overlay (4 corner brackets)
- Shutter button at bottom
- "Select from gallery" option
- On capture: loading state "AI reading receipt..."
- Confirmation screen: editable fields for vendor, amount, date, category, tax
- Save button → saves to Supabase → success animation
- "Scan another" button after success

### Receipts Tab
- Scrollable list of receipts ordered by date
- Filter row: date range, category, channel
- Search bar — searches vendor name
- Each item: emoji icon, vendor name, category, amount (right-aligned), channel badge, date
- Pull to refresh
- Tap item → /receipt/[id] detail screen

### Receipt Detail /receipt/[id]
- Receipt image at top (full width, tappable to zoom)
- All fields: vendor, amount, category, date, tax, uploaded by, channel, AI confidence
- Edit button → inline editing of all fields
- Delete button (with confirmation)
- Notes field

### Reports Tab
- Month selector (left/right arrows)
- Summary row: total, count, avg, tax
- Category donut chart (Victory Native) — tap slice to see amount
- Spend trend line chart — last 6 months
- Per-staff breakdown (Business plan — PlanGate)
- Export PDF button → share sheet (can share to WhatsApp, email, etc.)

### Settings Tab
- Profile section: name, phone, avatar
- Business section: company name, currency
- Subscription: current plan, upgrade button → Paywall screen
- WhatsApp Bot: toggle on/off, linked phone number
- Notifications: budget alerts, weekly summary, new WhatsApp scan
- Team: link to /team screen
- Sign out

### Budgets Screen /budgets
- List all budgets with progress bars (BudgetBar component)
- Color: green < 70%, amber 70-89%, red 90%+
- "Add Budget" button → modal: pick category, enter amount
- Tap budget → edit amount
- Delete budget

### Reminders Screen /reminders
- List all active reminders sorted by due date
- Each item: title, due date, category tag, recurrence badge
- "Add Reminder" button → form: title, date picker, recurrence, category
- Tap reminder → edit or dismiss
- Overdue reminders shown in red at top

### Paywall Screen /paywall
- Shown automatically when free user hits 10 receipt limit
- Plan comparison cards: Free | Business | Pro
- "Upgrade" button → opens Paystack link in system browser
- "Maybe later" → goes back

---

## Real-time Sync Hook

```typescript
// hooks/useReceipts.ts
// Fetches receipts and subscribes to new ones from any channel in real time

import { useState, useEffect } from 'react'
import { supabase } from '../services/supabase'

export function useReceipts(orgId: string) {
  const [receipts, setReceipts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchReceipts()

    const channel = supabase
      .channel(`receipts:${orgId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'receipts',
        filter: `org_id=eq.${orgId}`
      }, (payload) => {
        setReceipts(prev => [payload.new, ...prev])
        // Show toast: "New receipt via WhatsApp"
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [orgId])

  async function fetchReceipts() {
    const { data, error } = await supabase
      .from('receipts')
      .select('*, profiles(full_name)')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false })
      .limit(100)

    if (error) console.error('fetchReceipts failed:', error)
    setReceipts(data || [])
    setLoading(false)
  }

  return { receipts, loading, refetch: fetchReceipts }
}
```

---

## receipt-scanner.ts — Claude Vision on Mobile

```typescript
// services/receipt-scanner.ts
// Captures image, converts to base64, calls Claude Vision API.
// Same extraction prompt as the WhatsApp bot for consistency.

import * as FileSystem from 'expo-file-system'
import * as ImageManipulator from 'expo-image-manipulator'
import Anthropic from '@anthropic-ai/sdk'

const claude = new Anthropic({ apiKey: process.env.EXPO_PUBLIC_ANTHROPIC_KEY })

export async function scanReceiptFromUri(imageUri: string) {
  // Resize to max 1024px to reduce API cost
  const resized = await ImageManipulator.manipulateAsync(
    imageUri,
    [{ resize: { width: 1024 } }],
    { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG }
  )

  // Read as base64
  const base64 = await FileSystem.readAsStringAsync(resized.uri, {
    encoding: FileSystem.EncodingType.Base64
  })

  const response = await claude.messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 500,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'image',
          source: { type: 'base64', media_type: 'image/jpeg', data: base64 }
        },
        {
          type: 'text',
          text: `Extract receipt data. Return ONLY valid JSON, no markdown, no backticks:
{
  "vendor_name": "string or null",
  "amount": number,
  "currency": "NGN or USD etc",
  "tax_amount": number or null,
  "date": "YYYY-MM-DD",
  "category": "Food & Drink|Transport|Utilities|Office Supplies|Marketing|Rent|Salaries|Other",
  "confidence": "high|medium|low"
}`
        }
      ]
    }]
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : '{}'
  return JSON.parse(text)
}
```

---

## Push Notifications

```typescript
// services/push-notifications.ts
// Registers device for push notifications and saves token to Supabase

import * as Notifications from 'expo-notifications'
import { supabase } from './supabase'

export async function registerForPushNotifications(userId: string) {
  const { status } = await Notifications.requestPermissionsAsync()
  if (status !== 'granted') return

  const token = (await Notifications.getExpoPushTokenAsync()).data

  await supabase
    .from('profiles')
    .update({ expo_push_token: token })
    .eq('id', userId)
}

// Push notifications sent for:
// - Budget alert: "⚠️ Transport budget at 85% — ₦102,000 of ₦120,000 used"
// - Weekly summary: "📊 Weekly report ready — ₦47,000 spent this week"
// - New WhatsApp scan: "✅ Ibrahim scanned a receipt — ₦18,000 Transport"
// - Reminder: "🔔 Pay VAT — due tomorrow"
// - Subscription renewal: "💳 Business plan renews in 3 days"
// Notifications are sent from Supabase Edge Functions using Expo Push API
```

---

## Supabase Client with SecureStore

```typescript
// services/supabase.ts
// Supabase client for React Native — uses SecureStore for session persistence

import { createClient } from '@supabase/supabase-js'
import * as SecureStore from 'expo-secure-store'

const adapter = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key)
}

export const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL!,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
  {
    auth: {
      storage: adapter,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false
    }
  }
)
```

---

## Mobile Environment Variables

Create `/mobile/.env`:
```env
EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_ANON_KEY=
EXPO_PUBLIC_ANTHROPIC_KEY=
EXPO_PUBLIC_WEBAPP_URL=https://app.trueflio.com
EXPO_PUBLIC_PRICING_URL=https://trueflio.com/pricing
```

---

## Package.json Dependencies

```json
{
  "dependencies": {
    "expo": "~51.0.0",
    "expo-router": "~3.5.0",
    "expo-camera": "~15.0.0",
    "expo-image-picker": "~15.0.0",
    "expo-image-manipulator": "~12.0.0",
    "expo-secure-store": "~13.0.0",
    "expo-notifications": "~0.28.0",
    "expo-file-system": "~17.0.0",
    "@supabase/supabase-js": "^2.39.0",
    "@anthropic-ai/sdk": "latest",
    "victory-native": "^41.0.0",
    "react-native-reanimated": "~3.10.0",
    "react-native-gesture-handler": "~2.16.0",
    "react-native-safe-area-context": "4.10.1",
    "react-native-screens": "~3.31.0"
  }
}
```

---

## App Store Requirements

### iOS
- Bundle ID: com.trueflio.app
- Privacy usage descriptions in app.json:
  - Camera: "TrueFlio uses your camera to scan receipts"
  - Photo Library: "TrueFlio reads receipt images from your library"
- Apple Developer account: $99/year — only pay when ready to submit

### Android
- Package: com.trueflio.app
- Permissions: CAMERA, READ_EXTERNAL_STORAGE
- Google Play Developer: $25 one-time — only pay when ready to submit

---

## Build Order

1. `npx create-expo-app mobile --template` (TypeScript blank template)
2. Install Expo Router: `npx expo install expo-router`
3. Set up `services/supabase.ts` with SecureStore adapter
4. Auth screens: login.tsx, signup.tsx
5. Root `_layout.tsx` — auth check, redirect logic
6. Bottom tab navigator `/(tabs)/_layout.tsx`
7. Dashboard screen `/(tabs)/index.tsx` — stat cards + realtime hook
8. Scan screen `/(tabs)/scan.tsx` — camera + Claude Vision
9. Receipt confirmation screen
10. Receipts list screen `/(tabs)/receipts.tsx`
11. Receipt detail screen `/receipt/[id].tsx`
12. Reports screen with Victory Native charts
13. Budgets screen `/budgets/index.tsx`
14. Reminders screen `/reminders/index.tsx`
15. Team screen `/team/index.tsx`
16. Settings screen `/(tabs)/settings.tsx`
17. Paywall screen `/paywall.tsx`
18. Push notifications registration
19. TestFlight (iOS) + Play Store internal track (Android)
20. Public launch

---

## First Claude Code Prompt for Phase 3

> "Read CLAUDE.md and docs/mobile-app.md.
> Create the /mobile folder and scaffold an Expo app with TypeScript.
> Install Expo Router and set up the folder structure.
> Build services/supabase.ts first, then the auth screens,
> then the root layout with auth check and redirect logic."
