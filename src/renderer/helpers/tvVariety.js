/**
 * Variedad en la portada de TV: cada vez que se abre la app salen videos distintos.
 *
 * Se guarda en el dispositivo qué videos se mostraron las últimas veces y la próxima vez se prefieren los
 * que no han salido; además las listas se mezclan. Si no quedan suficientes videos nuevos se completa con
 * los ya vistos, para que nunca falte contenido.
 */
const STORAGE_KEY = 'yutu.tv.seen'
const MAX_REMEMBERED = 400

/** @returns {string[]} ids, los más recientes primero */
function readSeen() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')
    return Array.isArray(stored) ? stored.filter((id) => typeof id === 'string') : []
  } catch {
    return []
  }
}

/** Mezcla una copia de la lista (Fisher-Yates). */
export function shuffle(list) {
  const copy = [...list]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

/** Elige `count` elementos al azar. */
export const pickRandom = (list, count) => shuffle(list).slice(0, count)

/** Lo que se mostró las últimas veces (se lee una sola vez por carga de portada). */
export const loadSeenIds = () => new Set(readSeen())

/**
 * Mezcla la lista y deja primero los videos que no se mostraron antes.
 * @param {{ videoId: string }[]} items
 * @param {Set<string>} seen
 * @param {number} minimumFresh si hay menos videos nuevos que esto, se completa con los ya mostrados
 */
export function varied(items, seen, minimumFresh = 10) {
  const mixed = shuffle(items)
  const fresh = mixed.filter((item) => !seen.has(item.videoId))
  if (fresh.length >= minimumFresh) return fresh
  return [...fresh, ...mixed.filter((item) => seen.has(item.videoId))]
}

/** Guarda lo que se acaba de mostrar para variarlo la próxima vez. */
export function rememberShown(ids) {
  try {
    const merged = [...new Set([...ids, ...readSeen()])].slice(0, MAX_REMEMBERED)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(merged))
  } catch { /* sin almacenamiento: solo se pierde la variedad entre sesiones */ }
}
