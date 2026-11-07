/**
 * Audio en segundo plano (estilo "Premium").
 *
 * iOS pausa los <video> cuando la app se minimiza, pero deja sonar un <audio> nativo.
 * Este módulo mantiene un único <audio> (singleton) que:
 *  - inicia el flujo real durante la reproducción, antes de minimizar;
 *  - reproduce solo el audio (AAC/MP4) en la misma posición del video;
 *  - publica los controles de la pantalla de bloqueo (Media Session).
 */

/** @type {HTMLAudioElement | null} */
let audio = null
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
    navigator.mediaSession.setActionHandler('play', () => { el.play().then(() => { navigator.mediaSession.playbackState = 'playing' }).catch(() => {}) })
    navigator.mediaSession.setActionHandler('pause', () => { el.pause(); navigator.mediaSession.playbackState = 'paused' })
    navigator.mediaSession.setActionHandler('seekbackward', (d) => { el.currentTime = Math.max(0, el.currentTime - (d.seekOffset || 10)) })
    navigator.mediaSession.setActionHandler('seekforward', (d) => { el.currentTime = Math.min(el.duration || Infinity, el.currentTime + (d.seekOffset || 10)) })
    navigator.mediaSession.setActionHandler('seekto', (d) => { el.currentTime = d.seekTime })
  } catch { /* algunos navegadores no soportan todas las acciones */ }
}

/**
 * Keep a real audio element playing before the page is hidden. Switching to a new
 * stream only after visibilitychange is too late for iOS's user-activation rules.
 * The video becomes the visual track; native audio controls and Media Session
 * own the sound. Returns a controller scoped to this video/route.
 */
export function connectContinuousAudio(video, { url, host, title, artist, artwork, isAudioOnly, onReady, onEnded, onError }) {
  const el = getAudio()
  const originalMuted = video.muted
  let disposed = false
  let failed = false
  let starting = false
  let ownsAudio = false
  let syncing = false
  let ended = false
  let resumeVisual = false
  const removers = []
  const listen = (target, event, handler) => {
    target.addEventListener(event, handler)
    removers.push(() => target.removeEventListener(event, handler))
  }
  const seek = (target, time) => {
    if (!Number.isFinite(time)) return
    if (Math.abs(target.currentTime - time) < 0.05) return
    try { target.currentTime = Math.max(0, time) } catch { /* metadata not loaded yet */ }
  }
  const playVisual = () => {
    if (disposed || document.hidden || isAudioOnly()) return
    seek(video, el.currentTime)
    video.play().catch(() => {})
  }
  const fail = () => {
    if (disposed) return
    ownsAudio = false
    failed = true
    active = false
    video.muted = originalMuted
    onReady(false)
    if (!document.hidden && !isAudioOnly()) video.play().catch(() => {})
    onError?.()
  }
  el.src = url
  el.preload = 'auto'
  el.controls = true
  el.style.display = 'block'
  el.style.width = '100%'
  host?.appendChild(el)
  el.load()

  const start = async () => {
    if (disposed || failed || starting || ended) return false
    if (ownsAudio && !el.paused) return true
    starting = true
    seek(el, video.currentTime)
    el.playbackRate = video.playbackRate
    el.volume = video.volume
    el.muted = originalMuted
    video.muted = true
    if ('audioSession' in navigator) {
      try { navigator.audioSession.type = 'playback' } catch { /* optional API */ }
    }
    try {
      await el.play()
      if (disposed) return false
      ownsAudio = true
      active = true
      setMediaSession(el, { title, artist, artwork })
      onReady(true)
      return true
    } catch {
      if (!disposed) {
        video.muted = originalMuted
        onReady(false)
      }
      return false
    } finally {
      starting = false
    }
  }
  listen(el, 'loadedmetadata', () => seek(el, video.currentTime))
  listen(video, 'play', () => { if (!syncing) start() })
  listen(video, 'pause', () => {
    if (!video.ended && !document.hidden && document.hasFocus() && !isAudioOnly() && !starting) el.pause()
  })
  listen(video, 'seeking', () => {
    if (!ownsAudio || syncing || document.hidden) return
    syncing = true
    seek(el, video.currentTime)
    syncing = false
  })
  listen(video, 'ratechange', () => { el.playbackRate = video.playbackRate })
  listen(video, 'volumechange', () => {
    el.volume = video.volume
    // Keep keyboard mute working without ever enabling two audible tracks.
    if (ownsAudio && !video.muted) {
      el.muted = !el.muted
      video.muted = true
    }
  })
  listen(el, 'play', () => {
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing'
    if (ownsAudio && !starting) playVisual()
  })
  listen(el, 'pause', () => {
    if (!disposed && ownsAudio && !video.paused) video.pause()
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused'
  })
  listen(el, 'seeked', () => {
    if (!ownsAudio || document.hidden) return
    syncing = true
    seek(video, el.currentTime)
    syncing = false
  })
  listen(el, 'timeupdate', () => {
    if (!ownsAudio || document.hidden || video.seeking || video.paused) return
    if (Math.abs(video.currentTime - el.currentTime) > 0.75) seek(video, el.currentTime)
  })
  listen(el, 'ended', () => {
    if (disposed || ended) return
    ended = true
    active = false
    video.pause()
    onEnded()
  })
  listen(el, 'error', fail)
  listen(document, 'visibilitychange', () => {
    if (!ownsAudio) return
    if (document.hidden) {
      resumeVisual = !el.paused && !el.ended
      // Pause only the visual track, leaving the same native audio running.
      video.pause()
    } else if (resumeVisual && !el.paused && !el.ended) {
      playVisual()
    }
  })
  // This handler runs in the actual play-button gesture if autoplay was blocked.
  const gesture = event => {
    if (disposed || ownsAudio || document.hidden) return
    const target = event.target
    const control = target?.closest?.('button, [role="button"]')
    const label = control?.getAttribute('aria-label') ?? ''
    if (video.contains(target) || /^(play|reproducir)(\b|$)/i.test(label)) start()
  }
  listen(document, 'click', gesture)
  if (!video.paused && !video.ended) start()

  return {
    ownsAudio: () => ownsAudio,
    start,
    setAudioOnly: async value => {
      if (!await start()) return false
      if (value) video.pause()
      else playVisual()
      return true
    },
    dispose: () => {
      disposed = true
      removers.forEach(remove => remove())
      stopBackgroundAudio()
      video.muted = originalMuted
      el.controls = false
      el.style.display = 'none'
      document.body.appendChild(el)
    }
  }
}
