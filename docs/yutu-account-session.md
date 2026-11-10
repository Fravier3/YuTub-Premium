# Yutu 1.0.24: account session versus synchronization

A confirmed Auth user and a login event from an email confirmation are not evidence that the installed Yutu PWA has retained its own session. In 1.0.23, the SDK was only initialized when its storage key already existed and automatic URL detection was disabled. A first confirmation return with tokens therefore could be lost to the hash router.

The callback helper now captures an implicit session or authorization code before the router starts, removes credentials from the URL, and restores/exchanges the session through the SDK. Expired links show an explicit recovery message. Signup requests use Yutu's URL as their per-request email redirect; the shared project's redirect allowlist and global Auth settings are unchanged. If a mail link opens another browser context or the redirect is not allowed by existing project settings, the user can return to Yutu and sign in with email/password.

The profile dialog displays session status and connected email separately from local/pending/syncing/synced/error data state. The account menu also displays whether a session exists; a connected account has a green indicator. A synchronization failure never presents the account as signed out. Successful first login automatically loads or creates the user's Yutu state without another Save click.

Validation: 25 local tests pass, including callback capture before hash routing, URL credential removal, automatic initial cloud profile creation through a mocked client, and signed-in state retained during a synchronization error. No real user credentials, sessions, or production Auth users were modified for tests. The user's session on their phone cannot be verified from server confirmation events alone.

## 1.0.25: Yutu signup without confirmation email

The user chose email/password with no confirmation email. New Yutu registrations now go through the `yutu-signup` Edge Function, which creates only new users with `email_confirm: true` and then lets the client perform normal password login. Existing users are never confirmed, reset or modified by this endpoint. The shared project's global confirmation setting remains unchanged. Email addresses for these new users are self-declared; this flow does not prove ownership of the mailbox.

The public signup endpoint validates the application origin, project publishable key, method, JSON/body limits and credentials. Server-side HMAC identifiers feed an atomic database rate limiter (3 attempts per email/hour and 10 per network/hour). No raw email, IP or password is stored in limiter rows. Network headers are a best-effort abuse signal, not an authorization mechanism. `yutu_private` and its limiter RPC are inaccessible to anon/authenticated roles; only service_role can call the SECURITY INVOKER routine. The privileged key exists only in the Edge Function environment. JWT verification is disabled for this explicitly public registration endpoint, not for protected user data.

29 local tests pass. A deployed invalid-registration request verifies validation/runtime without creating a production test user. Real registration with email/password is performed by the user in Yutu.
