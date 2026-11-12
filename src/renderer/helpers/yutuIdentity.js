import { parseAuthReturn } from './authCallback'
import { computed, reactive } from 'vue'
import puppy from '../assets/img/puppy-avatar.webp'
import astronaut from '../assets/img/avatar-astronaut.webp'
import queen from '../assets/img/avatar-queen.webp'
import motorcycle from '../assets/img/avatar-motorcycle.webp'

export const avatarOptions = [
  { key: 'puppy', name: 'Perrito', image: puppy },
  { key: 'astronaut', name: 'Astronauta', image: astronaut },
  { key: 'queen', name: 'Reina', image: queen },
  { key: 'motorcycle', name: 'Moto', image: motorcycle }
]
const KEY = 'yutu-identity-v1:'
const SESSION_KEY = 'yutu-cloud-auth-v1'
const URL = 'https://syyealdlapxmpeccaary.supabase.co'
const PUBLIC_KEY = 'sb_publishable_t_BJFV9l8tQvcPhZlTnLlg_5fYZJCwB'
const defaults = () => ({ name: 'Mi perfil', avatar: 'puppy', custom: '' })
export function cleanProfile(value = {}) {
  if (!value || typeof value !== 'object') value = {}
  const image = typeof value.custom === 'string' && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(value.custom) && value.custom.length <= 350000 ? value.custom : ''
  return { name: String(value.name || 'Mi perfil').trim().slice(0, 50) || 'Mi perfil', avatar: avatarOptions.some(a => a.key === value.avatar) || value.avatar === 'custom' ? value.avatar : 'puppy', custom: image }
}
export function cleanHistory(items) {
  const unique = new Map()
  for (const item of (Array.isArray(items) ? items : []).slice(0, 300)) {
    if (!item || !/^[\w-]{11}$/.test(item.videoId || '')) continue
    const entry = { videoId: item.videoId, title: String(item.title || '').slice(0, 300), author: String(item.author || '').slice(0, 100), authorId: String(item.authorId || '').slice(0, 100), timeWatched: Number(item.timeWatched) || 0 }
    if (!unique.has(entry.videoId) || unique.get(entry.videoId).timeWatched < entry.timeWatched) unique.set(entry.videoId, entry)
  }
  return [...unique.values()].sort((a, b) => b.timeWatched - a.timeWatched).slice(0, 100)
}
/** Búsquedas recientes del usuario (la más nueva primero): son la señal principal de "Para ti". */
export function cleanSearches(items) {
  const unique = new Map()
  for (const item of Array.isArray(items) ? items : []) {
    const query = String(item || '').replaceAll(/\s+/g, ' ').trim().slice(0, 120)
    const key = query.toLowerCase()
    if (query && !unique.has(key)) unique.set(key, query)
  }
  return [...unique.values()].slice(0, 30)
}
function read(bucket) {
  try {
    const value = JSON.parse(localStorage.getItem(KEY + bucket) || '{}')
    return { profile: cleanProfile(value.profile), history: cleanHistory(value.history), searches: cleanSearches(value.searches), modified: Number(value.modified) || 0 }
  } catch { return { profile: defaults(), history: [], searches: [], modified: 0 } }
}
// Capture and remove credentials before Vue Router can replace the URL fragment.
const returnedAuth = window.location?.href ? parseAuthReturn(window.location.href) : null
if (returnedAuth) window.history.replaceState(null, '', returnedAuth.cleanHref)
let pendingAuthReturn = returnedAuth?.callback
const initial = read('guest')
export const identity = reactive({ ...initial, user: null, bucket: 'guest', open: false, busy: false, status: '', error: '', sessionStatus: 'guest', syncState: 'local', lastSyncedAt: null })
export const currentAvatar = computed(() => identity.profile.avatar === 'custom' && identity.profile.custom ? identity.profile.custom : avatarOptions.find(a => a.key === identity.profile.avatar)?.image || puppy)
function persist() {
  try {
    localStorage.setItem(KEY + identity.bucket, JSON.stringify({ profile: identity.profile, history: identity.history, searches: identity.searches, modified: identity.modified }))
  } catch { identity.error = 'No queda espacio local para guardar. Libera espacio o sincroniza con tu cuenta.' }
}
let clientPromise
let syncTimer
let accountGeneration = 0
async function getClient() {
  if (!clientPromise) {
    clientPromise = import('@supabase/supabase-js').then(({ createClient }) => {
      const client = createClient(URL, PUBLIC_KEY, { auth: { storageKey: SESSION_KEY, detectSessionInUrl: false } })
      client.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') setTimeout(() => loadAccount(session), 0)
      })
      window.addEventListener('online', () => { if (identity.user) syncAccount() })
      return client
    }).catch(error => { clientPromise = null; throw error })
  }
  return clientPromise
}
/** Cliente de la cuenta para otros módulos (p. ej. la sincronización de suscripciones). */
export const accountClient = () => getClient()
export async function restoreAccount() {
  if (!localStorage.getItem(SESSION_KEY) && !pendingAuthReturn) return
  identity.sessionStatus = 'restoring'
  try {
    const client = await getClient()
    let result
    if (pendingAuthReturn) {
      const callback = pendingAuthReturn
      pendingAuthReturn = null
      identity.open = true
      if (callback.kind === 'error') throw new Error('confirmation')
      result = callback.kind === 'session'
        ? await client.auth.setSession(callback.session)
        : await client.auth.exchangeCodeForSession(callback.code)
    } else result = await client.auth.getSession()
    if (result.error) throw result.error
    await loadAccount(result.data.session)
    if (!result.data.session) identity.sessionStatus = 'guest'
  } catch {
    identity.sessionStatus = 'error'
    identity.error = 'No se pudo recuperar la sesión. Inicia sesión aquí con tu correo y contraseña; tus cambios locales siguen guardados.'
  }
}

