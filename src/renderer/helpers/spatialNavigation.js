/**
 * Navegación con control remoto (flechas + OK) para la versión de Android TV.
 *
 * Por defecto el navegador pasa por TODOS los enlaces y botones (título, canal, "+", menú…),
 * lo que en una TV es muy lento. Aquí:
 *  - cada tarjeta de video/canal/lista es UN solo punto de foco (la miniatura);
 *  - las flechas mueven el foco al elemento más cercano en esa dirección;
 *  - en la página de un video, sin nada enfocado: ←/→ saltan 10 s y OK pausa/reproduce.
 */

import { closeTvSearch, isTvSearchOpen } from './tvSearch'
import { closeRelated, isRelatedOpen, openRelated } from './tvRelated'

const SEEK_SECONDS = 10
const FOCUSABLE = 'a[href], button, input, select, textarea, summary, [tabindex], [role="button"], [role="menuitem"], [role="option"]'
const CARD_SELECTOR = '.ft-list-item'
const TEXT_INPUT_TYPES = ['text', 'search', 'url', 'email', 'password', 'number', 'tel']

/** @param {Element} el */
function isTextInput(el) {
  return el instanceof HTMLTextAreaElement ||
    (el instanceof HTMLInputElement && TEXT_INPUT_TYPES.includes(el.type))
}

/** @param {HTMLElement} el */
function isVisible(el) {
  if (el.closest('[inert], [hidden], [aria-hidden="true"]')) return false
  if (el.matches(':disabled') || (el.getAttribute('tabindex') === '-1' && !el.closest(CARD_SELECTOR))) return false
  const rect = el.getBoundingClientRect()
  if (rect.width < 4 || rect.height < 4) return false
  const style = getComputedStyle(el)
  return style.visibility !== 'hidden' && style.display !== 'none' && style.opacity !== '0'
}

/** Zona donde se puede mover el foco: el diálogo abierto, o toda la página. */
function getScope() {
  const tvSearch = document.querySelector('.tvSearch')
  if (tvSearch) return tvSearch
  const related = document.querySelector('.tvRelated')
  if (related) return related
  const prompts = document.querySelectorAll('.prompt')
  const open = Array.from(prompts).filter((p) => !p.hasAttribute('inert')).pop()
  if (open) return open
  return getFullWindowPlayer() ?? document
}

/** El reproductor, solo mientras ocupa toda la pantalla (el resto de la página queda detrás). */
function getFullWindowPlayer() {
  return document.body.classList.contains('playerFullWindow') ? document.querySelector('.ftVideoPlayer') : null
}

/** @returns {HTMLElement[]} */
function getCandidates() {
  const scope = getScope()
  const all = Array.from(scope.querySelectorAll(FOCUSABLE))
  const firstInCard = new Set()

  return all.filter((el) => {
    if (!(el instanceof HTMLElement) || !isVisible(el)) return false

    // Una sola parada por tarjeta: la miniatura (o el primer elemento enfocable)
    const card = el.closest(CARD_SELECTOR)
    if (card) {
      if (!firstInCard.has(card)) {
        const thumb = card.querySelector('.thumbnailLink, a[href]')
        firstInCard.add(card)
        card.__yutuFocusTarget = thumb ?? el
      }
      return card.__yutuFocusTarget === el
    }
    return true
  })
}

/**
 * Elige el candidato más cercano en la dirección pedida.
 * @param {DOMRect} from
 * @param {HTMLElement[]} candidates
 * @param {'left' | 'right' | 'up' | 'down'} dir
 */
