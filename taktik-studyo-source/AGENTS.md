# Taktik Studyo development rules

- Existing frontend behavior must be preserved unless explicitly requested.
- Do not rewrite the project into React or another framework.
- Do not expose Supabase service-role or secret keys to frontend code.
- shared_lineups must not be directly writable/readable by anonymous clients.
- Sharing must continue through the lineups Edge Function.
- Preserve RLS and minimum-privilege grants.
- Active lineup edits remain client-side/localStorage.
- Before changing database schema, explain the migration first.
- Never apply migrations to production without explicit approval.
- Run relevant tests after code changes.
- Show a concise diff summary after every task.