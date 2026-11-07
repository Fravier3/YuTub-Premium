import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
const source = await readFile(new URL('../src/renderer/helpers/latinMusicFeed.js', import.meta.url), 'utf8')
const { loadLatinMusicFeed, LATIN_FEED_TTL } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)
const video = (id, title = 'Salsa latina') => ({ type: 'video', videoId: id, title, author: 'Artista' })
test('regional feed rejects unrelated global videos and deduplicates searches', async () => {
  const regions = []
  const items = await loadLatinMusicFeed({
    now: 0,
    trending: async region => { regions.push(region); return [video('latin'), video('us', 'My life has been ruined by crows')] },
    search: async () => [video('latin'), video('new'), { ...video('live'), liveNow: true }]
  })
  assert.deepEqual(regions, ['PR'])
  assert.deepEqual(new Set(items.map(item => item.videoId)), new Set(['latin', 'new']))
})
test('half-hour rotation changes region and queries; previously shown videos rank last', async () => {
  const requests = []
  const options = {
    trending: async region => { requests.push(region); return [] },
    search: async query => { requests.push(query); return [video('old'), video('fresh')] },
    previousIds: ['old']
  }
  assert.equal((await loadLatinMusicFeed({ ...options, now: 0 }))[0].videoId, 'fresh')
  const previous = requests.splice(0)
  await loadLatinMusicFeed({ ...options, now: LATIN_FEED_TTL })
  assert.notDeepEqual(requests, previous)
})
test('one failed service does not discard successful results; total failure reports error', async () => {
  const fail = async () => { throw new Error('offline') }
  assert.equal((await loadLatinMusicFeed({ trending: fail, search: async () => [video('ok')] })).length, 1)
  await assert.rejects(loadLatinMusicFeed({ trending: fail, search: fail }), /música latina/)
})
