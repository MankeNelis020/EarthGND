'use client';

import { createClient } from '@/utils/supabase/client';

export function LogoutButton() {
  async function handleLogout() {
    await createClient().auth.signOut();
    window.location.href = '/';
  }

  return (
    <button
      type="button"
      onClick={handleLogout}
      className="text-sm text-white/40 hover:text-white transition-colors"
    >
      Uitloggen
    </button>
  );
}
