ANAIRA V17 - AUTH LOCK / LOADING FIX
====================================

What was fixed:
1. Supabase auth bootstrap no longer starts duplicate profile syncs when
   INITIAL_SESSION/SIGNED_IN races with the initial startup sync.
2. AuthProvider queues genuinely new auth states instead of starting a second
   sync while one is already running.
3. After the first successful bootstrap, pathname changes reuse the cached
   authenticated user instead of repeatedly calling Auth.getUser().
4. Offline startup can restore the cached identity without depending on a
   network auth request.
5. The /order page now uses getSession() for its initial user lookup instead of
   forcing another getUser() request.
6. lib/supabase.js was updated to the cloud/local runtime-aware client used by
   the stable Anaira auth flow.

IMPORTANT:
This archive is a source patch based on the supplied Anaira v16 source. It
must be copied/merged into the actual Anaira project that contains the rest of
the components (Sidebar, AppUtilities, etc.). Do not delete your existing
components directory just because this archive does not contain every UI
component.

After copying the files:
  1. Stop Next.js (Ctrl+C)
  2. Delete .next
  3. Start npm run dev again
  4. Open only one localhost Anaira tab for the first test
  5. If the old auth lock message remains, sign out once and sign in again.
