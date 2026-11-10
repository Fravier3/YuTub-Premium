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
function read(bucket) {
  try {
    const value = JSON.parse(localStorage.getItem(KEY + bucket) || '{}')
    return { profile: cleanProfile(value.profile), history: cleanHistory(value.history), modified: Number(value.modified) || 0 }
  } catch { return { profile: defaults(), history: [], modified: 0 } }
}
const initial = read('guest')
export const identity = reactive({ ...initial, user: null, bucket: 'guest', open: false, busy: false, status: '', error: '' })
export const currentAvatar = computed(() => identity.profile.avatar === 'custom' && identity.profile.custom ? identity.profile.custom : avatarOptions.find(a => a.key === identity.profile.avatar)?.image || puppy)
function persist() {
  try {
    localStorage.setItem(KEY + identity.bucket, JSON.stringify({ profile: identity.profile, history: identity.history, modified: identity.modified }))
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
export async function restoreAccount() {
  if (!localStorage.getItem(SESSION_KEY)) return
  try {
    const client = await getClient()
    const { data, error } = await client.auth.getSession()
    if (error) throw error
    await loadAccount(data.session)
  } catch { identity.error = 'No se pudo conectar. Tus cambios siguen guardados en este dispositivo.' }
}
async function loadAccount(session) {
  const id = session?.user?.id || null
  if (identity.user?.id === id && identity.bucket === (id || 'guest')) return
  const generation = ++accountGeneration
  clearTimeout(syncTimer)
  const guest = read('guest')
  identity.user = id ? { id, email: session.user.email } : null
  identity.bucket = id || 'guest'
  Object.assign(identity, read(identity.bucket))
  identity.error = ''
  identity.status = id ? 'Conectando tu cuenta…' : 'Guardado en este dispositivo'
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
    }
    persist()
    await syncAccount()
  } catch { if (generation === accountGeneration) identity.error = 'No se pudo sincronizar. Conservamos tu perfil en este dispositivo.' }
}
export async function syncAccount() {
  if (!identity.user) return
  const id = identity.user.id
  const payload = { user_id: id, profile: cleanProfile(identity.profile), history: cleanHistory(identity.history), updated_at: new Date().toISOString() }
  try {
    const client = await getClient()
    const { error } = await client.from('yutu_user_state').upsert(payload)
    if (error) throw error
    if (identity.user?.id !== id) return
    identity.status = 'Sincronizado con tu cuenta'
    identity.error = ''
  } catch {
    if (identity.user?.id === id) identity.error = 'Sin conexión con la cuenta. Tus cambios están guardados aquí; puedes reintentar.'
  }
}
function scheduleSync() {
  clearTimeout(syncTimer)
  if (identity.user) syncTimer = setTimeout(syncAccount, 1500)
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
    const { data, error } = create
      ? await client.auth.signUp({ email, password })
      : await client.auth.signInWithPassword({ email, password })
    if (error) throw error
    if (data.session) await loadAccount(data.session)
    else identity.status = 'Revisa tu correo para confirmar la cuenta. Puedes seguir usando Yutu sin iniciar sesión.'
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
