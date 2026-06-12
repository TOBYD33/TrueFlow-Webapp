// supabase.ts
// Supabase client singleton — import this everywhere instead of creating new clients.

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import ws from 'ws'

dotenv.config({ override: true })

const supabaseUrl = process.env.SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env')
}

// Use service role key — bot runs server-side and needs to bypass RLS
// Pass ws transport for Node.js < 22 which lacks native WebSocket
export const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  realtime: { transport: ws as any }
})
