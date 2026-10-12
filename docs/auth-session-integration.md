# Staff login and invoice access

The frontend now uses POST `/api/auth/login` and GET `/api/auth/me`. Only an active backend staff profile can sign in. Demo credentials and legacy `{userId, role}` sessions no longer grant access. Roles are normalized for existing UI consumers, while permission checks use the backend permissions list (including empty lists) and the backend's Admin exception.

The API wrapper reads only `vantrix.session`; it no longer picks up unrelated Supabase SDK sessions after logout. It attaches the access token to invoice and other API requests. A protected API 401 triggers sign-out; 403 remains a permission error.

## Session behavior

- Remember me stores the access token and expiry in local storage; otherwise session storage is used.
- Reload verifies the token and current staff profile against `/api/auth/me`.
- Expiry and inactivity clear the local session and ask the user to sign in again. **Automatic token refresh is not implemented.** Remember me lasts only until the access token expires.
- Passwords and refresh tokens are not stored by this frontend. Access tokens are browser-readable, so this is not an HttpOnly-cookie session design.
- Logout clears browser session storage; it does not revoke an already issued token on the server. The token remains subject to Supabase expiry and backend authorization.
- A cross-tab session change invalidates the displayed profile without deleting the new shared session.
- Profile editing, account registration and password changes previously only changed demo data. They now return an explicit unavailable error. The password assistance page directs users to their administrator. These backend integrations are separate work.
- Preferences remain per-user on this browser; they are not saved to the server. Mock security history is no longer displayed.

## Verification

From the repository root, run:

```sh
node --test Frontend/tests/*.test.mjs Backend/tests/invoices.test.mjs
```

Automated tests use API/database doubles: they verify credential submission, role mapping, session storage, expiry, restoration, logout races, token forwarding to invoices, 401/403 handling and permission denial. Frontend build and targeted lint also pass. They do not prove live Supabase credentials, migrations, RLS or invoice records.

For live verification, start the normal development stack and sign in through the browser with an existing active staff account. Do not put passwords or tokens into a chat or commit them. Open Invoices, reload the page, view an existing invoice, then sign out. Verify an empty store shows the empty state, and a role without `invoices.view` cannot open the page. Use test stores for cross-store RLS verification; do not seed artificial paid invoices into production.
