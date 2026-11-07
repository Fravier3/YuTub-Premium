/**
 * Videos relacionados desde la pantalla completa (Android TV).
 *
 * Con el video a pantalla completa, al seguir pulsando ↓ más allá de los controles se despliega una
 * cuadrícula con los videos relacionados encima del video (que sigue sonando). Se navega con las
 * flechas y OK abre el video elegido, sin salir de la pantalla completa.
 */

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

/** Lee los relacionados que la página ya cargó. */
function collectRelated() {
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

/** @returns {boolean} true si se abrió el panel */
export function openRelated() {
  if (panel) return true
  const items = collectRelated()
  if (items.length === 0) return false

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
    if (href) location.hash = href
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
