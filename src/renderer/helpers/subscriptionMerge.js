/*
 * Fusión de suscripciones entre dispositivos (lógica pura, sin red ni almacenamiento).
 *
 * Cada canal lleva la hora de su último cambio (`at`) y, si se dio de baja, `removed: true`. Al juntar dos
 * copias gana el cambio más reciente de cada canal, así una baja hecha en un teléfono llega al otro y una
 * suscripción nueva nunca se pierde. Nunca se borra nada solo porque falte en una de las copias.
 */
const MAX_ENTRIES = 3000
const CHANNEL_ID = /^UC[\w-]{22}$/

export function cleanSyncEntries(items) {
  const entries = new Map()
  for (const item of Array.isArray(items) ? items : []) {
    if (!item || !CHANNEL_ID.test(item.id || '')) continue
    const entry = {
      id: item.id,
      name: String(item.name || '').slice(0, 120),
      thumbnail: typeof item.thumbnail === 'string' && item.thumbnail.startsWith('https://') ? item.thumbnail.slice(0, 300) : '',
      at: Number(item.at) || 0,
      removed: item.removed === true
    }
    const previous = entries.get(entry.id)
    if (!previous || previous.at < entry.at) entries.set(entry.id, entry)
  }
  return [...entries.values()]
}

/**
 * Pone al día el registro de este dispositivo con lo que hay ahora en la app: lo que el usuario añadió o
 * quitó desde la última vez queda anotado con la hora actual.
 * @param {{ id: string, name?: string, thumbnail?: string | null }[]} current suscripciones actuales
 * @param {object[]} known registro guardado en este dispositivo
 */
export function trackLocalChanges(current, known, now = Date.now()) {
  const record = new Map(cleanSyncEntries(known).map(entry => [entry.id, entry]))
  // Red de seguridad: si la app aparece sin ninguna suscripción pero el registro tenía varias, lo más
  // probable es que se borraran los datos del navegador, no que el usuario se diera de baja de todo a la
  // vez. No se anota ninguna baja y la nube las devuelve.
  const activeKnown = [...record.values()].filter(entry => !entry.removed).length
  if (current.length === 0 && activeKnown >= 3) return [...record.values()]
  const present = new Set()
  for (const channel of current) {
    if (!CHANNEL_ID.test(channel?.id || '')) continue
    present.add(channel.id)
    const entry = record.get(channel.id)
    if (!entry || entry.removed) {
      record.set(channel.id, { id: channel.id, name: channel.name || '', thumbnail: channel.thumbnail || '', at: now, removed: false })
    } else {
      // Mismo estado: solo se refrescan el nombre y la foto, sin tocar la hora
      record.set(channel.id, { ...entry, name: channel.name || entry.name, thumbnail: channel.thumbnail || entry.thumbnail })
    }
  }
  for (const entry of record.values()) {
    if (!entry.removed && !present.has(entry.id)) record.set(entry.id, { ...entry, at: now, removed: true })
  }
  return cleanSyncEntries([...record.values()])
}

/** Junta el registro local con el de la nube: por canal gana el cambio más reciente. */
export function mergeSyncEntries(local, cloud) {
  const merged = new Map(cleanSyncEntries(local).map(entry => [entry.id, entry]))
  for (const entry of cleanSyncEntries(cloud)) {
    const mine = merged.get(entry.id)
    if (!mine || entry.at > mine.at) merged.set(entry.id, entry)
  }
  // Si se llega al límite se sueltan primero las bajas más antiguas, nunca una suscripción activa
  const entries = [...merged.values()].sort((a, b) => Number(a.removed) - Number(b.removed) || b.at - a.at)
  return entries.slice(0, MAX_ENTRIES)
}

/**
 * Qué hay que hacer en la app para que coincida con el registro fusionado.
 * @returns {{ add: object[], remove: string[] }}
 */
export function planLocalChanges(current, merged) {
  const present = new Set(current.map(channel => channel.id))
  return {
    add: merged.filter(entry => !entry.removed && !present.has(entry.id)),
    remove: merged.filter(entry => entry.removed && present.has(entry.id)).map(entry => entry.id)
  }
}

export const sameSyncEntries = (a, b) => JSON.stringify(cleanSyncEntries(a).sort((x, y) => x.id.localeCompare(y.id))) ===
  JSON.stringify(cleanSyncEntries(b).sort((x, y) => x.id.localeCompare(y.id)))
