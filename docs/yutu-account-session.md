# Yutu 1.0.24: account session versus synchronization

A confirmed Auth user and a login event from an email confirmation are not evidence that the installed Yutu PWA has retained its own session. In 1.0.23, the SDK was only initialized when its storage key already existed and automatic URL detection was disabled. A first confirmation return with tokens therefore could be lost to the hash router.

The callback helper now captures an implicit session or authorization code before the router starts, removes credentials from the URL, and restores/exchanges the session through the SDK. Expired links show an explicit recovery message. Signup requests use Yutu's URL as their per-request email redirect; the shared project's redirect allowlist and global Auth settings are unchanged. If a mail link opens another browser context or the redirect is not allowed by existing project settings, the user can return to Yutu and sign in with email/password.

The profile dialog displays session status and connected email separately from local/pending/syncing/synced/error data state. The account menu also displays whether a session exists; a connected account has a green indicator. A synchronization failure never presents the account as signed out. Successful first login automatically loads or creates the user's Yutu state without another Save click.

Validation: 25 local tests pass, including callback capture before hash routing, URL credential removal, automatic initial cloud profile creation through a mocked client, and signed-in state retained during a synchronization error. No real user credentials, sessions, or production Auth users were modified for tests. The user's session on their phone cannot be verified from server confirmation events alone.
