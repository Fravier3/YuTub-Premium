/**
 * Audio nativo continuo para la app web.
 *
 * Usa un <audio> nativo; la continuidad final depende de las políticas de iOS.
 * Este módulo mantiene un único <audio> (singleton) que:
 *  - inicia el flujo real durante la reproducción, antes de minimizar;
 *  - reproduce solo el audio (AAC/MP4) en la misma posición del video;
 *  - publica los controles de la pantalla de bloqueo (Media Session).
 */

/** @type {HTMLAudioElement | null} */
let audio = null
let active = false
const delegatedAudio = new WeakMap()

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

export const isBackgroundAudioActive = () => active && !!audio && !audio.paused && !audio.ended

/** Read the user's volume/mute, excluding the technical mute of the visual track. */
export function getVideoAudioState(video) {
  const owner = delegatedAudio.get(video) ?? video
  return { muted: owner.muted, volume: owner.volume }
}

export function setVideoAudioMuted(video, muted) {
  const owner = delegatedAudio.get(video) ?? video
  owner.muted = muted
  return muted
}

/** Recover once from mute values persisted by the old audio handoff. */
export function repairStoredMutePreference(storage) {
  const key = 'yutu-mute-preference-v1'
  if (storage.getItem(key)) return
  storage.removeItem('muted')
  storage.setItem(key, '1')
}

/** A suspended visual track cannot overwrite a still-playing native audio session. */
export function setVideoMediaSessionPlaybackState(state) {
  if (!('mediaSession' in navigator)) return
  if (state !== 'playing' && isBackgroundAudioActive()) return
  navigator.mediaSession.playbackState = state
}

/** Select browser-compatible audio, with muxed MP4 as a fallback when no audio-only stream works. */
export function pickAudioSources(adaptiveFormats = [], formatStreams = [], canPlay = type => {
  const probe = document.createElement('audio')
  return !!probe.canPlayType(type)
}) {
  const audioFormats = (adaptiveFormats ?? []).filter(format => format.url && format.type?.startsWith('audio/') && canPlay(format.type))
  audioFormats.sort((a, b) => Number(b.type.startsWith('audio/mp4')) - Number(a.type.startsWith('audio/mp4')) || (parseInt(b.bitrate) || 0) - (parseInt(a.bitrate) || 0))
  const muxed = (formatStreams ?? []).filter(format => format.url && format.type?.startsWith('video/mp4') && canPlay(format.type))
  muxed.sort((a, b) => (parseInt(a.resolution) || 0) - (parseInt(b.resolution) || 0))
  return [...new Set([...audioFormats, ...muxed].map(format => format.url))]
}