function pickNext(from, candidates, dir, current) {
  const cx = from.left + from.width / 2
  const cy = from.top + from.height / 2
  let best = null
  let bestScore = Infinity

  for (const el of candidates) {
    if (el === current) continue
    const r = el.getBoundingClientRect()
    const x = r.left + r.width / 2
    const y = r.top + r.height / 2

    let primary
    let ortho
    switch (dir) {
      case 'right':
        if (x <= cx + 1 && r.left < from.right - 1) continue
        primary = Math.max(0, r.left - from.right)
        ortho = Math.abs(y - cy)
        break
      case 'left':
        if (x >= cx - 1 && r.right > from.left + 1) continue
        primary = Math.max(0, from.left - r.right)
        ortho = Math.abs(y - cy)
        break
      case 'down':
        if (y <= cy + 1 && r.top < from.bottom - 1) continue
        primary = Math.max(0, r.top - from.bottom)
        ortho = Math.abs(x - cx)
        break
      default: // up
        if (y >= cy - 1 && r.bottom > from.top + 1) continue
        primary = Math.max(0, from.top - r.bottom)
        ortho = Math.abs(x - cx)
        break
    }

    // Se prefiere lo que está alineado: la distancia lateral pesa el doble
    const score = primary + ortho * 2
    if (score < bestScore) {
      bestScore = score
      best = el
    }
  }

  return best
}

/** @param {HTMLElement} el */
function focusElement(el) {
  el.focus({ preventScroll: true })
  if (el.closest('.tvRelated')) {
    el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' })
  } else if (!getFullWindowPlayer()) {
    el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' })
  }
}

function getVideo() {
  return document.querySelector('.ftVideoPlayer video') ?? document.querySelector('video')
}

const isWatchPage = () => location.hash.startsWith('#/watch')

/** ¿Está el foco "en el video" (nada interactivo enfocado)? */
function isPlayerMode() {
  if (!isWatchPage() || !getVideo()) return false
  const active = document.activeElement
  if (!active || active === document.body || active === getVideo()) return true
  return !active.matches('a, button, input, select, textarea, summary, [tabindex], [role="button"]')
}

/**
 * El reproductor ignora los clics en controles que considera ocultos, y se esconden solos a los pocos segundos.
 * Un movimiento de "ratón" simulado los muestra y reinicia ese temporizador.
 */
function wakePlayerControls() {
  const player = getFullWindowPlayer()
  if (!player) return
  const rect = player.getBoundingClientRect()
  player.dispatchEvent(new MouseEvent('mousemove', {
    bubbles: true,
    clientX: rect.left + rect.width / 2,
    clientY: rect.top + rect.height - 20
  }))
}

