const OFFICIAL = new Set(['badbunny', 'marcanthony', 'marcanthonyvevo', 'sinbandera', 'sinbanderavevo', 'shakira', 'shakiravevo', 'karolg', 'karolgvevo', 'rauwalejandro', 'rauwalejandrovevo', 'romeosantos', 'romeosantosvevo', 'maluma', 'malumavevo', 'juanes', 'juanesvevo', 'camilomusica', 'camilo', 'camilovevo', 'luisfonsi', 'luisfonsivevo', 'anuel aa'.replaceAll(' ', ''), 'ozuna', 'daddyyankee', 'daddyyankeevevo', 'keniaos', 'keniaosvevo'])
const canonical = value => String(value || '').normalize('NFD').replaceAll(/[\u0300-\u036f]/g, '').toLowerCase().replaceAll(/[^a-z0-9]/g, '')
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
/** Related videos provide the personal signal; category searches guarantee variety. */
export async function loadHomeRecommendations({ history = [], search, related, now = Date.now() }) {
  const artist = ['Bad Bunny', 'Marc Anthony', 'Sin Bandera'][Math.floor(now / 1800000) % 3]
  const requests = [
    search('podcast entrevistas en español Puerto Rico'),
    search('trailer oficial español películas cine'),
    search(`${artist} video oficial`),
    ...history.slice(0, 2).map(video => related(video.videoId))
  ]
  const results = await Promise.allSettled(requests)
  const lists = results.map(result => result.status === 'fulfilled' ? result.value || [] : [])
  const personalized = rankForYou(lists.slice(3).flat(), history)
  const used = new Set()
  function pick(items, filter, limit = 8) {
    const selected = []
    for (const video of rankForYou(items, history)) {
      if (used.has(video.videoId) || !filter(video)) continue
      used.add(video.videoId)
      selected.push(video)
      if (selected.length === limit) break
    }
    return selected
  }
  const forYou = pick(personalized, () => true, 8)
  const podcasts = pick([...lists[0], ...personalized], v => contentKind(v) === 'podcasts', 6)
  const trailers = pick([...lists[1], ...personalized], v => contentKind(v) === 'trailers', 6)
  const music = pick([...lists[2], ...lists.slice(3).flat()], isOfficialMusic, 8)
  const sections = [
    { key: 'forYou', title: 'Para ti', items: forYou },
    { key: 'podcasts', title: 'Podcasts y conversaciones', items: podcasts },
    { key: 'trailers', title: 'Tráilers y cine', items: trailers },
    { key: 'music', title: 'Música · canales oficiales', items: music }
  ].filter(section => section.items.length)
  if (!sections.length) throw new Error('No se pudieron cargar las recomendaciones. Intenta actualizar.')
  return { sections, partial: results.some(result => result.status === 'rejected') }
}
