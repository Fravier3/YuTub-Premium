import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
const source = await readFile(new URL('../supabase/functions/yutu-signup/handler.js', import.meta.url), 'utf8')
const { createSignupHandler } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)
function setup({ allowed = true, existing = false } = {}) {
  const created = []
  const handler = createSignupHandler({ publicKey: 'public-key', hash: async () => 'a'.repeat(64), reserve: async () => allowed, admin: { async createUser(input) { created.push(input); return existing ? { error: new Error('exists') } : { data: {} } } } })
  return { created, handler }
}
const request = (body, extra = {}) => new Request('https://example.com/signup', { method: 'POST', headers: { Origin: 'https://fravier3.github.io', apikey: 'public-key', 'Content-Type': 'application/json', ...extra }, body: JSON.stringify(body) })
test('Yutu creates a new password account without email confirmation', async () => {
  const { created, handler } = setup()
  const result = await handler(request({ email: 'USER@example.invalid', password: 'test-password' }))
  assert.equal(result.status, 201)
  assert.deepEqual(created, [{ email: 'user@example.invalid', password: 'test-password', email_confirm: true, app_metadata: { signup_app: 'yutu' } }])
  assert.deepEqual(await result.json(), { created: true })
})
test('invalid credentials, origins and rate limits never create users', async () => {
  const { created, handler } = setup()
  assert.equal((await handler(request({ email: 'invalid', password: 'short' }))).status, 400)
  assert.equal((await handler(request({}, { Origin: 'https://example.com' }))).status, 403)
  assert.equal((await handler(request({}, { apikey: 'wrong' }))).status, 401)
  assert.equal(created.length, 0)
  const limited = setup({ allowed: false })
  assert.equal((await limited.handler(request({ email: 'user@example.invalid', password: 'test-password' }))).status, 429)
  assert.equal(limited.created.length, 0)
})
test('existing accounts are never modified or automatically signed in by signup', async () => {
  const { handler } = setup({ existing: true })
  const result = await handler(request({ email: 'user@example.invalid', password: 'test-password' }))
  assert.equal(result.status, 409)
  assert.equal((await result.json()).created, undefined)
})