export function pickAudioUrl(adaptiveFormats, formatStreams = []) {
  return pickAudioSources(adaptiveFormats, formatStreams)[0] ?? null
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
export function connectContinuousAudio(video, { url, urls = [], host, title, artist, artwork, isAudioOnly, onReady, onEnded, onError }) {
  const el = getAudio()
  const sources = [...new Set([url, ...urls].filter(Boolean))]
  let sourceIndex = 0
  let disposed = false
  let failed = false
  let starting = false
  let ownsAudio = false
  let syncing = false
  let ended = false
  let resumeVisual = false
  let backgroundSuspended = document.hidden
  let videoPauseTimer
  let lastVideoVolume = video.volume
  const removers = []
  const listen = (target, event, handler, options) => {
    target.addEventListener(event, handler, options)
    removers.push(() => target.removeEventListener(event, handler, options))
  }
  const cancelVideoPause = () => {
    clearTimeout(videoPauseTimer)
    videoPauseTimer = undefined
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
  const restoreVideoAudio = () => {
    const state = getVideoAudioState(video)
    delegatedAudio.delete(video)
    ownsAudio = false
    active = false
    el.pause()
    video.muted = state.muted
    video.volume = state.volume
    onReady(false)
  }
  const fail = () => {
    if (disposed) return
    restoreVideoAudio()
    failed = true
    onError?.()
    if (!document.hidden) video.play().catch(() => {})
  }
  el.src = sources[sourceIndex]
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
    const userAudio = getVideoAudioState(video)
    el.playbackRate = video.playbackRate
    el.volume = userAudio.volume
    el.muted = userAudio.muted
    delegatedAudio.set(video, el)
    video.muted = true
    if ('audioSession' in navigator) {
      try { navigator.audioSession.type = 'playback' } catch { /* optional API */ }
    }
    try {
      while (sourceIndex < sources.length) {
        seek(el, video.currentTime)
        try {
          await el.play()
          if (disposed) return false
          ownsAudio = true
          active = true
          setMediaSession(el, { title, artist, artwork })
          onReady(true)
          if (video.paused && !isAudioOnly()) playVisual()
          return true
        } catch (error) {
          if (disposed) return false
          // Permission failures require a gesture; changing formats won't help.
          if (error.name === 'NotAllowedError' || sourceIndex + 1 >= sources.length) break
          sourceIndex++
          el.src = sources[sourceIndex]
          el.load()
        }
      }
      restoreVideoAudio()
      if (!document.hidden && video.paused) video.play().catch(() => {})
      return false
    } finally {
      starting = false
    }
  }
  listen(el, 'loadedmetadata', () => seek(el, video.currentTime))
  listen(video, 'play', () => { cancelVideoPause(); if (!syncing) start() })
  listen(video, 'pause', () => {
    cancelVideoPause()
    if (!ownsAudio || starting || video.ended || isAudioOnly()) return
    // WebKit may pause the visual track BEFORE updating document.hidden/focus.
    // Allow the lifecycle event to cancel this; an explicit foreground pause
    // still pauses the audio if the page stays visible and focused.
    videoPauseTimer = setTimeout(() => {
      if (!disposed && !document.hidden && !backgroundSuspended && document.hasFocus() && video.paused && !video.ended && !isAudioOnly()) el.pause()
    }, 300)
  })
  listen(video, 'seeking', () => {
    if (!ownsAudio || syncing || document.hidden) return
    syncing = true
    seek(el, video.currentTime)
    syncing = false
  })
  listen(video, 'ratechange', () => { el.playbackRate = video.playbackRate })
  listen(video, 'volumechange', () => {
    if (!delegatedAudio.has(video)) return
    if (video.volume !== lastVideoVolume) {
      lastVideoVolume = video.volume
      el.volume = video.volume
    }
    // Never toggle the audible mute in response to a technical video mute event.
    if (!video.muted) {
      el.muted = false
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
  listen(el, 'error', () => {
    // play() rejects for startup errors; let its loop select the next format.
    if (starting || disposed) return
    if (sourceIndex + 1 < sources.length) {
      restoreVideoAudio()
      sourceIndex++
      el.src = sources[sourceIndex]
      el.load()
      start().then(started => { if (!started) fail() })
    } else fail()
  })
  listen(window, 'blur', () => {
    backgroundSuspended = true
    cancelVideoPause()
  })
  listen(window, 'focus', () => { backgroundSuspended = false })
  listen(document, 'visibilitychange', () => {
    backgroundSuspended = document.hidden
    cancelVideoPause()
    if (!ownsAudio) return
    if (document.hidden) {
      resumeVisual = !el.paused && !el.ended
      // Pause only the visual track, leaving the same native audio running.
      video.pause()
      // Keep the lock-screen session attached to the audio, not the paused video.
      if (!el.paused) setMediaSession(el, { title, artist, artwork })
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
  // Capture the Play label before Shaka changes it to Pause during the click.
  listen(document, 'click', gesture, { capture: true })
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
      cancelVideoPause()
      removers.forEach(remove => remove())
      const userAudio = getVideoAudioState(video)
      delegatedAudio.delete(video)
      stopBackgroundAudio()
      video.muted = userAudio.muted
      video.volume = userAudio.volume
      el.controls = false
      el.style.display = 'none'
      document.body.appendChild(el)
    }
  }
}
