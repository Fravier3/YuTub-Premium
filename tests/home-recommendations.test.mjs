import { test } from 'node:test'
import assert from 'node:assert/strict'

const { forYouQueries, hasFreshSelection, loadHomeRecommendations, pickHomeSections, rankForYou, isOfficialMusic } = await import('../src/renderer/helpers/homeRecommendations.js')
const { languageOf, onlySpanish } = await import('../src/renderer/helpers/spanishFilter.js')
const { loadShortsFeed } = await import('../src/renderer/helpers/shortsFeed.js')

const video = (videoId, title, author = 'Creator', authorId = author, authorVerified = false) => ({ type: 'video', videoId, title, author, authorId, authorVerified })
/** Generador determinista para que el azar de la portada sea reproducible en las pruebas. */
function seeded(seed = 1) {
  let state = seed
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296
    return state / 4294967296
  }
}
const poolOf = (result, key) => result.pools.find(section => section.key === key)?.items ?? []

test('personal signals exclude watched videos and reject unofficial music compilations', () => {
  const official = video('new-song', 'Video oficial', 'Bad Bunny', 'official', true)
  const impostor = video('mix', 'Bad Bunny video oficial', 'Latin Mix')
  assert.equal(isOfficialMusic(official), true)
  assert.equal(isOfficialMusic(impostor), false)
  assert.deepEqual(rankForYou([impostor, official, official, video('watched', 'Podcast')], [{ videoId: 'watched', authorId: 'official' }]), [official])
})

test('language detection separates Spanish, English and titles without clues', () => {
  assert.equal(languageOf('GTA VI GANARÁ EL GOTY POR CORRUPTO'), 'es')
  assert.equal(languageOf('El problema de PlayStation no es la potencia'), 'es')
  assert.equal(languageOf('Lies of P Switch 2 Review – 60 FPS Comes at a Cost'), 'en')
  assert.equal(languageOf('I Built 100 Houses And Gave Them Away!'), 'en')
  assert.equal(languageOf('Bad Bunny - DtMF (Official Video)'), 'unknown')
  assert.equal(languageOf('привет мир'), 'other')
})

test('suggestions keep Spanish titles and only trust unclear titles from Spanish channels', () => {
  const list = [
    video('es', 'Así se hizo la película', 'Canal Uno', 'c1'),
    video('same-channel', 'DtMF', 'Canal Uno', 'c1'),
    video('en', 'How to cook pasta the right way', 'Chef', 'c2'),
    video('unclear', 'DtMF', 'Unknown', 'c3'),
    video('trusted', 'NUEVAYoL', 'Bad Bunny', 'c4')
  ]
  assert.deepEqual(onlySpanish(list, { trusted: new Set(['c4']) }).map(v => v.videoId), ['es', 'same-channel', 'trusted'])
})

test('Para ti comes from what the user searches, in Spanish, without watched or English videos', async () => {
  const asked = []
  const result = await loadHomeRecommendations({
    history: [{ videoId: 'watched', title: 'Ya visto', authorId: 'favorite' }],
    searches: ['gta 6'],
    random: seeded(3),
    search: async (query, page) => {
      asked.push(query)
      if (query.includes('podcast') || query.includes('entrevista')) return [video('pod', 'Podcast entrevista completa')]
      if (/tr[aá]iler|avance/.test(query)) return [video('trailer', 'Tráiler oficial de la película')]
      if (query.includes('video oficial')) return [video('music', 'Video oficial', 'Bad Bunny', 'artist', true), video('fake', 'Video oficial', 'Hits Mix')]
      return [
        video(`gta-es-${page}`, 'GTA 6 se ve increíble: análisis del tráiler', 'Canal GTA', 'gta'),
        video(`gta-en-${page}`, 'GTA 6 Review – Everything You Need To Know', 'IGN', 'ign'),
        video('watched', 'GTA 6 ya visto en español', 'Canal GTA', 'gta')
      ]
    },
    related: async () => [video('related', 'Nueva conversación sobre el juego', 'Favorite', 'favorite')]
  })
  // Una sola búsqueda: se piden tres páginas distintas de ella, forzando el español
  assert.deepEqual(asked.filter(query => query.startsWith('gta 6')), ['gta 6 español', 'gta 6 español', 'gta 6 español'])
  const forYou = poolOf(result, 'forYou').map(v => v.videoId)
  assert.deepEqual([...forYou].sort(), ['gta-es-1', 'gta-es-2', 'gta-es-3', 'related'])
  const ids = result.pools.flatMap(section => section.items.map(v => v.videoId))
  assert.equal(new Set(ids).size, ids.length)
  assert.equal(ids.some(id => id === 'watched' || id === 'fake' || id.startsWith('gta-en')), false)
  assert.deepEqual(result.pools.map(section => section.key), ['forYou', 'podcasts', 'trailers', 'music'])
})

