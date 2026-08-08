import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseAnonKey, getSupabaseUrl } from '@/lib/supabase/public-env';

const supabaseUrl = getSupabaseUrl();
const supabaseKey = getSupabaseAnonKey();

type SupabaseClient = ReturnType<typeof createBrowserClient>;

function createNullClient(): SupabaseClient {
  const noop = () => {};
  const nullQuery: Record<string, unknown> = {};
  nullQuery.select = () => nullQuery;
  nullQuery.eq = () => nullQuery;
  nullQuery.neq = () => nullQuery;
  nullQuery.gte = () => nullQuery;
  nullQuery.order = () => nullQuery;
  nullQuery.limit = () => nullQuery;
  nullQuery.single = async () => ({ data: null, error: null });
  nullQuery.insert = async () => ({ data: null, error: null });
  nullQuery.update = async () => ({ data: null, error: null });
  nullQuery.delete = async () => ({ data: null, error: null });
  nullQuery.then = undefined;

  // Null channel — no-op so hooks don't crash when env vars are missing.
  const nullChannel = {
    on:        () => nullChannel,
    subscribe: (_cb?: unknown) => nullChannel,
  };

  return {
    auth: {
      getUser:           async () => ({ data: { user: null }, error: null }),
      getSession:        async () => ({ data: { session: null }, error: null }),
      signOut:           async () => ({ error: null }),
      signInWithOAuth:   async () => ({ data: null, error: null }),
      signInWithPassword: async () => ({ data: { user: null, session: null }, error: null }),
      signUp:            async () => ({ data: { user: null, session: null }, error: null }),
      onAuthStateChange: (_event: unknown, _callback: unknown) => ({
        data: { subscription: { unsubscribe: noop } },
      }),
    },
    from:          () => nullQuery,
    channel:       (_name: string) => nullChannel,
    removeChannel: (_ch: unknown) => Promise.resolve(),
  } as unknown as SupabaseClient;
}

export const createClient = (): SupabaseClient =>
  supabaseUrl && supabaseKey
    ? createBrowserClient(supabaseUrl, supabaseKey)
    : createNullClient();
