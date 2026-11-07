import * as api from './api.js';
import * as store from './store.js';
import { icon } from './icons.js';

const $ = s => document.querySelector(s);
const main = $('#main'), sidebar = $('#sidebar'), bottomnav = $('#bottomnav');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------- Formato ----------
const fmtNum = n => {
  if (n == null || isNaN(n)) return '';
  n = Number(n);
  if (n >= 1e9) return (n / 1e9).toFixed(1).replace('.0', '') + ' mil M';
  if (n >= 1e6) return (n / 1e6).toFixed(1).replace('.0', '') + ' M';
  if (n >= 1e3) return (n / 1e3).toFixed(n >= 1e4 ? 0 : 1).replace('.0', '') + ' mil';
  return String(n);
};
const fmtLen = s => {
  s = Number(s) || 0; const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60;
  return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(x).padStart(2, '0');
};
const meta = v => [v.views != null ? fmtNum(v.views) + ' vistas' : '', v.published].filter(Boolean).join(' • ');
const initial = n => esc((n || '?').trim().charAt(0).toUpperCase());
const toast = (() => { let t; return m => { const el = $('#toast'); el.textContent = m; el.classList.add('show'); clearTimeout(t); t = setTimeout(() => el.classList.remove('show'), 2400); }; })();

// ---------- Tema ----------
function applyTheme() {
  const pref = store.get('theme');
  const dark = pref === 'dark' || (pref === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  $('#themeColor').content = dark ? '#0f0f0f' : '#ffffff';
}
$('#themeBtn').onclick = () => {
  const dark = document.documentElement.dataset.theme === 'dark';
  store.set('theme', dark ? 'light' : 'dark'); applyTheme();
};
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', applyTheme);
applyTheme();

// ---------- Navegación (sidebar + barra inferior) ----------
const NAV = [
  ['#/', 'home', 'Inicio'], ['#/explorar', 'explore', 'Explorar'],
  ['#/suscripciones', 'subs', 'Suscripciones'], ['#/biblioteca', 'library', 'Tú'],
];
const NAV_MORE = [
  ['#/historial', 'history', 'Historial'], ['#/despues', 'later', 'Ver más tarde'],
];
const EXPLORE = [
  ['#/buscar/musica', 'music', 'Música'], ['#/buscar/videojuegos', 'game', 'Videojuegos'],
  ['#/buscar/noticias', 'news', 'Noticias'], ['#/buscar/peliculas', 'film', 'Películas'],
];
const link = ([h, i, l], cur) => `<a class="nav-item ${cur === h ? 'active' : ''}" href="${h}">${icon(i)}<span>${l}</span></a>`;

function renderNav(route) {
  const cur = '#/' + (route[0] || '');
  const subs = Object.entries(store.get('subs'));
  sidebar.innerHTML = `
    <div class="nav-group">${NAV.slice(0, 3).map(n => link(n, cur)).join('')}</div>
    <div class="nav-group"><h3>Tú</h3>${[['#/biblioteca', 'library', 'Biblioteca'], ...NAV_MORE].map(n => link(n, cur)).join('')}</div>
    ${subs.length ? `<div class="nav-group"><h3>Suscripciones</h3>${subs.map(([id, n]) => `<a class="nav-item" href="#/canal/${esc(id)}"><span class="mini-av">${initial(n)}</span><span>${esc(n)}</span></a>`).join('')}</div>` : ''}
    <div class="nav-group"><h3>Explorar</h3>${EXPLORE.map(n => link(n, '')).join('')}</div>
    <div class="nav-group">${link(['#/ajustes', 'settings', 'Ajustes'], cur)}</div>
    <p class="nav-foot">Yutu Premium v${APP_VERSION}<br>Sin anuncios · Sin rastreo</p>`;
  bottomnav.innerHTML = NAV.map(([h, i, l]) => `<a class="bn-item ${cur === h ? 'active' : ''}" href="${h}">${icon(i)}<span>${l}</span></a>`).join('');
}
const isMobileNav = () => matchMedia('(max-width: 1023px)').matches;
$('#menuBtn').onclick = () => {
  if (isMobileNav()) document.body.classList.toggle('drawer-open');
  else document.body.classList.toggle('mini');
};
$('#scrim').onclick = () => document.body.classList.remove('drawer-open');

// ---------- Búsqueda ----------
const qIn = $('#q'), sug = $('#suggest');
let sugT;
const goSearch = q => { q = q.trim(); if (!q) return; store.addSearch(q); sug.innerHTML = ''; qIn.blur(); document.body.classList.remove('search-open'); location.hash = '#/buscar/' + encodeURIComponent(q); };
$('#searchForm').onsubmit = e => { e.preventDefault(); goSearch(qIn.value); };
$('#searchOpen').onclick = () => { document.body.classList.add('search-open'); qIn.focus(); showSuggest(); };
$('#searchBack').onclick = () => { document.body.classList.remove('search-open'); sug.innerHTML = ''; };
$('#qClear').onclick = () => { qIn.value = ''; qIn.focus(); showSuggest(); };
qIn.addEventListener('input', () => { clearTimeout(sugT); sugT = setTimeout(showSuggest, 180); });
qIn.addEventListener('focus', showSuggest);
document.addEventListener('click', e => { if (!e.target.closest('.search-box')) sug.innerHTML = ''; });

async function showSuggest() {
  const q = qIn.value.trim();
  $('#qClear').hidden = !q;
  let items = q ? await api.suggestions(q) : store.get('searches');
  if (q && qIn.value.trim() !== q) return;
  sug.innerHTML = items.slice(0, 8).map(s => `<li role="option" data-q="${esc(s)}">${icon(q ? 'explore' : 'history', 'sm')}<span>${esc(s)}</span></li>`).join('');
}
sug.addEventListener('pointerdown', e => { const li = e.target.closest('li'); if (li) { e.preventDefault(); qIn.value = li.dataset.q; goSearch(li.dataset.q); } });

// ---------- Componentes ----------
const skeletons = (n = 12) => `<div class="grid">${'<div class="card sk"><div class="thumb"></div><div class="info"><div class="av"></div><div class="lines"><i></i><i></i></div></div></div>'.repeat(n)}</div>`;
const empty = (ic, t, d) => `<div class="empty">${icon(ic, 'xl')}<h2>${t}</h2><p>${d}</p></div>`;
const demoBanner = () => api.state.demo ? `<div class="banner">${icon('offline', 'sm')}<span>Modo demostración: no hay conexión con ninguna instancia. <a href="#/ajustes">Cambiar instancia</a></span></div>` : '';

function card(v, { compact = false, remove = '' } = {}) {
  return `<article class="card ${compact ? 'compact' : ''}">
    <a class="thumb" href="#/ver/${esc(v.id)}" aria-label="${esc(v.title)}">
      <img src="${api.thumb(v.id, compact ? 'mqdefault' : 'hqdefault')}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">
      ${v.live ? '<span class="dur live">EN VIVO</span>' : v.length ? `<span class="dur">${fmtLen(v.length)}</span>` : ''}
    </a>
    <div class="info">
      ${compact ? '' : `<a class="av" href="${v.authorId ? '#/canal/' + esc(v.authorId) : '#/'}" tabindex="-1" aria-hidden="true">${initial(v.author)}</a>`}
      <div class="lines">
        <a class="title" href="#/ver/${esc(v.id)}">${esc(v.title)}</a>
        <a class="chan" href="${v.authorId ? '#/canal/' + esc(v.authorId) : '#/'}">${esc(v.author)}</a>
        <span class="sub">${esc(meta(v))}</span>
      </div>
      ${remove ? `<button class="icon-btn small" data-remove="${remove}:${esc(v.id)}" aria-label="Quitar">${icon('trash', 'sm')}</button>` : ''}
    </div></article>`;
}
const grid = (list, opts) => `<div class="grid">${list.map(v => card(v, opts)).join('')}</div>`;

const CHIPS = [['Todo', ''], ['Música', 'musica'], ['Videojuegos', 'videojuegos'], ['Noticias', 'noticias'], ['Películas', 'peliculas'], ['Cocina', 'cocina'], ['Tecnología', 'tecnologia'], ['Deportes', 'deportes'], ['Mixes', 'mix'], ['Animación', 'animacion'], ['Podcasts', 'podcast'], ['En vivo', 'en vivo']];
const chips = active => `<div class="chips" role="tablist">${CHIPS.map(([l, q]) => `<a class="chip ${active === q ? 'active' : ''}" href="${q ? '#/buscar/' + q : '#/'}">${l}</a>`).join('')}</div>`;

// ---------- Vistas ----------
async function viewHome() {
  main.innerHTML = chips('') + skeletons();
  const list = await api.trending();
  main.innerHTML = chips('') + demoBanner() + grid(list);
}
async function viewExplore() {
  main.innerHTML = `<h1 class="page-title">${icon('fire')} Tendencias</h1>` + skeletons(8);
  const tabs = [['', 'Ahora'], ['music', 'Música'], ['gaming', 'Videojuegos'], ['movies', 'Películas']];
  const type = new URLSearchParams(location.hash.split('?')[1] || '').get('t') || '';
  const list = await api.trending(type);
  main.innerHTML = `<h1 class="page-title">${icon('fire')} Tendencias</h1>
    <div class="chips">${tabs.map(([t, l]) => `<a class="chip ${type === t ? 'active' : ''}" href="#/explorar${t ? '?t=' + t : ''}">${l}</a>`).join('')}</div>` + demoBanner() + grid(list);
}
async function viewSearch(q) {
  q = decodeURIComponent(q); qIn.value = q;
  main.innerHTML = chips(q) + skeletons(8);
  let r;
  try { r = await api.search(q); }
  catch { r = null; }
  if (!r) { r = api.demoSearch(q); api.state.demo = true; }
  main.innerHTML = chips(q) + demoBanner() + (r.channels.length ? r.channels.slice(0, 2).map(c => `
    <a class="chan-row" href="#/canal/${esc(c.id)}"><span class="big-av">${c.thumb ? `<img src="${esc(c.thumb.startsWith('//') ? 'https:' + c.thumb : c.thumb)}" alt="">` : initial(c.name)}</span>
    <div><b>${esc(c.name)}</b><br><small>${c.subs != null ? fmtNum(c.subs) + ' suscriptores' : ''}</small></div></a>`).join('') : '')
    + (r.videos.length ? `<div class="list">${r.videos.map(v => card(v, { compact: true })).join('')}</div>` : empty('explore', 'Sin resultados', 'Prueba con otras palabras.'));
}
async function viewChannel(id) {
  main.innerHTML = skeletons(6);
  try {
    const c = await api.channel(id);
    const on = store.isSub(id);
    main.innerHTML = `<section class="chan-head">
      <span class="big-av xl">${c.thumb ? `<img src="${esc(c.thumb.startsWith('//') ? 'https:' + c.thumb : c.thumb)}" alt="">` : initial(c.name)}</span>
      <div><h1>${esc(c.name)}</h1><p class="sub">${c.subs != null ? fmtNum(c.subs) + ' suscriptores' : ''}</p>
      <p class="desc-short">${esc((c.desc || '').slice(0, 140))}</p>
      <button class="btn ${on ? 'ghost' : 'primary'}" id="subBtn">${on ? 'Suscrito' : 'Suscribirse'}</button></div></section>` + grid(c.videos);
    $('#subBtn').onclick = e => { const s = store.toggleSub(id, c.name); e.target.textContent = s ? 'Suscrito' : 'Suscribirse'; e.target.className = 'btn ' + (s ? 'ghost' : 'primary'); toast(s ? 'Te suscribiste' : 'Suscripción cancelada'); renderNav(currentRoute); };
  } catch { main.innerHTML = empty('offline', 'No se pudo cargar el canal', 'Revisa tu conexión o cambia de instancia en Ajustes.'); }
}
async function viewWatch(id) {
  main.innerHTML = `<div class="watch"><div class="w-main"><div class="player sk"></div></div></div>`;
  let v;
  try { v = await api.video(id); } catch { v = api.demoVideo(id); api.state.demo = true; }
  store.addHistory(v);
  document.title = v.title + ' · Yutu Premium';
  const sub = store.isSub(v.authorId), liked = store.isLiked(id), later = store.inLater(id);
  main.innerHTML = `<div class="watch">
    <div class="w-main">
      <div class="player"><iframe src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?autoplay=1&rel=0&playsinline=1&modestbranding=1"
        title="${esc(v.title)}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></div>
      ${demoBanner()}
      <h1 class="w-title">${esc(v.title)}</h1>
      <div class="w-bar">
        <div class="w-chan">
          <a class="big-av" href="${v.authorId ? '#/canal/' + esc(v.authorId) : '#/'}">${v.authorThumb ? `<img src="${esc(v.authorThumb.startsWith('//') ? 'https:' + v.authorThumb : v.authorThumb)}" alt="">` : initial(v.author)}</a>
          <div><a class="chan-name" href="${v.authorId ? '#/canal/' + esc(v.authorId) : '#/'}">${esc(v.author)}</a><small>${esc(v.subs || '')}</small></div>
          ${v.authorId ? `<button class="btn ${sub ? 'ghost' : 'primary'}" id="subBtn">${sub ? 'Suscrito' : 'Suscribirse'}</button>` : ''}
        </div>
        <div class="actions">
          <button class="pill ${liked ? 'on' : ''}" id="likeBtn">${icon('like', 'sm')}<span>${v.likes != null ? fmtNum(v.likes + (liked ? 1 : 0)) : 'Me gusta'}</span></button>
          <button class="pill" id="shareBtn">${icon('share', 'sm')}<span>Compartir</span></button>
          <button class="pill ${later ? 'on' : ''}" id="laterBtn">${icon('later', 'sm')}<span>${later ? 'Guardado' : 'Guardar'}</span></button>
        </div>
      </div>
      <div class="desc" id="desc"><b>${esc(meta(v))}</b><p>${esc(v.description).replace(/\n/g, '<br>')}</p><button class="more" id="moreBtn">Mostrar más</button></div>
      <section class="comments" id="comments"><h2>Comentarios</h2><p class="muted">Cargando…</p></section>
    </div>
    <aside class="w-side">${v.related.length ? v.related.map(r => card(r, { compact: true })).join('') : ''}</aside></div>`;
  $('#subBtn')?.addEventListener('click', e => { const s = store.toggleSub(v.authorId, v.author); e.currentTarget.textContent = s ? 'Suscrito' : 'Suscribirse'; e.currentTarget.className = 'btn ' + (s ? 'ghost' : 'primary'); toast(s ? 'Te suscribiste a ' + v.author : 'Suscripción cancelada'); renderNav(currentRoute); });
  $('#likeBtn').onclick = e => { const l = store.toggleLike(id); e.currentTarget.classList.toggle('on', l); navigator.vibrate?.(8); if (v.likes != null) e.currentTarget.querySelector('span').textContent = fmtNum(v.likes + (l ? 1 : 0)); };
  $('#laterBtn').onclick = e => { const l = store.toggleLater(v); e.currentTarget.classList.toggle('on', l); e.currentTarget.querySelector('span').textContent = l ? 'Guardado' : 'Guardar'; toast(l ? 'Guardado en Ver más tarde' : 'Quitado de Ver más tarde'); };
  $('#shareBtn').onclick = async () => {
    const url = 'https://youtu.be/' + id;
    try { if (navigator.share) await navigator.share({ title: v.title, url }); else { await navigator.clipboard.writeText(url); toast('Enlace copiado'); } } catch { /* cancelado */ }
  };
  $('#moreBtn').onclick = e => { const d = $('#desc'); d.classList.toggle('open'); e.currentTarget.textContent = d.classList.contains('open') ? 'Mostrar menos' : 'Mostrar más'; };
  api.comments(id).then(cs => {
    const el = $('#comments'); if (!el) return;
    el.innerHTML = '<h2>Comentarios</h2>' + (cs === null ? '<p class="muted">No se pudieron cargar los comentarios.</p>' : cs.length ? cs.map(c => `
      <div class="cm"><span class="mini-av">${c.thumb ? `<img src="${esc(c.thumb)}" alt="">` : initial(c.author)}</span>
      <div><b>${esc(c.author)}</b> <small>${esc(c.when || '')}</small><p>${esc(c.text)}</p>${c.likes ? `<small>${icon('like', 'xs')} ${fmtNum(c.likes)}</small>` : ''}</div></div>`).join('') : '<p class="muted">Sin comentarios.</p>');
  });
}
function viewList(key, title, ic, emptyMsg) {
  const list = store.get(key);
  main.innerHTML = `<div class="list-head"><h1 class="page-title">${icon(ic)} ${title}</h1>${list.length ? `<button class="btn ghost" id="clearList">Borrar todo</button>` : ''}</div>`
    + (list.length ? grid(list, { remove: key }) : empty(ic, 'Aquí no hay nada todavía', emptyMsg));
  $('#clearList')?.addEventListener('click', () => { if (confirm('¿Borrar toda la lista?')) { store.set(key, []); viewList(key, title, ic, emptyMsg); } });
}
async function viewSubs() {
  const subs = Object.entries(store.get('subs'));
  if (!subs.length) { main.innerHTML = empty('subs', 'Aún no tienes suscripciones', 'Suscríbete a canales y aparecerán aquí. Se guardan solo en este dispositivo.'); return; }
  main.innerHTML = `<div class="chips">${subs.map(([id, n]) => `<a class="chip" href="#/canal/${esc(id)}">${esc(n)}</a>`).join('')}</div>${skeletons(6)}`;
  const res = await Promise.allSettled(subs.slice(0, 12).map(([id]) => api.channel(id)));
  const vids = res.filter(r => r.status === 'fulfilled').flatMap(r => r.value.videos.slice(0, 6));
  main.innerHTML = `<div class="chips">${subs.map(([id, n]) => `<a class="chip" href="#/canal/${esc(id)}">${esc(n)}</a>`).join('')}</div>`
    + (vids.length ? grid(vids) : empty('offline', 'No se pudieron cargar los videos', 'Revisa tu conexión.'));
}
function viewLibrary() {
  const h = store.get('history'), l = store.get('later');
  const row = (t, list, href) => `<section class="shelf"><div class="shelf-h"><h2>${t}</h2><a href="${href}">Ver todo</a></div>${list.length ? `<div class="shelf-row">${list.slice(0, 10).map(v => card(v, { compact: false })).join('')}</div>` : '<p class="muted">Vacío</p>'}</section>`;
  main.innerHTML = `<h1 class="page-title">${icon('library')} Tú</h1>${row('Historial', h, '#/historial')}${row('Ver más tarde', l, '#/despues')}`;
}
function viewSettings() {
  const inst = store.get('instance'), th = store.get('theme');
  main.innerHTML = `<div class="settings"><h1 class="page-title">${icon('settings')} Ajustes</h1>
    <section><h2>Apariencia</h2><div class="seg" id="themeSeg">${[['auto', 'Automático'], ['light', 'Claro'], ['dark', 'Oscuro']].map(([v, l]) => `<button class="${th === v ? 'on' : ''}" data-v="${v}">${l}</button>`).join('')}</div></section>
    <section><h2>Instancia de datos</h2><p class="muted">Yutu Premium obtiene los videos de instancias públicas de Invidious, sin cuenta ni rastreo. ${api.state.instance ? 'Conectado a <b>' + esc(api.state.instance) + '</b>.' : ''}</p>
      <input id="instIn" type="url" placeholder="https://tu-instancia.ejemplo" value="${esc(inst)}" aria-label="Instancia propia">
      <button class="btn primary" id="instSave">Guardar</button></section>
    <section><h2>Tus datos</h2><p class="muted">Suscripciones, historial y guardados viven solo en este dispositivo.</p>
      <button class="btn ghost danger" id="wipe">Borrar todos mis datos</button></section>
    <section><h2>Instalar</h2><p class="muted">iPhone: Safari → Compartir → Añadir a pantalla de inicio.<br>Android/PC: menú del navegador → Instalar app.</p></section>
    <p class="muted">Versión ${APP_VERSION}</p></div>`;
  $('#themeSeg').onclick = e => { const b = e.target.closest('button'); if (!b) return; store.set('theme', b.dataset.v); applyTheme(); viewSettings(); };
  $('#instSave').onclick = () => { store.set('instance', $('#instIn').value.trim()); toast('Instancia guardada'); };
  $('#wipe').onclick = () => { if (confirm('¿Borrar suscripciones, historial y guardados?')) { store.clearAll(); applyTheme(); renderNav(currentRoute); toast('Datos borrados'); viewSettings(); } };
}

main.addEventListener('click', e => {
  const b = e.target.closest('[data-remove]'); if (!b) return;
  const [key, id] = b.dataset.remove.split(':');
  store.set(key, store.get(key).filter(v => v.id !== id));
  const t = { history: ['Historial', 'history', 'Los videos que veas aparecerán aquí.'], later: ['Ver más tarde', 'later', 'Guarda videos con el botón Guardar.'] }[key];
  viewList(key, ...t);
});

// ---------- Router ----------
let currentRoute = [];
async function route() {
  document.body.classList.remove('drawer-open', 'search-open');
  const raw = location.hash.replace(/^#\/?/, '').split('?')[0];
  const r = raw.split('/').filter(Boolean); currentRoute = r;
  document.title = 'Yutu Premium';
  document.body.classList.toggle('on-watch', r[0] === 'ver');
  renderNav(r); scrollTo(0, 0);
  try {
    switch (r[0]) {
      case undefined: return await viewHome();
      case 'explorar': return await viewExplore();
      case 'buscar': return await viewSearch(r[1] || '');
      case 'canal': return await viewChannel(r[1]);
      case 'ver': return await viewWatch(r[1]);
      case 'suscripciones': return await viewSubs();
      case 'historial': return viewList('history', 'Historial', 'history', 'Los videos que veas aparecerán aquí.');
      case 'despues': return viewList('later', 'Ver más tarde', 'later', 'Guarda videos con el botón Guardar.');
      case 'biblioteca': return viewLibrary();
      case 'ajustes': return viewSettings();
      default: main.innerHTML = empty('explore', 'Página no encontrada', '<a href="#/">Volver al inicio</a>');
    }
  } catch (e) { console.error(e); main.innerHTML = empty('offline', 'Algo salió mal', 'Revisa tu conexión e inténtalo de nuevo.'); }
}
addEventListener('hashchange', route);
api.refreshInstances();
route();

// ---------- Auto-actualización ----------
if ('serviceWorker' in navigator) {
  let reloading = false;
  const checkVersion = async reg => {
    try {
      reg?.update();
      const j = await (await fetch('version.json?t=' + Date.now(), { cache: 'no-store' })).json();
      if (j.version && j.version !== APP_VERSION) { toast('Actualizando…'); reg?.waiting?.postMessage('SKIP_WAITING'); setTimeout(() => { if (!reloading) { reloading = true; location.reload(); } }, 900); }
    } catch { /* sin red */ }
  };
  navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(reg => {
    checkVersion(reg);
    document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && checkVersion(reg));
    setInterval(() => checkVersion(reg), 45 * 60 * 1000);
  }).catch(() => {});
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (reloading || !sessionStorage.getItem('sw-ready')) { sessionStorage.setItem('sw-ready', '1'); return; } reloading = true; toast('Actualizando…'); setTimeout(() => location.reload(), 600); });
}