test('a deliberate English search is respected and each user gets their own queries', () => {
  const english = forYouQueries(['how to build a gaming pc'], seeded(1))
  assert.equal(english.every(source => source.spanishOnly === false && source.query === 'how to build a gaming pc'), true)
  const spanish = forYouQueries(['recetas de pollo'], seeded(1))
  assert.equal(spanish.every(source => source.spanishOnly === true && source.query === 'recetas de pollo'), true)
  const many = forYouQueries(['a1', 'a2', 'a3', 'a4', 'a5'], seeded(7))
  assert.equal(new Set(many.map(source => source.source)).size, 3)
  assert.deepEqual(forYouQueries([], seeded(1)), [])
})

test('every opening shows a different selection, preferring videos not shown before', () => {
  const items = Array.from({ length: 40 }, (_, index) => video(`v${index}`, `Video número ${index}`))
  const pools = [{ key: 'forYou', title: 'Para ti', items }]
  const first = pickHomeSections(pools, new Set(), seeded(1))[0].items.map(v => v.videoId)
  assert.equal(first.length, 12)
  const second = pickHomeSections(pools, new Set(first), seeded(2))[0].items.map(v => v.videoId)
  assert.equal(second.some(id => first.includes(id)), false)
  assert.equal(hasFreshSelection(pools, new Set(first)), true)
  // Cuando ya salió casi todo, la reserva deja de valer y hay que pedir otra
  assert.equal(hasFreshSelection(pools, new Set(items.slice(0, 35).map(v => v.videoId))), false)
  const exhausted = pickHomeSections(pools, new Set(items.map(v => v.videoId)), seeded(3))[0].items
  assert.equal(exhausted.length, 12)
})

test('a failed category does not discard working categories and total failure is explicit', async () => {
  const result = await loadHomeRecommendations({ random: seeded(1), search: async query => { if (query.includes('podcast') || query.includes('entrevista')) return [video('pod', 'Podcast en español')]; throw new Error('offline') }, related: async () => [] })
  assert.equal(result.partial, true)
  assert.equal(result.pools[0].key, 'podcasts')
  await assert.rejects(() => loadHomeRecommendations({ search: async () => { throw new Error('offline') }, related: async () => [] }))
})

test('Shorts are short, Spanish, unique and start with ones not shown before', async () => {
  const short = (id, title, lengthSeconds, authorId = 'c1') => ({ ...video(id, title, 'Canal', authorId), lengthSeconds })
  const queries = []
  const feed = await loadShortsFeed({
    searches: ['gta 6'],
    shown: new Set(['seen']),
    exclude: new Set(['already-in-feed']),
    random: seeded(5),
    search: async (query) => {
      queries.push(query)
      return [
        short('seen', 'Esto ya salió la última vez', 30),
        short('fresh', 'Mira lo que pasó hoy en el partido', 45),
        short('english', 'You will not believe what happened', 30, 'c2'),
        short('long', 'Documental completo en español', 900),
        short('already-in-feed', 'Otro short en español de hoy', 20)
      ]
    }
  })
  assert.equal(queries.includes('gta 6 español #shorts'), true)
  assert.equal(queries.every(query => query.endsWith('#shorts')), true)
  assert.deepEqual(feed.map(v => v.videoId), ['fresh', 'seen'])
  await assert.rejects(() => loadShortsFeed({ search: async () => { throw new Error('offline') } }))
})
