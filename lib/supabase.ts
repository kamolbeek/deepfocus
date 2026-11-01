import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

// Kalitlar berilmagan bo'lsa ilova faqat shu qurilmada (localStorage) ishlaydi
export const supabase: SupabaseClient | null =
  url && key
    ? createClient(url, key, {
        auth: { flowType: "pkce", persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      })
    : null;
