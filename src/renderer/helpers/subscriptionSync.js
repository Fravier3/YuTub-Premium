import store from '../store/index'
import { MAIN_PROFILE_ID } from '../../constants'
import { accountClient, identity } from './yutuIdentity'
import { mergeSyncEntries, planLocalChanges, sameSyncEntries, trackLocalChanges } from './subscriptionMerge.js'

/*
 * Suscripciones sincronizadas con la cuenta de Yutu (solo app web y solo con sesión iniciada).
 * Sin sesión todo sigue igual que antes: las suscripciones viven en el dispositivo.
 */
const RECORD_KEY = 'yutu-subscriptions-sync-v1:'

function readRecord(userId) {
  try {
    const stored = JSON.parse(localStorage.getItem(RECORD_KEY + userId) || '[]')
    return Array.isArray(stored) ? stored : []
  } catch { return [] }
}
function writeRecord(userId, entries) {
  try { localStorage.setItem(RECORD_KEY + userId, JSON.stringify(entries)) } catch { /* Sin espacio: se recalcula en la próxima sincronización. */ }
}

const mainProfile = () => store.getters.getProfileList.find(profile => profile._id === MAIN_PROFILE_ID)

let running = false
let again = false
let applying = false
let timer

export async function syncSubscriptions() {
  const userId = identity.user?.id
  const profile = mainProfile()
  if (!userId || !profile) return
  if (running) { again = true; return }
  running = true
  try {
    const client = await accountClient()
    const { data, error } = await client.from('yutu_user_state').select('subscriptions').eq('user_id', userId).maybeSingle()
    if (error) throw error
    if (identity.user?.id !== userId) return

    const cloud = data?.subscriptions ?? []
    const local = trackLocalChanges(profile.subscriptions, readRecord(userId))
    const merged = mergeSyncEntries(local, cloud)

    const plan = planLocalChanges(profile.subscriptions, merged)
    applying = true
    try {
      for (const entry of plan.add) {
        await store.dispatch('addChannelToProfiles', {
          channel: { id: entry.id, name: entry.name, thumbnail: entry.thumbnail },
          profileIds: [MAIN_PROFILE_ID]
        })
      }
      for (const channelId of plan.remove) {
        // Como al darse de baja a mano desde el perfil principal: se quita de todos los perfiles
        const profileIds = store.getters.getProfileList
          .filter(item => item.subscriptions.some(channel => channel.id === channelId))
          .map(item => item._id)
        await store.dispatch('removeChannelFromProfiles', { channelId, profileIds })
      }
    } finally { applying = false }

    writeRecord(userId, merged)
    if (!sameSyncEntries(merged, cloud)) {
      const write = data
        ? client.from('yutu_user_state').update({ subscriptions: merged }).eq('user_id', userId)
        : client.from('yutu_user_state').upsert({ user_id: userId, subscriptions: merged })
      const { error: writeError } = await write
      if (writeError) throw writeError
    }
  } catch (error) {
    // Sin conexión o sin permiso: las suscripciones siguen en el dispositivo y se reintenta más tarde
    console.warn('No se pudieron sincronizar las suscripciones', error)
  } finally {
    running = false
    if (again) { again = false; scheduleSubscriptionSync(500) }
  }
}

function scheduleSubscriptionSync(delay = 2000) {
  clearTimeout(timer)
  if (identity.user) timer = setTimeout(syncSubscriptions, delay)
}

let started = false
/** Se llama una vez al arrancar la app, cuando los perfiles ya están cargados. */
export function startSubscriptionSync(watch) {
  if (started || process.env.IS_ELECTRON || process.env.YUTU_TV) return
  started = true
  // Al iniciar sesión (o al recuperar la sesión guardada)
  watch(() => identity.user?.id, (id) => { if (id) scheduleSubscriptionSync(300) }, { immediate: true })
  // Al suscribirse o darse de baja en este dispositivo
  store.subscribe((mutation) => {
    if (!applying && (mutation.type === 'addChannelToProfiles' || mutation.type === 'removeChannelFromProfiles' || mutation.type === 'upsertProfileToList')) {
      scheduleSubscriptionSync()
    }
  })
  // Al volver a la app o recuperar conexión: recoger lo que cambió en otros dispositivos
  document.addEventListener('visibilitychange', () => { if (!document.hidden) scheduleSubscriptionSync(1000) })
  window.addEventListener('online', () => scheduleSubscriptionSync(1000))
}
