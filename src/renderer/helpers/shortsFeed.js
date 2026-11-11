import { languageOf, onlySpanish, spanishChannels } from './spanishFilter.js'

// Un Short dura hasta 3 minutos; por debajo de eso casi todo lo que devuelve "#shorts" es vertical.
export const SHORT_MAX_SECONDS = 180

const TOPICS = [
  'shorts en español', 'shorts graciosos en español', 'shorts de fútbol', 'shorts de videojuegos en español',
  'shorts de recetas', 'shorts curiosidades', 'shorts música latina', 'shorts memes en español',
  'shorts de comedia latina', 'shorts de películas en español', 'shorts de animales', 'shorts de tecnología en español'
]

function shuffle(list, random) {
  const copy = [...list]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

/**
 * Una tanda de Shorts en español. Mezcla lo que el usuario busca con temas generales, y deja para el final
 * lo que ya salió, para que cada entrada a la pestaña empiece con videos distintos.
 * @param {{ searches?: string[], history?: object[], search: (query: string, page: number) => Promise<object[]>,
 *   shown?: Set<string>, exclude?: Set<string>, page?: number, random?: () => number }} options
 */
export async function loadShortsFeed({ searches = [], history = [], search, shown = new Set(), exclude = new Set(), page = 1, random = Math.random }) {
  const personal = shuffle([...new Set(searches)].slice(0, 8), random).slice(0, 2).map((query) => {
    const language = languageOf(query)
    return {
      query: `${query} ${language === 'unknown' && !/espa[nñ]ol|latino/i.test(query) ? 'español ' : ''}#shorts`,
      spanishOnly: language !== 'en'
    }
  })
  const general = shuffle(TOPICS, random).slice(0, personal.length ? 2 : 3).map(topic => ({ query: `${topic} #shorts`, spanishOnly: true }))
  const sources = [...personal, ...general]

  const results = await Promise.allSettled(sources.map(source => search(source.query, page)))
  const lists = results.map(result => result.status === 'fulfilled' ? result.value || [] : [])
  if (results.every(result => result.status === 'rejected')) throw results[0].reason

  const trusted = spanishChannels(history, lists.flat())
  const unique = new Map()
  lists.forEach((list, index) => {
    const allowed = sources[index].spanishOnly ? onlySpanish(list, { trusted }) : list
    for (const video of allowed) {
      if (!video.videoId || (video.type && video.type !== 'video') || video.liveNow || video.isUpcoming) continue
      if (!(video.lengthSeconds > 0 && video.lengthSeconds <= SHORT_MAX_SECONDS)) continue
      if (exclude.has(video.videoId) || unique.has(video.videoId)) continue
      unique.set(video.videoId, video)
    }
  })

  const mixed = shuffle([...unique.values()], random)
  return [...mixed.filter(video => !shown.has(video.videoId)), ...mixed.filter(video => shown.has(video.videoId))]
}
