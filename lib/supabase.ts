import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Debug logging
if (typeof window !== 'undefined') {
  console.log('[Supabase] Initializing with URL:', supabaseUrl);
  if (!supabaseUrl || !supabaseKey) {
    console.error('[Supabase] Missing credentials!', {
      hasUrl: !!supabaseUrl,
      hasKey: !!supabaseKey,
    });
  }
}

export const supabase = createClient(
  supabaseUrl!,
  supabaseKey!,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
  }
);