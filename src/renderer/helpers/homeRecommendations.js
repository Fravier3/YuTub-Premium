import { languageOf, onlySpanish, spanishChannels } from './spanishFilter.js'

const OFFICIAL = new Set(['badbunny', 'marcanthony', 'marcanthonyvevo', 'sinbandera', 'sinbanderavevo', 'shakira', 'shakiravevo', 'karolg', 'karolgvevo', 'rauwalejandro', 'rauwalejandrovevo', 'romeosantos', 'romeosantosvevo', 'maluma', 'malumavevo', 'juanes', 'juanesvevo', 'camilomusica', 'camilo', 'camilovevo', 'luisfonsi', 'luisfonsivevo', 'anuel aa'.replaceAll(' ', ''), 'ozuna', 'daddyyankee', 'daddyyankeevevo', 'keniaos', 'keniaosvevo'])
const canonical = value => String(value || '').normalize('NFD').replaceAll(/[̀-ͯ]/g, '').toLowerCase().replaceAll(/[^a-z0-9]/g, '')
const PODCAST = /podcast|entrevista|conversaci[oó]n|episodio|hablamos|chente|molusco|gallo the producer/i
const TRAILER = /tr[aá]iler|teaser|avance oficial/i
const MUSIC = /video oficial|official video|music video|canci[oó]n|letra|lyrics|salsa|bachata|reggaet[oó]n|mix m[uú]sic/i
export const isOfficialMusic = video => OFFICIAL.has(canonical(video.author)) && (video.authorVerified === true || /vevo$/i.test(video.author || ''))
export function contentKind(video) {
  if (TRAILER.test(video.title)) return 'trailers'
  if (PODCAST.test(`${video.title} ${video.author}`)) return 'podcasts'
  if (isOfficialMusic(video) || MUSIC.test(video.title)) return 'music'
  return 'other'
}
export function rankForYou(videos, history) {
  const seen = new Set(history.map(v => v.videoId))
  const channels = new Set(history.slice(0, 15).map(v => v.authorId).filter(Boolean))
  const unique = new Map()
  for (const video of videos) {
    if (!video.videoId || (video.type && video.type !== 'video') || video.liveNow || video.isUpcoming || seen.has(video.videoId)) continue
    if (contentKind(video) === 'music' && !isOfficialMusic(video)) continue
    if (!unique.has(video.videoId)) unique.set(video.videoId, video)
  }
  return [...unique.values()].sort((a, b) => Number(channels.has(b.authorId)) - Number(channels.has(a.authorId)))
}

// Cada apertura elige al azar entre estas búsquedas, así las secciones fijas tampoco se repiten.
const PODCAST_QUERIES = ['podcast entrevistas en español Puerto Rico', 'podcast en español entrevista completa', 'podcast latino conversación', 'entrevista completa en español']
const TRAILER_QUERIES = ['tráiler oficial español películas cine', 'tráiler oficial doblado al español latino', 'avance oficial serie español', 'tráiler oficial subtitulado español estreno']
const ARTISTS = ['Bad Bunny', 'Marc Anthony', 'Sin Bandera', 'Karol G', 'Rauw Alejandro', 'Romeo Santos', 'Shakira', 'Maluma', 'Juanes', 'Camilo', 'Luis Fonsi', 'Ozuna', 'Daddy Yankee', 'Kenia Os']
const STARTER_QUERIES = ['lo más visto hoy en español', 'videos virales en español', 'documental completo en español', 'curiosidades en español', 'comedia en español', 'tecnología en español', 'videojuegos en español', 'recetas fáciles']

const HOME_SIZES = { forYou: 12, podcasts: 6, trailers: 6, music: 8 }

function shuffle(list, random) {
  const copy = [...list]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}
const pickOne = (list, random) => list[Math.floor(random() * list.length) % list.length]

/** Reparte por turnos varias listas para que ninguna búsqueda domine la sección. */
function interleave(lists) {
  const result = []
  const longest = Math.max(0, ...lists.map(list => list.length))
  for (let i = 0; i < longest; i++) {
    for (const list of lists) if (list[i]) result.push(list[i])
  }
  return result
}

/**
 * Qué buscar para "Para ti": hasta tres búsquedas recientes del usuario, elegidas al azar entre las últimas
 * ocho para que cambien de una apertura a otra. Si buscó en inglés a propósito, esa búsqueda no se filtra.
 * @param {string[]} searches las más recientes primero
 */
export function forYouQueries(searches, random = Math.random) {
  const recent = [...new Set(searches.map(query => String(query || '').trim()).filter(Boolean))].slice(0, 8)
  const chosen = shuffle(recent, random).slice(0, 3)
  // Con pocas búsquedas se piden más páginas de cada una: la reserva tiene que dar para varias aperturas
  const pagesEach = chosen.length === 1 ? 3 : chosen.length === 2 ? 2 : 1
  return chosen.flatMap((query) => {
    const language = languageOf(query)
    return shuffle([1, 2, 3], random).slice(0, pagesEach).map(page => ({
      source: query,
      // Sin pista de idioma ("gta 6"): se pide en español para no depender solo del filtro.
      query: language === 'unknown' && !/espa[nñ]ol|latino/i.test(query) ? `${query} español` : query,
      spanishOnly: language !== 'en',
      page
    }))
  })
}

