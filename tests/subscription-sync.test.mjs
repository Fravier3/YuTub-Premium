import { test } from 'node:test'
import assert from 'node:assert/strict'

const { cleanSyncEntries, mergeSyncEntries, planLocalChanges, sameSyncEntries, trackLocalChanges } = await import('../src/renderer/helpers/subscriptionMerge.js')

const id = letter => 'UC' + letter.repeat(22)
const channel = (letter, name = `Canal ${letter}`) => ({ id: id(letter), name, thumbnail: 'https://yt3.googleusercontent.com/' + letter })
const active = entries => entries.filter(entry => !entry.removed).map(entry => entry.id).sort()

test('first sync uploads the phone subscriptions and a new device receives them', () => {
  const phone = trackLocalChanges([channel('a'), channel('b')], [], 1000)
  const cloud = mergeSyncEntries(phone, [])
  assert.deepEqual(active(cloud), [id('a'), id('b')])

  const tablet = trackLocalChanges([], [], 2000)
  const merged = mergeSyncEntries(tablet, cloud)
  assert.deepEqual(planLocalChanges([], merged), { add: merged, remove: [] })
  assert.deepEqual(active(merged), [id('a'), id('b')])
})

test('both devices keep what each one added: nothing is lost for being missing on one side', () => {
  const phone = trackLocalChanges([channel('a')], [], 1000)
  const tablet = trackLocalChanges([channel('b')], [], 1500)
  const merged = mergeSyncEntries(tablet, phone)
  assert.deepEqual(active(merged), [id('a'), id('b')])
  assert.deepEqual(planLocalChanges([channel('b')], merged).add.map(entry => entry.id), [id('a')])
  assert.deepEqual(planLocalChanges([channel('b')], merged).remove, [])
})

test('unsubscribing on one device removes the channel on the other, and resubscribing later wins', () => {
  const start = trackLocalChanges([channel('a'), channel('b')], [], 1000)
  // El teléfono se da de baja de B
  const phone = trackLocalChanges([channel('a')], start, 2000)
  assert.equal(phone.find(entry => entry.id === id('b')).removed, true)
  // La tableta todavía tiene B, sin cambios desde la última sincronización
  const tablet = trackLocalChanges([channel('a'), channel('b')], start, 3000)
  const merged = mergeSyncEntries(tablet, phone)
  assert.deepEqual(planLocalChanges([channel('a'), channel('b')], merged), { add: [], remove: [id('b')] })
  // Más tarde la tableta vuelve a suscribirse a B: esa decisión es la más reciente
  const again = trackLocalChanges([channel('a'), channel('b')], merged, 4000)
  assert.deepEqual(active(mergeSyncEntries(again, phone)), [id('a'), id('b')])
})

test('wiped browser data is not mistaken for unsubscribing from everything', () => {
  const record = trackLocalChanges([channel('a'), channel('b'), channel('c')], [], 1000)
  const afterWipe = trackLocalChanges([], record, 5000)
  assert.deepEqual(active(afterWipe), [id('a'), id('b'), id('c')])
  // Darse de baja del último canal que quedaba sí cuenta
  const single = trackLocalChanges([channel('a')], [], 1000)
  assert.deepEqual(active(trackLocalChanges([], single, 2000)), [])
})

test('entries are validated, deduplicated and compared regardless of order', () => {
  const dirty = [
    { id: 'not-a-channel', name: 'x' },
    { id: id('a'), name: 'Viejo', at: 1, thumbnail: 'javascript:alert(1)' },
    { id: id('a'), name: 'Nuevo', at: 5, thumbnail: 'https://yt3.googleusercontent.com/a' },
    null
  ]
  const clean = cleanSyncEntries(dirty)
  assert.equal(clean.length, 1)
  assert.equal(clean[0].name, 'Nuevo')
  assert.equal(cleanSyncEntries([{ id: id('b'), thumbnail: 'javascript:alert(1)' }])[0].thumbnail, '')
  const a = trackLocalChanges([channel('a'), channel('b')], [], 1000)
  assert.equal(sameSyncEntries(a, [...a].reverse()), true)
  assert.equal(sameSyncEntries(a, a.slice(1)), false)
})
