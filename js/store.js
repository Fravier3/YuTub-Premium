// Datos locales (nunca se borran en una actualización). Esquema versionado.
const KEY = 'yutu.v1';
const SCHEMA = 1;
const DEFAULTS = { schema: SCHEMA, theme: 'auto', instance: '', subs: {}, history: [], later: [], liked: {}, searches: [] };

let data;
try { data = { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { data = { ...DEFAULTS }; }

const save = () => { try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* almacenamiento lleno o bloqueado */ } };
export const get = k => data[k];
export const set = (k, v) => { data[k] = v; save(); };

const slim = v => ({ id: v.id, title: v.title, author: v.author, authorId: v.authorId, views: v.views, published: v.published, length: v.length, live: v.live });

export function addHistory(v) {
  data.history = [slim(v), ...data.history.filter(x => x.id !== v.id)].slice(0, 200); save();
}
export function toggleLater(v) {
  const has = data.later.some(x => x.id === v.id);
  data.later = has ? data.later.filter(x => x.id !== v.id) : [slim(v), ...data.later]; save(); return !has;
}
export const inLater = id => data.later.some(x => x.id === id);
export function toggleSub(id, name) {
  if (data.subs[id]) delete data.subs[id]; else data.subs[id] = name; save(); return !!data.subs[id];
}
export const isSub = id => !!data.subs[id];
export function toggleLike(id) { if (data.liked[id]) delete data.liked[id]; else data.liked[id] = 1; save(); return !!data.liked[id]; }
export const isLiked = id => !!data.liked[id];
export function addSearch(q) { data.searches = [q, ...data.searches.filter(x => x !== q)].slice(0, 12); save(); }
export function clearAll() { data = { ...DEFAULTS }; save(); }
