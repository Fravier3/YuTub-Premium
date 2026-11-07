/**
 * Videos relacionados desde la pantalla completa (Android TV).
 *
 * Con el video a pantalla completa, al seguir pulsando ↓ más allá de los controles se despliega una
 * cuadrícula con los videos relacionados encima del video (que sigue sonando). Se navega con las
 * flechas y OK abre el video elegido, sin salir de la pantalla completa.
 */

import router from '../router/index'
import { showToast } from './utils'

const MAX_ITEMS = 24

/** @type {HTMLElement | null} */
let panel = null
/** @type {Element | null} */
let previousFocus = null

export const isRelatedOpen = () => panel !== null

/**
 * @param {string} tag
 * @param {string} className
 * @param {string} [text]
 */
function el(tag, className, text) {
  const node = document.createElement(tag)
  node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

/** @param {number} seconds */
function formatDuration(seconds) {
  const total = Number(seconds)
  if (!Number.isFinite(total) || total <= 0) return ''
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const sec = String(Math.floor(total % 60)).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`
}

/** Los relacionados tal como los guardó la página del video (no depende de qué tarjetas se dibujaron). */
function collectFromData() {
  const list = Array.isArray(window.yutuTvRelatedVideos) ? window.yutuTvRelatedVideos : []
  const items = []

  for (const video of list) {
    const id = video?.videoId
    if (!id || (video.type && video.type !== 'video' && video.type !== 'shortVideo')) continue
    const thumbs = Array.isArray(video.videoThumbnails) ? video.videoThumbnails : []
    const thumb = thumbs.find((t) => t.quality === 'medium') ?? thumbs.find((t) => t.quality === 'high') ?? thumbs[0]

    items.push({
      href: `#/watch/${id}`,
      image: thumb?.url ?? `https://i.ytimg.com/vi/${id}/mqdefault.jpg`,
      duration: video.liveNow ? 'EN VIVO' : formatDuration(video.lengthSeconds),
      title: video.title ?? '',
      channel: video.author ?? ''
    })
    if (items.length >= MAX_ITEMS) break
  }

  return items
}

/** Respaldo: las tarjetas que la página ya dibujó. */
function collectFromCards() {
  const cards = Array.from(document.querySelectorAll('.sidebarArea .ft-list-video.recommendation'))
  const items = []

  for (const card of cards) {
    const link = card.querySelector('a.thumbnailLink')
    const href = link?.getAttribute('href')
    if (!href) continue

    items.push({
      href,
      image: card.querySelector('img.thumbnailImage')?.getAttribute('src') ?? '',
      duration: card.querySelector('.videoDuration')?.textContent.trim() ?? '',
      title: card.querySelector('.title')?.textContent.trim() ?? '',
      channel: card.querySelector('.channelName')?.textContent.trim() ?? ''
    })
    if (items.length >= MAX_ITEMS) break
  }

  return items
}

function collectRelated() {
  const fromData = collectFromData()
  return fromData.length > 0 ? fromData : collectFromCards()
}

/** @returns {boolean} true si se abrió el panel */
export function openRelated() {
  if (panel) return true
  const items = collectRelated()
  if (items.length === 0) {
    showToast('No hay videos relacionados para este video')
    return false
  }

  previousFocus = document.activeElement
  panel = el('div', 'tvRelated')
  panel.setAttribute('role', 'dialog')
  panel.setAttribute('aria-label', 'Videos relacionados')
  panel.appendChild(el('h2', 'tvRelatedTitle', 'Videos relacionados'))

  const grid = el('div', 'tvRelatedGrid')
  for (const item of items) {
    const button = el('button', 'tvRelatedItem')
    button.type = 'button'
    button.dataset.href = item.href

    const thumb = el('span', 'tvRelatedThumb')
    if (item.image) {
      const img = document.createElement('img')
      img.src = item.image
      img.alt = ''
      thumb.appendChild(img)
    }
    if (item.duration) thumb.appendChild(el('span', 'tvRelatedDuration', item.duration))
    button.appendChild(thumb)
    button.appendChild(el('span', 'tvRelatedName', item.title))
    button.appendChild(el('span', 'tvRelatedChannel', item.channel))
    grid.appendChild(button)
  }
  panel.appendChild(grid)

  panel.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target.closest('.tvRelatedItem') : null
    if (!target) return
    const href = target.dataset.href
    closeRelated(false)
    // replace: el video elegido sustituye al actual en el historial, así Atrás vuelve a la búsqueda
    if (href) router.replace(href.replace(/^#/, ''))
  })

  document.body.appendChild(panel)
  grid.querySelector('.tvRelatedItem')?.focus({ preventScroll: true })
  return true
}

/** @param {boolean} restoreFocus devolver el foco al control donde estaba */
export function closeRelated(restoreFocus) {
  if (!panel) return
  panel.remove()
  panel = null
  if (restoreFocus && previousFocus instanceof HTMLElement && previousFocus.isConnected) {
    previousFocus.focus({ preventScroll: true })
  }
  previousFocus = null
}

export function initTvRelated() {
  // Al abrir otro video (o cambiar de página) el panel ya no corresponde
  window.addEventListener('hashchange', () => closeRelated(false))
}
