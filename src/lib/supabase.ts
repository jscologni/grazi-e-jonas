import { createClient } from '@supabase/supabase-js'

// Chave publicável: pode ficar no app. A proteção dos dados é feita pelas regras (RLS) do banco.
const URL = 'https://hwlhdgioxlmiucmtgtom.supabase.co'
const KEY = 'sb_publishable_328WWUUGZs_ywwb7zL_WzQ_gkjjE5yy'

export const supabase = createClient(URL, KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'implicit' },
})
