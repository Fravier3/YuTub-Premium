/**
 * Búsqueda para Android TV: teclado en pantalla propio + sugerencias, todo con las flechas del control.
 *
 * El teclado de Android se "come" las flechas mientras está abierto, así que no se puede llegar a las
 * sugerencias de la app. Aquí el teclado y las sugerencias son botones de la misma pantalla.
 */
import { getInvidiousSearchSuggestions } from './api/invidious'

const KEY_ROWS = [
  '1234567890'.split(''),
  'qwertyuiop'.split(''),
  'asdfghjklñ'.split(''),
  ['z', 'x', 'c', 'v', 'b', 'n', 'm', ',', '.', '-']
]
const SUGGESTION_DELAY_MS = 200
const MAX_SUGGESTIONS = 8

/** @type {HTMLElement | null} */
let overlay = null
let text = ''
let timer = 0
let requestId = 0

/** El APK ofrece búsqueda por voz si la TV tiene reconocimiento de voz. */
function hasVoiceSearch() {
  try {
    return Boolean(window.YutuTV?.hasVoiceSearch?.())
  } catch {
    return false
  }
}

/** @returns {HTMLInputElement | null} */
export function getTvSearchInput() {
  return document.querySelector('.searchContainer input.ft-input')
}

export const isTvSearchOpen = () => overlay !== null

/** Marca la caja de búsqueda: sin teclado de Android; las flechas pueden salir de ella. */
export function prepareSearchInput() {
  const input = getTvSearchInput()
  if (!input) return
  input.setAttribute('inputmode', 'none')
  input.setAttribute('data-tv-search', '')
}

/**
 * @param {string} tag
 * @param {string} className
 * @param {string} [label]
 */
function el(tag, className, label) {
  const node = document.createElement(tag)
  node.className = className
  if (label !== undefined) node.textContent = label
  if (tag === 'button') node.type = 'button'
  return node
}

function key(label, action, extraClass = '') {
  const button = el('button', `tvKey ${extraClass}`.trim(), label)
  button.dataset.action = action
  return button
}

function build() {
  const root = el('div', 'tvSearch')
  root.setAttribute('role', 'dialog')
  root.setAttribute('aria-modal', 'true')

  const left = el('div', 'tvSearchMain')
  const display = el('div', 'tvSearchText')
  display.setAttribute('aria-live', 'polite')
  left.appendChild(display)

  const keys = el('div', 'tvSearchKeys')
  for (const row of KEY_ROWS) {
    const rowEl = el('div', 'tvKeyRow')
    for (const char of row) {
      rowEl.appendChild(key(char, `char:${char}`))
    }
    keys.appendChild(rowEl)
  }
  const last = el('div', 'tvKeyRow')
  last.appendChild(key('ESPACIO', 'space', 'tvKeyWide'))
  const del = key('⌫', 'delete')
  del.setAttribute('aria-label', 'Borrar')
  last.appendChild(del)
  const clear = key('Borrar todo', 'clear', 'tvKeyMid')
  last.appendChild(clear)
  last.appendChild(key('BUSCAR', 'search', 'tvKeyMid tvKeyPrimary'))
  last.appendChild(key('CERRAR', 'close', 'tvKeyMid'))
  if (hasVoiceSearch()) last.insertBefore(key('🎤 VOZ', 'voice', 'tvKeyMid'), last.lastChild)
  keys.appendChild(last)
  left.appendChild(keys)

  const right = el('div', 'tvSearchSide')
  right.appendChild(el('h2', 'tvSearchTitle', 'Sugerencias'))
  right.appendChild(el('div', 'tvSuggestions'))

  root.appendChild(left)
  root.appendChild(right)
  return root
}

function render() {
  if (!overlay) return
  const display = overlay.querySelector('.tvSearchText')
  display.textContent = text
  display.classList.toggle('empty', text === '')
  if (text === '') display.setAttribute('data-placeholder', 'Escribe para buscar')
}

/** @param {string[]} suggestions */
function renderSuggestions(suggestions) {
  if (!overlay) return
  const list = overlay.querySelector('.tvSuggestions')
  list.replaceChildren()
  if (suggestions.length === 0) {
    list.appendChild(el('p', 'tvSuggestionsEmpty', text.trim() ? 'Sin sugerencias' : 'Empieza a escribir'))
    return
  }
  for (const suggestion of suggestions.slice(0, MAX_SUGGESTIONS)) {
    const button = el('button', 'tvSuggestion', suggestion)
    button.dataset.action = 'suggestion'
    button.dataset.value = suggestion
    list.appendChild(button)
  }
}

