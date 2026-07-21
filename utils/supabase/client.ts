import { createBrowserClient } from "@supabase/ssr";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
// Accept both the project-specific name and the standard Supabase name.
const supabaseKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

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
      getUser: async () => ({ data: { user: null }, error: null }),
      signOut: async () => ({ error: null }),
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
