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
let source = await readFile(new URL('../src/renderer/helpers/yutuIdentity.js', import.meta.url), 'utf8')
source = source.replace(/import (puppy|astronaut|queen|motorcycle) from [^\n]+/g, 'const $1 = "$1.webp"')
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
  await module.signOutAccount()
  assert.equal(module.identity.profile.name, 'Vazquez')
  assert.equal(module.identity.history[0].videoId, 'ABCDEFGHIJK')
})
