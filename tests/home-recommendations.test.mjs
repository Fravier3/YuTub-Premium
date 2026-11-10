import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
const source = await readFile(new URL('../src/renderer/helpers/homeRecommendations.js', import.meta.url), 'utf8')
const { loadHomeRecommendations, rankForYou, isOfficialMusic } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)
const video = (videoId, title, author = 'Creator', authorId = author, authorVerified = false) => ({ type: 'video', videoId, title, author, authorId, authorVerified })
test('personal signals exclude watched videos and reject unofficial music compilations', () => {
  const official = video('new-song', 'Video oficial', 'Bad Bunny', 'official', true)
  const impostor = video('mix', 'Bad Bunny video oficial', 'Latin Mix')
  assert.equal(isOfficialMusic(official), true)
  assert.equal(isOfficialMusic(impostor), false)
  assert.deepEqual(rankForYou([impostor, official, official, video('watched', 'Podcast')], [{ videoId: 'watched', authorId: 'official' }]), [official])
})
test('home mixes personalized related videos, podcasts, trailers and official music without duplicates', async () => {
  let relatedId
  const result = await loadHomeRecommendations({
    history: [{ videoId: 'watched', authorId: 'favorite' }],
    now: 0,
    search: async query => query.includes('podcast') ? [video('pod', 'Podcast entrevista')] : query.includes('trailer') ? [video('trailer', 'Tráiler oficial')] : [video('music', 'Video oficial', 'Bad Bunny', 'artist', true), video('fake', 'Video oficial', 'Hits Mix')],
    related: async id => { relatedId = id; return [video('personal', 'Nueva conversación', 'Favorite', 'favorite'), video('watched', 'Ya visto')] }
  })
  assert.equal(relatedId, 'watched')
  assert.deepEqual(result.sections.map(s => s.key), ['forYou', 'podcasts', 'trailers', 'music'])
  const ids = result.sections.flatMap(s => s.items.map(v => v.videoId))
  assert.equal(new Set(ids).size, ids.length)
  assert.equal(ids.includes('watched') || ids.includes('fake'), false)
})
test('a failed category does not discard working categories and total failure is explicit', async () => {
  const result = await loadHomeRecommendations({ search: async query => { if (query.includes('podcast')) return [video('pod', 'Podcast')]; throw new Error('offline') }, related: async () => [] })
  assert.equal(result.partial, true)
  assert.equal(result.sections[0].key, 'podcasts')
  await assert.rejects(() => loadHomeRecommendations({ search: async () => { throw new Error('offline') }, related: async () => [] }))
})
