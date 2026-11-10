import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
globalThis.window = { addEventListener() {} }
const values = new Map()
globalThis.localStorage = { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value) }
const rows = new Map()
let activeId
let failWrite = false
const client = {
  auth: {
    onAuthStateChange() {},
    async signInWithPassword({ email }) { activeId = email; return { data: { session: { user: { id: email, email } } } } },
    async setSession(session) { assert.equal(session.access_token, 'test-access'); activeId = 'callback-account'; return { data: { session: { user: { id: activeId, email: 'callback@example.invalid' } } } } },
    async signOut() { activeId = null; return {} }
  },
  from(table) {
    assert.equal(table, 'yutu_user_state')
    return {
      select() { return { eq(column, id) { assert.equal(column, 'user_id'); assert.equal(id, activeId); return { maybeSingle: async () => ({ data: rows.get(id) || null }) } } } },
      async upsert(payload) { assert.equal(payload.user_id, activeId); if (failWrite) return { error: new Error('offline') }; rows.set(payload.user_id, JSON.parse(JSON.stringify(payload))); return {} }
    }
  }
}
globalThis.__identityClient = client
const callbackSource = await readFile(new URL('../src/renderer/helpers/authCallback.js', import.meta.url), 'utf8')
const callbackUrl = `data:text/javascript;base64,${Buffer.from(callbackSource).toString('base64')}`
let source = await readFile(new URL('../src/renderer/helpers/yutuIdentity.js', import.meta.url), 'utf8')
source = source.replace("from './authCallback'", `from '${callbackUrl}'`).replace(/import (puppy|astronaut|queen|motorcycle) from [^\n]+/g, 'const $1 = "$1.webp"')
  .replace("from 'vue'", `from '${import.meta.resolve('vue')}'`)
  .replace("import('@supabase/supabase-js')", 'Promise.resolve({ createClient: () => globalThis.__identityClient })')
const module = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)
test('local profile persists, validates images and caps personal history', () => {
  module.saveProfile({ name: 'Vazquez', avatar: 'astronaut', custom: 'javascript:alert(1)' })
  assert.equal(module.identity.profile.custom, '')
  assert.match(values.get('yutu-identity-v1:guest'), /Vazquez/)
  module.rememberListening({ videoId: 'ABCDEFGHIJK', title: 'Podcast', author: 'A' })
  assert.equal(module.identity.history.length, 1)
  module.rememberListening({ videoId: 'ABCDEFGHIJK', title: 'Podcast', author: 'A' })
  assert.equal(module.identity.history.length, 1)
  assert.equal(module.cleanHistory([{ videoId: 'invalid' }]).length, 0)
})
test('account switch scopes reads/writes and never copies another account into the guest profile', async () => {
  rows.set('account-a', { profile: { name: 'Persona A', avatar: 'queen' }, history: [{ videoId: 'ABCDEFGHIJL', timeWatched: 1 }], updated_at: new Date().toISOString() })
  rows.set('account-b', { profile: { name: 'Persona B', avatar: 'motorcycle' }, history: [], updated_at: new Date().toISOString() })
  await module.authenticate('account-a', 'password')
  assert.equal(module.identity.profile.name, 'Persona A')
  await module.authenticate('account-b', 'password')
  assert.equal(module.identity.profile.name, 'Persona B')
  assert.equal(module.identity.history.length, 0)
  failWrite = true
  module.saveProfile({ name: 'Offline B', avatar: 'motorcycle' })
  await module.syncAccount()
  assert.match(values.get('yutu-identity-v1:account-b'), /Offline B/)
  assert.ok(module.identity.error)
  assert.equal(module.identity.sessionStatus, 'signed-in', 'a sync failure must not be presented as logged out')
  assert.equal(module.identity.syncState, 'error')
  await module.signOutAccount()
  assert.equal(module.identity.profile.name, 'Vazquez')
  assert.equal(module.identity.history[0].videoId, 'ABCDEFGHIJK')
})

test('confirmation session is captured before hash routing and immediately creates the cloud profile', async () => {
  failWrite = false
  let cleaned
  globalThis.window = {
    location: { href: 'https://fravier3.github.io/YuTub-Premium/#access_token=test-access&refresh_token=test-refresh&type=signup' },
    history: { replaceState(_state, _title, href) { cleaned = href } },
    addEventListener() {}
  }
  const callbackModule = await import(`data:text/javascript;base64,${Buffer.from(source + '\n// callback module').toString('base64')}`)
  assert.equal(cleaned, 'https://fravier3.github.io/YuTub-Premium/#/popular')
  await callbackModule.restoreAccount()
  assert.equal(callbackModule.identity.sessionStatus, 'signed-in')
  assert.equal(callbackModule.identity.user.email, 'callback@example.invalid')
  assert.equal(callbackModule.identity.syncState, 'synced')
  assert.ok(rows.has('callback-account'), 'first login saves profile automatically without another Save click')
})

test('new registration uses only the Yutu endpoint then logs in with password automatically', async () => {
  failWrite = false
  globalThis.fetch = async (url, options) => {
    assert.equal(url, 'https://syyealdlapxmpeccaary.supabase.co/functions/v1/yutu-signup')
    assert.equal(options.method, 'POST')
    assert.equal(JSON.parse(options.body).email, 'new-account')
    return { ok: true, json: async () => ({ created: true }) }
  }
  await module.authenticate('new-account', 'password', true)
  assert.equal(module.identity.user.id, 'new-account')
  assert.equal(module.identity.sessionStatus, 'signed-in')
  assert.equal(module.identity.syncState, 'synced')
  assert.ok(rows.has('new-account'))
})