/** @param {KeyboardEvent} event */
function handleKeyDown(event) {
  if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return

  const isNavKey = event.key.startsWith('Arrow') || event.key === 'Enter'
  if (isNavKey && !isRelatedOpen() && document.activeElement && document.activeElement !== document.body) wakePlayerControls()

  const dirs = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' }
  const dir = dirs[event.key]
  const active = document.activeElement

  // Escribiendo en un campo: izquierda/derecha mueven el cursor del texto
  if (active && isTextInput(active) && !active.hasAttribute('data-tv-search') && (dir === 'left' || dir === 'right')) return

  // Página del video, foco en el video: saltar y pausar
  if (isPlayerMode() && !isTvSearchOpen() && !isRelatedOpen() && !getScope().classList?.contains('prompt')) {
    const video = getVideo()
    if (dir === 'left') {
      video.currentTime = Math.max(0, video.currentTime - SEEK_SECONDS)
      event.preventDefault()
      event.stopImmediatePropagation() // evita que el atajo propio de la app sume otro salto
      return
    }
    if (dir === 'right') {
      video.currentTime = Math.min(video.duration || Infinity, video.currentTime + SEEK_SECONDS)
      event.preventDefault()
      event.stopImmediatePropagation()
      return
    }
    if (event.key === 'Enter' || event.key === ' ') {
      if (video.paused) video.play().catch(() => {}); else video.pause()
      event.preventDefault()
      event.stopImmediatePropagation()
      return
    }
  }

  if (!dir) return

  event.preventDefault()
  event.stopImmediatePropagation()
  const candidates = getCandidates()
  if (candidates.length === 0) return

  // Sin nada enfocado: empezar por el contenido principal
  if (!active || active === document.body) {
    const inPlayer = getFullWindowPlayer() !== null
    const first = inPlayer
      ? (candidates.find((el) => el.matches('.shaka-play-button')) ?? candidates[0])
      : (candidates.find((el) => el.closest('.routerView')) ?? candidates[0])
    wakePlayerControls()
    focusElement(first)
    return
  }

  const current = active

  // ↓ sobre la fila de botones del reproductor (Play, volumen, ajustes…): no hay nada debajo, se abren los relacionados
  if (dir === 'down' && !isRelatedOpen() && getFullWindowPlayer() && current.closest('.shaka-controls-button-panel')) {
    openRelated()
    return
  }

  const from = current.getBoundingClientRect()
  const next = pickNext(from, candidates, dir, current)

  if (next) {
    focusElement(next)
  } else if (isRelatedOpen()) {
    // Arriba desde la primera fila de relacionados: cerrar el panel y volver a los controles
    if (dir === 'up') closeRelated(true)
  } else if (getFullWindowPlayer()) {
    if (dir === 'down') {
      // Más abajo de los controles: videos relacionados (el video sigue sonando)
      openRelated()
    } else if (dir === 'up') {
      // Arriba desde los controles: volver al modo video (←/→ saltan, OK pausa)
      active.blur()
    }
  } else if (dir === 'down' || dir === 'up') {
    // No hay nada más en esa dirección: bajar/subir la página por si carga más contenido
    window.scrollBy({ top: dir === 'down' ? 300 : -300, behavior: 'smooth' })
  }
}

const isShown = (el) => el instanceof HTMLElement && el.getClientRects().length > 0 && getComputedStyle(el).display !== 'none'

/**
 * Lo llama el APK al pulsar Atrás: cierra primero lo que esté abierto en el reproductor.
 * @returns {boolean} true si se encargó (el APK entonces no sale de la página)
 */
function handleBack() {
  if (isRelatedOpen()) {
    closeRelated(true)
    return true
  }

  if (isTvSearchOpen()) {
    closeTvSearch(true)
    return true
  }

  const player = document.querySelector('.ftVideoPlayer')
  if (!player) return false

  const subMenu = Array.from(player.querySelectorAll('.shaka-settings-menu')).find(isShown)
  if (subMenu) {
    subMenu.querySelector('.shaka-back-to-overflow-button')?.click()
    return true
  }

  const overflow = Array.from(player.querySelectorAll('.shaka-overflow-menu')).find(isShown)
  if (overflow) {
    player.querySelector('.shaka-overflow-menu-button')?.click()
    focusElement(player.querySelector('.shaka-overflow-menu-button') ?? player)
    return true
  }

  const active = document.activeElement
  if (active && active !== document.body && player.contains(active)) {
    active.blur() // salir de los controles, volver al modo video
    return true
  }

  return false
}

/** Lo llama el APK con la tecla MENÚ del control: abre los ajustes del reproductor (calidad, velocidad, subtítulos). */
function openPlayerSettings() {
  const player = document.querySelector('.ftVideoPlayer')
  const button = player?.querySelector('.shaka-overflow-menu-button')
  if (!button) return false

  wakePlayerControls()
  const alreadyOpen = Array.from(player.querySelectorAll('.shaka-overflow-menu')).some(isShown)
  if (!alreadyOpen) setTimeout(() => button.click(), 50)

  setTimeout(() => {
    const first = Array.from(player.querySelectorAll('.shaka-overflow-menu button, .shaka-settings-menu button')).find(isShown)
    if (first) first.focus({ preventScroll: true })
  }, 250)
  return true
}

export function initSpatialNavigation() {
  document.addEventListener('keydown', handleKeyDown, true)
  window.yutuTvBack = handleBack
  window.yutuTvOpenSettings = openPlayerSettings
}
