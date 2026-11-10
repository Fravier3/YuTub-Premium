/**
 * Miniaturas en HD para la versión de TV.
 *
 * La calidad por defecto de FreeTube es 320x180 (mqdefault), que en una TV se ve borrosa. Se pide primero
 * hq720 (1280x720) y, si el video no la tiene, se baja a maxresdefault y por último a mqdefault.
 */
const THUMBNAIL_CHAIN = ['hq720.jpg', 'maxresdefault.jpg', 'sddefault.jpg', 'hqdefault.jpg', 'mqdefault.jpg']

export const hdThumbnailUrl = (baseUrl, id) => `${baseUrl}/vi/${id}/${THUMBNAIL_CHAIN[0]}`

/**
 * Para usar en el evento `error` de un <img>: prueba con la siguiente calidad de la lista.
 * @param {Event} event
 * @param {string} baseUrl
 * @param {string} id
 */
export function nextThumbnail(event, baseUrl, id) {
  const img = event.target
  if (!(img instanceof HTMLImageElement)) return
  const level = Number(img.dataset.thumbLevel ?? 0) + 1
  const name = THUMBNAIL_CHAIN[level]
  if (!name) return
  img.dataset.thumbLevel = String(level)
  img.src = `${baseUrl}/vi/${id}/${name}`
}
