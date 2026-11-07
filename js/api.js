// Cliente de datos: instancias públicas de Invidious (igual que FreeTube sin cuenta ni rastreo).
// Si ninguna responde, se muestra contenido de demostración para que la app nunca quede en blanco.
import * as store from './store.js';

const DEFAULT_INSTANCES = [
  'https://inv.nadeko.net', 'https://yewtu.be', 'https://invidious.nerdvpn.de',
  'https://invidious.privacyredirect.com', 'https://iv.melmac.space', 'https://invidious.materialio.us',
];
const TIMEOUT = 8000;
let instances = [...DEFAULT_INSTANCES];
let current = 0;
export const state = { demo: false, instance: '' };

export const thumb = (id, q = 'mqdefault') => `https://i.ytimg.com/vi/${encodeURIComponent(id)}/${q}.jpg`;

function candidates() {
  const own = (store.get('instance') || '').trim().replace(/\/+$/, '');
  return own ? [own, ...instances.filter(i => i !== own)] : instances;
}

async function request(path) {
  const list = candidates();
  let lastErr;
  for (let n = 0; n < Math.min(list.length, 4); n++) {
    const base = list[(current + n) % list.length];
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), TIMEOUT);
    try {
      const r = await fetch(base + path, { signal: ctl.signal });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const j = await r.json();
      current = (current + n) % list.length; state.instance = base; state.demo = false;
      return j;
    } catch (e) { lastErr = e; } finally { clearTimeout(t); }
  }
  current = (current + 1) % list.length;
  throw lastErr || new Error('Sin conexión');
}

const norm = v => ({
  id: v.videoId, title: v.title || 'Sin título', author: v.author || '', authorId: v.authorId || '',
  views: v.viewCount ?? v.views ?? null, published: v.publishedText || '', length: v.lengthSeconds || 0,
  live: !!v.liveNow, type: v.type || 'video',
});
const onlyVideos = a => (a || []).filter(x => (x.type || 'video') === 'video' && x.videoId).map(norm);

export async function trending(type = '') {
  try { return onlyVideos(await request(`/api/v1/trending?region=US${type ? '&type=' + type : ''}`)); }
  catch { return demo(); }
}
export async function search(q, page = 1) {
  const j = await request(`/api/v1/search?q=${encodeURIComponent(q)}&page=${page}&type=all`);
  return {
    videos: onlyVideos(j),
    channels: j.filter(x => x.type === 'channel').map(c => ({ id: c.authorId, name: c.author, subs: c.subCount, thumb: c.authorThumbnails?.at(-1)?.url })),
  };
}
export async function suggestions(q) {
  try { return (await request(`/api/v1/search/suggestions?q=${encodeURIComponent(q)}`)).suggestions || []; } catch { return []; }
}
export async function video(id) {
  const j = await request(`/api/v1/videos/${encodeURIComponent(id)}`);
  return { ...norm(j), views: j.viewCount, likes: j.likeCount, description: j.description || '', subs: j.subCountText || '',
    authorThumb: j.authorThumbnails?.[1]?.url || j.authorThumbnails?.[0]?.url, related: onlyVideos(j.recommendedVideos), date: j.publishedText };
}
export async function comments(id) {
  try {
    const j = await request(`/api/v1/comments/${encodeURIComponent(id)}`);
    return (j.comments || []).slice(0, 30).map(c => ({ author: c.author, text: c.content, likes: c.likeCount, when: c.publishedText, thumb: c.authorThumbnails?.[0]?.url }));
  } catch { return null; }
}
export async function channel(id) {
  const [info, vids] = await Promise.all([request(`/api/v1/channels/${encodeURIComponent(id)}`), request(`/api/v1/channels/${encodeURIComponent(id)}/videos`)]);
  return { id, name: info.author, subs: info.subCount, desc: info.description, thumb: info.authorThumbnails?.at(-1)?.url,
    banner: info.authorBanners?.[0]?.url, videos: onlyVideos(vids.videos || vids) };
}

// Mejor esfuerzo: refresca la lista de instancias con CORS habilitado
export async function refreshInstances() {
  try {
    const r = await fetch('https://api.invidious.io/instances.json?sort_by=type,health', { signal: AbortSignal.timeout(6000) });
    const j = await r.json();
    const list = j.filter(([, i]) => i.api && i.cors && i.type === 'https').map(([, i]) => i.uri.replace(/\/+$/, ''));
    if (list.length) instances = [...new Set([...list.slice(0, 8), ...DEFAULT_INSTANCES])];
  } catch { /* se usan las instancias por defecto */ }
}

// ---- Contenido de demostración (películas abiertas de Blender y videos libres) ----
const D = (id, title, author, views, published, length) => ({ id, title, author, authorId: '', views, published, length, live: false, type: 'video' });
const DEMO = [
  D('aqz-KE-bpKQ', 'Big Buck Bunny 60fps 4K - Official Blender Foundation Short Film', 'Blender', 25000000, 'hace 7 años', 635),
  D('eRsGyueVLvQ', 'Sintel - Third Open Movie by Blender Foundation', 'Blender', 11000000, 'hace 12 años', 888),
  D('R6MlUcmOul8', 'Tears of Steel - Blender VFX Open Movie', 'Blender', 3200000, 'hace 9 años', 734),
  D('TLkA0RELQ1g', 'Elephants Dream - Blender Foundation', 'Blender', 1900000, 'hace 14 años', 654),
  D('mN0zPOpADL4', 'Spring - Blender Open Movie', 'Blender', 6100000, 'hace 7 años', 464),
  D('Y-rmzh0PI3c', 'Agent 327: Operation Barbershop', 'Blender', 2400000, 'hace 8 años', 231),
  D('WhWc3b3KhnY', 'Caminandes 3: Llamigos', 'Blender', 5100000, 'hace 9 años', 150),
  D('SkVqJ1SGeL0', 'Cosmos Laundromat - First Cycle', 'Blender', 8500000, 'hace 10 años', 730),
  D('Z4C82eyhwgU', 'Coffee Run - Blender Open Movie', 'Blender', 1200000, 'hace 5 años', 210),
  D('8H98BgRzpOM', 'Charge - Blender Open Movie', 'Blender', 900000, 'hace 4 años', 218),
  D('aVNnmtHXMLo', 'Sprite Fright - Blender Open Movie', 'Blender', 2000000, 'hace 4 años', 628),
  D('Qwg8Z2dLHLY', 'Wing It! - Blender Open Movie', 'Blender', 3000000, 'hace 3 años', 270),
];
function demo() { state.demo = true; return DEMO.map(v => ({ ...v })); }
export function demoSearch(q) {
  const k = q.toLowerCase();
  const r = DEMO.filter(v => v.title.toLowerCase().includes(k));
  return { videos: (r.length ? r : DEMO).map(v => ({ ...v })), channels: [] };
}
export function demoVideo(id) {
  const v = DEMO.find(x => x.id === id) || D(id, 'Video', '', null, '', 0);
  return { ...v, likes: null, description: 'Modo demostración: no se pudo conectar con ninguna instancia. Revisa tu conexión o cambia la instancia en Ajustes.',
    subs: '', related: DEMO.filter(x => x.id !== id), date: v.published };
}
