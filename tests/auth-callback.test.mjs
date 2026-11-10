import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
const source = await readFile(new URL('../src/renderer/helpers/authCallback.js', import.meta.url), 'utf8')
const { parseAuthReturn } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)
test('normal hash routes are not treated as authentication callbacks', () => {
  assert.equal(parseAuthReturn('https://example.com/#/watch/video?code=normal-search'), null)
})
test('confirmation credentials are extracted and removed from the router URL', () => {
  const result = parseAuthReturn('https://example.com/YuTub-Premium/#access_token=access&refresh_token=refresh&type=signup')
  assert.deepEqual(result.callback, { kind: 'session', session: { access_token: 'access', refresh_token: 'refresh' } })
  assert.equal(result.cleanHref, 'https://example.com/YuTub-Premium/#/popular')
  const code = parseAuthReturn('https://example.com/YuTub-Premium/?code=example-code')
  assert.equal(code.callback.kind, 'code')
  assert.equal(code.cleanHref.includes('example-code'), false)
})
test('expired confirmation links surface an error without retaining credential fragments', () => {
  const result = parseAuthReturn('https://example.com/#error=access_denied&error_description=Expired')
  assert.equal(result.callback.kind, 'error')
  assert.equal(result.cleanHref, 'https://example.com/#/popular')
})