async function loadAccount(session) {
  const id = session?.user?.id || null
  identity.sessionStatus = id ? 'signed-in' : 'guest'
  if (identity.user?.id === id && identity.bucket === (id || 'guest')) return
  const generation = ++accountGeneration
  clearTimeout(syncTimer)
  const guest = read('guest')
  identity.user = id ? { id, email: session.user.email } : null
  identity.bucket = id || 'guest'
  Object.assign(identity, read(identity.bucket))
  identity.error = ''
  identity.syncState = id ? 'syncing' : 'local'
  identity.lastSyncedAt = null
  identity.status = id ? 'Preparando tu perfil…' : 'Guardado en este dispositivo'
  if (!id) return
  try {
    const client = await getClient()
    const { data, error } = await client.from('yutu_user_state').select('profile,history,updated_at').eq('user_id', id).maybeSingle()
    if (error) throw error
    if (generation !== accountGeneration) return
    if (data) {
      if (Date.parse(data.updated_at) >= identity.modified) identity.profile = cleanProfile(data.profile)
      identity.history = cleanHistory([...identity.history, ...data.history])
    } else if (!identity.modified) {
      identity.profile = guest.profile
      identity.history = guest.history
      if (!identity.searches.length) identity.searches = guest.searches
    }
    persist()
    await syncAccount()
  } catch {
    if (generation === accountGeneration) {
      identity.syncState = 'error'
      identity.error = 'Tu sesión está iniciada, pero no se pudo sincronizar el perfil. Conservamos tus datos en este dispositivo.'
    }
  }
}
export async function syncAccount() {
  if (!identity.user) return
  const id = identity.user.id
  identity.syncState = 'syncing'
  const payload = { user_id: id, profile: cleanProfile(identity.profile), history: cleanHistory(identity.history), updated_at: new Date().toISOString() }
  try {
    const client = await getClient()
    const { error } = await client.from('yutu_user_state').upsert(payload)
    if (error) throw error
    if (identity.user?.id !== id) return
    identity.syncState = 'synced'
    identity.lastSyncedAt = Date.now()
    identity.status = 'Sincronizado con tu cuenta'
    identity.error = ''
  } catch {
    if (identity.user?.id === id) {
      identity.syncState = 'error'
      identity.error = 'Sesión iniciada. No se pudieron sincronizar los cambios; están guardados en este dispositivo.'
    }
  }
}
function scheduleSync() {
  clearTimeout(syncTimer)
  if (identity.user) {
    identity.syncState = 'pending'
    syncTimer = setTimeout(syncAccount, 1500)
  }
}
export function saveProfile(profile) {
  identity.profile = cleanProfile(profile)
  identity.modified = Date.now()
  persist()
  identity.status = 'Guardado en este dispositivo'
  scheduleSync()
}
export function rememberListening(item) {
  if (process.env.IS_ELECTRON || process.env.YUTU_TV) return
  const previous = identity.history.find(v => v.videoId === item.videoId)
  if (previous && Date.now() - previous.timeWatched < 30000) return
  identity.history = cleanHistory([{ ...item, timeWatched: Date.now() }, ...identity.history])
  persist()
  scheduleSync()
}
/** Lo que el usuario busca a propósito. Se guarda por usuario en este dispositivo; no sale de él. */
export function rememberSearch(query) {
  if (process.env.IS_ELECTRON || process.env.YUTU_TV) return
  const searches = cleanSearches([query, ...identity.searches])
  if (searches[0] === identity.searches[0] && searches.length === identity.searches.length) return
  identity.searches = searches
  persist()
}
export function forgetSearch(query) {
  if (process.env.IS_ELECTRON || process.env.YUTU_TV) return
  const key = String(query || '').trim().toLowerCase()
  identity.searches = identity.searches.filter(item => item.toLowerCase() !== key)
  persist()
}
export function clearSearches() {
  if (process.env.IS_ELECTRON || process.env.YUTU_TV) return
  identity.searches = []
  persist()
}
export function seedListening(items) {
  if (identity.bucket !== 'guest' || identity.history.length || localStorage.getItem(KEY + 'guest')) return
  identity.history = cleanHistory(items)
  persist()
}
export async function authenticate(email, password, create = false) {
  identity.busy = true
  identity.error = ''
  try {
    const client = await getClient()
    if (create) {
      const response = await fetch(URL + '/functions/v1/yutu-signup', {
        method: 'POST',
        headers: { apikey: PUBLIC_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      })
      const result = await response.json()
      if (!response.ok || !result.created) throw new Error(result.error || 'No se pudo crear la cuenta.')
    }
    const { data, error } = await client.auth.signInWithPassword({ email, password })
    if (error) throw error
    if (data.session) await loadAccount(data.session)
    else {
      identity.sessionStatus = 'confirmation'
      identity.status = 'Cuenta solicitada. Confirma el correo y vuelve a iniciar sesión en esta app con tu correo y contraseña.'
    }
  } catch (error) {
    identity.error = error.message || 'No se pudo iniciar sesión. Intenta nuevamente.'
  } finally { identity.busy = false }
}
export async function signOutAccount() {
  const client = await getClient()
  const { error } = await client.auth.signOut({ scope: 'local' })
  if (error) { identity.error = 'No se pudo cerrar sesión. Intenta otra vez.'; return }
  await loadAccount(null)
}

export function forgetListening(videoId) {
  if (process.env.IS_ELECTRON || process.env.YUTU_TV) return
  identity.history = identity.history.filter(video => video.videoId !== videoId)
  persist()
  scheduleSync()
}
export function clearListening() {
  if (process.env.IS_ELECTRON || process.env.YUTU_TV) return
  identity.history = []
  persist()
  scheduleSync()
}