function scheduleSuggestions() {
  clearTimeout(timer)
  const query = text.trim()
  if (query === '') {
    renderSuggestions([])
    return
  }
  timer = setTimeout(async () => {
    const id = ++requestId
    try {
      const response = await getInvidiousSearchSuggestions(query)
      if (id === requestId && overlay) renderSuggestions(response.suggestions ?? [])
    } catch {
      if (id === requestId && overlay) renderSuggestions([])
    }
  }, SUGGESTION_DELAY_MS)
}

/** Manda el texto a la caja de búsqueda real: así se usan los filtros y el historial de la app. */
function submit(query) {
  const value = query.trim()
  if (value === '') return
  const input = getTvSearchInput()
  closeTvSearch(false)
  if (!input) return

  input.value = value
  input.dispatchEvent(new Event('input', { bubbles: true }))
  input.dispatchEvent(new KeyboardEvent('keydown', {
    key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true
  }))
  input.blur()
}

/** @param {MouseEvent} event */
function handleClick(event) {
  const target = event.target instanceof Element ? event.target.closest('button') : null
  if (!target) return
  const action = target.dataset.action ?? ''

  if (action.startsWith('char:')) {
    text += action.slice(5)
  } else if (action === 'space') {
    if (!text.endsWith(' ') && text !== '') text += ' '
  } else if (action === 'delete') {
    text = text.slice(0, -1)
  } else if (action === 'clear') {
    text = ''
  } else if (action === 'search') {
    submit(text)
    return
  } else if (action === 'close') {
    closeTvSearch(true)
    return
  } else if (action === 'voice') {
    window.YutuTV?.startVoiceSearch?.()
    return
  } else if (action === 'suggestion') {
    submit(target.dataset.value ?? '')
    return
  }

  render()
  scheduleSuggestions()
}

export function openTvSearch() {
  if (overlay) return
  const input = getTvSearchInput()
  text = input?.value ?? ''
  overlay = build()
  overlay.addEventListener('click', handleClick)
  document.body.appendChild(overlay)
  render()
  renderSuggestions([])
  scheduleSuggestions()
  // Empezar en la primera letra de la fila de abajo de los números (q)
  overlay.querySelector('[data-action="char:q"]')?.focus({ preventScroll: true })
}

/** @param {boolean} restoreFocus devolver el foco a la caja de búsqueda */
export function closeTvSearch(restoreFocus) {
  if (!overlay) return
  clearTimeout(timer)
  requestId++
  overlay.remove()
  overlay = null
  if (restoreFocus) getTvSearchInput()?.focus({ preventScroll: true })
}

/** ¿Es parte de la barra de búsqueda (caja, lupa, etc.) y no el botón de filtros ni la lista de la app? */
function isSearchTrigger(target) {
  if (!(target instanceof Element)) return false
  if (target.closest('.navSearchButton')) return true
  return Boolean(target.closest('.searchContainer')) && !target.closest('.navFilterButton, ul, li')
}

/** OK en cualquier parte de la barra de búsqueda abre el teclado propio. */
function handleKeyDown(event) {
  // Solo teclas reales del usuario: el Enter que enviamos por código es para que la app haga la búsqueda
  if (!event.isTrusted || overlay || event.key !== 'Enter') return
  if (!isSearchTrigger(event.target)) return
  event.preventDefault()
  event.stopImmediatePropagation()
  openTvSearch()
}

/** Un clic (control con puntero) en la barra de búsqueda también abre el teclado propio. */
function handleSearchBarClick(event) {
  if (!event.isTrusted || overlay || !isSearchTrigger(event.target)) return
  event.preventDefault()
  event.stopImmediatePropagation()
  openTvSearch()
}

/** El APK devuelve aquí lo que se dijo por voz. */
function handleVoiceResult(spoken) {
  const query = String(spoken ?? '').trim()
  if (query === '') return
  if (!overlay) openTvSearch()
  submit(query)
}

export function initTvSearch() {
  window.yutuTvVoiceResult = handleVoiceResult
  // Marcar la caja de búsqueda en cuanto aparezca (antes de que nadie la enfoque)
  let scheduled = false
  new MutationObserver(() => {
    if (scheduled) return
    scheduled = true
    requestAnimationFrame(() => {
      scheduled = false
      prepareSearchInput()
    })
  }).observe(document.body, { childList: true, subtree: true })

  document.addEventListener('keydown', handleKeyDown, true)
  document.addEventListener('click', handleSearchBarClick, true)
  document.addEventListener('focusin', () => setTimeout(prepareSearchInput, 0), true)
  window.addEventListener('hashchange', () => setTimeout(prepareSearchInput, 300))
  setTimeout(prepareSearchInput, 500)
}
