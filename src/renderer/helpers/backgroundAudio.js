/**
 * Audio en segundo plano (estilo "Premium").
 *
 * iOS pausa los <video> cuando la app se minimiza, pero deja sonar un <audio> nativo.
 * Este módulo mantiene un único <audio> (singleton) que:
 *  - se "desbloquea" con el primer toque del usuario, para poder arrancar solo al minimizar;
 *  - reproduce solo el audio (AAC/MP4) en la misma posición del video;
 *  - publica los controles de la pantalla de bloqueo (Media Session).
 */

// WAV mudo de ~0.1 s, solo para desbloquear el elemento con un gesto del usuario
const SILENT_WAV = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA='

/** @type {HTMLAudioElement | null} */
let audio = null
let unlocked = false
let active = false

function getAudio() {
  if (audio) return audio
  audio = document.createElement('audio')
  audio.setAttribute('playsinline', '')
  audio.preload = 'auto'
  audio.style.display = 'none'
  document.body.appendChild(audio)
  return audio
}

/** Llamar desde un gesto del usuario (toque). Seguro de llamar varias veces. */
export function unlockBackgroundAudio() {
  if (unlocked) return
  const el = getAudio()
  unlocked = true
  const previousSrc = el.getAttribute('src')
  if (previousSrc) return // ya hay audio real cargado
  el.src = SILENT_WAV
  el.muted = true
  el.play()
    .then(() => { el.pause(); el.muted = false })
    .catch(() => { unlocked = false; el.muted = false })
}

export function isBackgroundAudioSupported() {
  return typeof document !== 'undefined' && 'HTMLAudioElement' in window
}

export const isBackgroundAudioActive = () => active

/**
 * Elige el audio AAC (mp4) de mayor calidad: es lo único que iOS reproduce siempre.
 * @param {{ type?: string, itag?: string | number, bitrate?: string | number, url?: string }[]} adaptiveFormats
 * @returns {string | null}
 */
export function pickAudioUrl(adaptiveFormats) {
  const candidates = (adaptiveFormats ?? []).filter(f => typeof f.type === 'string' && f.type.startsWith('audio/mp4') && f.url)
  if (candidates.length === 0) return null
  candidates.sort((a, b) => (parseInt(b.bitrate) || 0) - (parseInt(a.bitrate) || 0))
  return candidates[0].url
}

/**
 * @param {{
 *  url: string,
 *  time: number,
 *  title?: string,
 *  artist?: string,
 *  artwork?: string,
 *  onEnded?: () => void,
 *  onError?: () => void
 * }} options
 * @returns {Promise<boolean>} true si empezó a sonar
 */
export async function startBackgroundAudio({ url, time, title = '', artist = '', artwork = '', onEnded, onError }) {
  const el = getAudio()
  el.onended = () => { active = false; onEnded?.() }
  el.onerror = () => { active = false; onError?.() }

  el.muted = false
  el.src = url
  const seek = () => { try { el.currentTime = Math.max(0, time) } catch { /* se ajusta al cargar */ } }
  el.addEventListener('loadedmetadata', seek, { once: true })
  seek()

  try {
    await el.play()
  } catch {
    active = false
    return false
  }
  active = true
  setMediaSession(el, { title, artist, artwork })
  return true
}

/** Detiene el audio y devuelve el segundo en el que iba. */
export function stopBackgroundAudio() {
  if (!audio) return 0
  const time = audio.currentTime || 0
  audio.pause()
  audio.onended = null
  audio.onerror = null
  audio.removeAttribute('src')
  audio.load()
  active = false
  if ('mediaSession' in navigator) {
    navigator.mediaSession.playbackState = 'none'
  }
  return time
}

export const getBackgroundAudioTime = () => audio?.currentTime ?? 0

function setMediaSession(el, { title, artist, artwork }) {
  if (!('mediaSession' in navigator)) return
  try {
    navigator.mediaSession.metadata = new MediaMetadata({
      title,
      artist,
      artwork: artwork ? [{ src: artwork, sizes: '512x512' }] : []
    })
    navigator.mediaSession.playbackState = 'playing'
    navigator.mediaSession.setActionHandler('play', () => { el.play(); navigator.mediaSession.playbackState = 'playing' })
    navigator.mediaSession.setActionHandler('pause', () => { el.pause(); navigator.mediaSession.playbackState = 'paused' })
    navigator.mediaSession.setActionHandler('seekbackward', (d) => { el.currentTime = Math.max(0, el.currentTime - (d.seekOffset || 10)) })
    navigator.mediaSession.setActionHandler('seekforward', (d) => { el.currentTime = Math.min(el.duration || Infinity, el.currentTime + (d.seekOffset || 10)) })
    navigator.mediaSession.setActionHandler('seekto', (d) => { el.currentTime = d.seekTime })
  } catch { /* algunos navegadores no soportan todas las acciones */ }
}