/**
 * Lo que el usuario busca manda en "Para ti"; lo que ve lo complementa; el resto son secciones fijas en español.
 * Devuelve reservas (pools) más grandes de lo que cabe en pantalla: `pickHomeSections` saca de ahí una
 * selección distinta cada vez que se abre la portada.
 */
export async function loadHomeRecommendations({ history = [], searches = [], search, related, random = Math.random }) {
  const personal = forYouQueries(searches, random)
  // Sin búsquedas ni historial todavía: temas generales en español, también al azar.
  const starters = personal.length || history.length
    ? []
    : shuffle(STARTER_QUERIES, random).slice(0, 2).map(query => ({ source: query, query, spanishOnly: true, page: 1 + Math.floor(random() * 2) }))
  const forYouSources = [...personal, ...starters]
  const watched = shuffle(history.slice(0, 6), random).slice(0, 2)

  const requests = [
    search(pickOne(PODCAST_QUERIES, random), 1),
    search(pickOne(TRAILER_QUERIES, random), 1),
    search(`${pickOne(ARTISTS, random)} video oficial`, 1),
    ...forYouSources.map(source => search(source.query, source.page)),
    ...watched.map(video => related(video.videoId))
  ]
  const results = await Promise.allSettled(requests)
  const lists = results.map(result => result.status === 'fulfilled' ? result.value || [] : [])
  const searchLists = lists.slice(3, 3 + forYouSources.length)
  const relatedLists = lists.slice(3 + forYouSources.length)

  // Un canal es "de confianza" si ya vimos o encontramos títulos suyos en español.
  const trusted = spanishChannels(history, lists.flat())
  const spanish = videos => onlySpanish(videos, { trusted, isTrusted: isOfficialMusic })

  const fromSearches = searchLists.map((list, index) =>
    shuffle(rankForYou(forYouSources[index].spanishOnly ? spanish(list) : list, history), random))
  const fromWatched = relatedLists.map(list => shuffle(rankForYou(spanish(list), history), random))
  // Dos de cada tres puestos salen de las búsquedas; el resto, de videos parecidos a los vistos.
  const personalized = interleave([...fromSearches, ...fromSearches, ...fromWatched])

  const used = new Set()
  function pool(items, filter, limit) {
    const selected = []
    for (const video of rankForYou(items, history)) {
      if (used.has(video.videoId) || !filter(video)) continue
      used.add(video.videoId)
      selected.push(video)
      if (selected.length === limit) break
    }
    return selected
  }
  const forYou = pool(personalized, () => true, 48)
  const podcasts = pool(shuffle(spanish([...lists[0], ...relatedLists.flat()]), random), v => contentKind(v) === 'podcasts', 18)
  const trailers = pool(shuffle(spanish([...lists[1], ...relatedLists.flat()]), random), v => contentKind(v) === 'trailers', 18)
  const music = pool(shuffle([...lists[2], ...relatedLists.flat()], random), isOfficialMusic, 24)
  const pools = [
    { key: 'forYou', title: 'Para ti', items: forYou },
    { key: 'podcasts', title: 'Podcasts y conversaciones', items: podcasts },
    { key: 'trailers', title: 'Tráilers y cine', items: trailers },
    { key: 'music', title: 'Música · canales oficiales', items: music }
  ].filter(section => section.items.length)
  if (!pools.length) throw new Error('No se pudieron cargar las recomendaciones. Intenta actualizar.')
  return { pools, partial: results.some(result => result.status === 'rejected') }
}

/**
 * Saca de las reservas lo que se muestra ahora: primero lo que no salió las últimas veces, en orden al azar.
 * @param {{ key: string, title: string, items: object[] }[]} pools
 * @param {Set<string>} shown ids mostrados en aperturas anteriores
 */
export function pickHomeSections(pools, shown = new Set(), random = Math.random) {
  return pools.map((section) => {
    const size = HOME_SIZES[section.key] || 8
    const mixed = shuffle(section.items, random)
    const fresh = mixed.filter(video => !shown.has(video.videoId))
    const items = fresh.length >= size ? fresh : [...fresh, ...mixed.filter(video => shown.has(video.videoId))]
    return { key: section.key, title: section.title, items: items.slice(0, size) }
  }).filter(section => section.items.length)
}

/** ¿Queda en la reserva suficiente contenido que no haya salido ya? Si no, toca pedir una reserva nueva. */
export function hasFreshSelection(pools, shown = new Set()) {
  const forYou = pools.find(section => section.key === 'forYou') || pools[0]
  if (!forYou) return false
  const fresh = forYou.items.filter(video => !shown.has(video.videoId)).length
  return fresh >= Math.min(forYou.items.length, Math.ceil((HOME_SIZES[forYou.key] || 8) * 0.75))
}

/** Cambia cuando cambian los gustos (búsquedas o videos vistos): entonces las reservas guardadas ya no valen. */
export const homeSignal = (searches, history) =>
  [...searches.slice(0, 8), '|', ...history.slice(0, 2).map(video => video.videoId)].join('\n')
