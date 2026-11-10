/** Supabase's confirmation fragment must be captured before the hash router starts. */
export function parseAuthReturn(href) {
  const url = new URL(href)
  const fragment = url.hash.startsWith('#/') ? new URLSearchParams() : new URLSearchParams(url.hash.slice(1))
  const access = fragment.get('access_token')
  const refresh = fragment.get('refresh_token')
  const code = url.searchParams.get('code')
  const error = fragment.get('error_description') || url.searchParams.get('error_description')
  let callback = null
  if (access && refresh) callback = { kind: 'session', session: { access_token: access, refresh_token: refresh } }
  else if (code) callback = { kind: 'code', code }
  else if (error) callback = { kind: 'error' }
  if (!callback) return null
  for (const key of ['code', 'error', 'error_description', 'error_code']) url.searchParams.delete(key)
  url.hash = '/popular'
  return { callback, cleanHref: url.href }
}
