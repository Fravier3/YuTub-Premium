/**
 * Arranque rápido de videos en Android TV.
 *
 * Abrir un video necesita dos respuestas de la instancia: la información del video y el manifiesto
 * (lista de calidades y segmentos). Antes se pedían una detrás de otra, y solo después de pulsar OK.
 * Aquí:
 *  - las dos se piden a la vez;
 *  - se adelantan mientras el usuario se queda un momento sobre un video, antes de pulsar OK;
 *  - el manifiesto ya descargado se entrega al reproductor tal cual, sin pedirlo otra vez.
 */
import store from '../store/index'
import { invidiousGetVideoInformation } from './api/invidious'

const TTL_MS = 3 * 60 * 1000
const MAX_ENTRIES = 5
const MANIFEST_WAIT_MS = 5000

/** @type {Map<string, { at: number, info: Promise<any>, manifest: Promise<string | null> }>} */
const entries = new Map()

const instanceUrl = () => store.getters.getCurrentInvidiousInstanceUrl

function fetchManifest(videoId) {
  return fetch(`${instanceUrl()}/api/manifest/dash/id/${encodeURIComponent(videoId)}?local=true`)
    .then((response) => (response.ok ? response.text() : null))
    .then((text) => (text && text.includes('<MPD') ? text : null))
    .catch(() => null)
}

/** Empieza a pedir la información y el manifiesto de un video (no repite si ya se pidió hace poco). */
export function prefetchVideo(videoId) {
  if (!videoId) return null

  const existing = entries.get(videoId)
  if (existing && Date.now() - existing.at < TTL_MS) return existing

  // Se guardan pocos videos: los más viejos se descartan
  if (entries.size >= MAX_ENTRIES) entries.delete(entries.keys().next().value)

  const entry = {
    at: Date.now(),
    info: invidiousGetVideoInformation(videoId),
    manifest: fetchManifest(videoId)
  }
  // Un error de red no debe quedar como "promesa rota" sin atender
  entry.info.catch(() => entries.delete(videoId))
  entries.set(videoId, entry)
  return entry
}

/** Información del video: usa lo precargado si hay, y si no la pide ya junto con el manifiesto. */
export function getVideoInfo(videoId) {
  const entry = prefetchVideo(videoId)
  return entry.info.catch(() => invidiousGetVideoInformation(videoId))
}

/**
 * Manifiesto precargado, listo para dárselo al reproductor como dirección `data:` (sin otro viaje a la instancia).
 * Devuelve null si no hay o tarda demasiado (el reproductor lo pide por su cuenta).
 * @param {string} videoId
 * @returns {Promise<string | null>}
 */
export async function getPrefetchedManifestUrl(videoId) {
  const entry = entries.get(videoId)
  if (!entry) return null

  const text = await Promise.race([
    entry.manifest,
    new Promise((resolve) => setTimeout(() => resolve(null), MANIFEST_WAIT_MS))
  ])
  if (!text) return null

  // Las direcciones relativas del manifiesto se resuelven contra la instancia, como cuando lo pide ella misma
  const base = `${instanceUrl()}/api/manifest/dash/id/`
  const withBase = /<MPD[^>]*>\s*<BaseURL/.test(text) ? text : text.replace(/(<MPD[^>]*>)/, `$1<BaseURL>${base}</BaseURL>`)

  return `data:application/dash+xml;charset=UTF-8,${encodeURIComponent(withBase)}`
}
