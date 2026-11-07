export const LATIN_FEED_TTL = 30 * 60 * 1000

const REGIONS = ['PR', 'CO', 'MX', 'DO', 'AR', 'CL']
const QUERIES = [
  'reggaeton latino estreno video oficial',
  'salsa latina video oficial',
  'bachata estreno video oficial',
  'pop latino estreno video oficial',
  'musica urbana puertorriqueña video oficial',
  'merengue latino video oficial'
]
const LATIN_MUSIC = /bad bunny|karol g|rauw|ozuna|anuel|shakira|feid|j balvin|daddy yankee|romeo santos|aventura|marc anthony|wisin|yandel|tini|camilo|maluma|nicky jam|sech|myke towers|farruko|eladio|reggaet[oó]n|bachata|merengue|salsa|m[uú]sica latina|en espa[nñ]ol/i

/** Mix regional music and rotating Spanish searches without using the global popular feed. */
export async function loadLatinMusicFeed({ trending, search, now = Date.now(), previousIds = [] }) {
  const slot = Math.floor(now / LATIN_FEED_TTL)
  const queries = [QUERIES[slot % QUERIES.length], QUERIES[(slot + 3) % QUERIES.length]]
  const responses = await Promise.allSettled([
    trending(REGIONS[slot % REGIONS.length]).then(items => items.filter(item => LATIN_MUSIC.test(`${item.title} ${item.author}`))),
    ...queries.map(query => search(query, REGIONS[slot % REGIONS.length]))
  ])
  const unique = new Map()
  for (const response of responses) {
    if (response.status !== 'fulfilled') continue
    for (const item of response.value ?? []) {
      if (item.type !== 'video' || !item.videoId || item.liveNow || item.isUpcoming) continue
      if (!unique.has(item.videoId)) unique.set(item.videoId, item)
    }
  }
  if (!unique.size) throw new Error('No se pudo cargar música latina. Intenta actualizar en un momento.')
  return rotateLatinResults([...unique.values()], now, previousIds).slice(0, 36)
}

/** Prefer unseen items and vary ordering once per half-hour without unstable random sorting. */
export function rotateLatinResults(items, now = Date.now(), previousIds = []) {
  const slot = Math.floor(now / LATIN_FEED_TTL)
  const previous = new Set(previousIds)
  const rank = id => {
    let hash = slot | 0
    for (const char of id) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619)
    return hash >>> 0
  }
  return [...items].sort((a, b) =>
    Number(previous.has(a.videoId)) - Number(previous.has(b.videoId)) || rank(a.videoId) - rank(b.videoId)
  )
}
