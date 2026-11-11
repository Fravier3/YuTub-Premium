/*
 * Filtro de idioma de Yutu: lo que la app sugiere por su cuenta (portada, Shorts, relacionados) debe estar
 * en español. Lo que el usuario busca a propósito no se filtra.
 *
 * No hay un dato fiable de idioma en la API, así que se decide por el texto: letras propias del español y
 * palabras muy frecuentes de cada idioma. Un título sin pistas ("Bad Bunny - DtMF") queda como "unknown" y
 * solo se acepta si el canal ya demostró publicar en español.
 */
const SPANISH_WORDS = new Set(`el la los las un una unos unas de del al y o que qué en con por para sin sobre entre
  es son está están era fue ser estar hay tiene tienen hace hacer como cómo cuando cuándo donde dónde quien quién
  porque pero más muy ya también así esto esta este estos estas eso esa ese mi mis tu tus su sus nos lo le les se
  yo él ella ellos nosotros todo todos toda todas nada algo cada otro otra nuevo nueva nuevos nuevas mejor mejores
  peor gran grande hoy ahora siempre nunca aquí aqui día dias días año años vez veces mundo vida casa hombre mujer
  historia verdad pasó paso llegó llego mira así asi desde hasta contra durante según segun tras ante bajo
  español espanol latino latina completo completa oficial capítulo capitulo película pelicula películas peliculas
  canción cancion canciones música musica letra entrevista noticias resumen reacción reaccion probando jugando
  gratis fácil facil rápido rapido cómo como hacer por qué quién gana vs contra primera primer último ultima última
  ultimo todos los las cosas mejores peores estreno tráiler avance temporada episodio parte análisis analisis
  opinión opinion explicado explicación truco trucos consejos receta recetas cocina fútbol futbol goles partido
  ganará ganara corrupto problema precio potencia escándalo escandalo silencio`.split(/\s+/).filter(Boolean))

const ENGLISH_WORDS = new Set(`the of and to in is are was were be been it its that this these those for with on at by
  from as an or if but not you your yours we our they their them his her him she i'm im i've don't dont can't cant
  won't doesn't didn't isn't what why how when where who which will would should could can do does did has have had
  my me all every any some more most best worst new first last next after before again never always ever just only
  than then now here there about into over under out up down off back still very really too also one two three
  comes come coming goes going gets getting makes making made built build review reviews reaction reacts
  gameplay walkthrough playthrough explained explains tutorial guide tips tricks cost worth cheap world life day
  days hours years time man woman people kids guy girl boy things thing way got take takes took try tried trying
  watch watching see look tested testing vs versus full movie episode season part official trailer teaser update
  news today tonight live stream highlights compilation funny moments challenge survive survived surviving win wins
  won lose lost bought buying built ranking ranked rating rated honest truth story stories behind scenes
  unboxing hands impressions everything nothing something anything need needs know knows knew think thinks thought
  want wants wanted let's lets here's heres there's it's that's what's who's you're we're they're`.split(/\s+/).filter(Boolean))

// Palabras que existen tal cual en los dos idiomas, nombres de formato o términos de música: no dicen nada.
const NEUTRAL_WORDS = new Set(`a no me he solo real final total normal animal general mental social popular video
  videos audio music official trailer teaser remix live mix feat ft lyrics lyric shorts short short's vs hd
  full oficial vevo tv fm dj mc el`.split(/\s+/).filter(Boolean))
// Estas sí distinguen pese a parecerse: "el" es español, "oficial" es español, "official" casi siempre música.
NEUTRAL_WORDS.delete('el')
NEUTRAL_WORDS.delete('oficial')

const SPANISH_LETTERS = /[ñ¿¡áéíóúü]/i
const OTHER_SCRIPTS = /[\p{Script=Cyrillic}\p{Script=Arabic}\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Devanagari}\p{Script=Thai}]/u
const PORTUGUESE = /[ãõç]|\b(você|voce|não|nao|uma|muito|pra|isso|tudo|agora|melhor|então)\b/i

/**
 * @param {string} text
 * @returns {'es' | 'en' | 'other' | 'unknown'}
 */
export function languageOf(text) {
  const value = String(text || '').toLowerCase()
  if (!value.trim()) return 'unknown'
  if (OTHER_SCRIPTS.test(value)) return 'other'

  let spanish = SPANISH_LETTERS.test(value) ? 2 : 0
  let english = 0
  for (const word of value.match(/[\p{L}']+/gu) || []) {
    if (NEUTRAL_WORDS.has(word)) continue
    if (SPANISH_WORDS.has(word)) spanish++
    else if (ENGLISH_WORDS.has(word)) english++
  }
  if (PORTUGUESE.test(value) && spanish <= 2) return 'other'
  if (spanish > english) return 'es'
  if (english > spanish) return 'en'
  return 'unknown'
}

/** Idioma de un video: manda el título; la descripción solo desempata. */
export function videoLanguage(video) {
  const title = languageOf(video?.title)
  if (title !== 'unknown') return title
  const description = languageOf(String(video?.description || '').slice(0, 220))
  return description === 'es' ? 'es' : 'unknown'
}

/** Canales que publican en español, según los títulos que ya se conocen de ellos. */
export function spanishChannels(...lists) {
  const channels = new Set()
  for (const video of lists.flat()) {
    const key = video?.authorId || video?.author
    if (key && languageOf(video.title) === 'es') channels.add(key)
  }
  return channels
}

/**
 * Deja solo lo que está en español. Un título sin pistas pasa únicamente si su canal es de confianza.
 * @param {object[]} videos
 * @param {{ trusted?: Set<string>, isTrusted?: (video: object) => boolean }} options
 */
export function onlySpanish(videos, { trusted = new Set(), isTrusted = () => false } = {}) {
  const known = new Set([...trusted, ...spanishChannels(videos)])
  return videos.filter((video) => {
    const language = videoLanguage(video)
    if (language === 'es') return true
    if (language !== 'unknown') return false
    return known.has(video.authorId) || known.has(video.author) || isTrusted(video)
  })
}
