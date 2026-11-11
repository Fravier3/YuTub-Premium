<!-- eslint-disable @intlify/vue-i18n/no-raw-text -->
<template>
  <div>
    <nav
      class="browseChips"
      :aria-label="$t('Search Filters.Search Filters')"
    >
      <button
        class="selected"
        @click="refreshHome"
      >
        {{ $t('Mobile Browse.All') }}
      </button>
      <RouterLink to="/search/m%C3%BAsica%20latina">{{ $t('Latin Music') }}</RouterLink>
      <RouterLink to="/search/podcasts%20en%20espa%C3%B1ol">{{ $t('Mobile Browse.Podcasts') }}</RouterLink>
      <RouterLink to="/search/videojuegos">{{ $t('Trending.Gaming') }}</RouterLink>
      <button
        :disabled="isLoading && !isBackgroundLoad"
        :aria-label="$t('Most Popular')"
        @click="refreshHome"
      >
        <FontAwesomeIcon :icon="['fas', 'rotate-right']" />
      </button>
    </nav>
    <ft-loader
      v-if="isLoading && shownResults.length === 0"
      :fullscreen="true"
    />
    <ft-card
      v-else
      class="card"
    >
      <p
        v-if="feedError"
        role="status"
        class="feedDescription"
      >
        {{ personalizedHome ? 'No pudimos actualizar todas las recomendaciones. Intenta refrescar en un momento.' : $t('Latin Music Error') }}
      </p>
      <section
        v-for="section in homeSections"
        :key="section.key"
        class="homeSection"
      >
        <h2>{{ section.title }}</h2>
        <ft-element-list :data="section.items" />
      </section>
      <ft-element-list
        v-if="!personalizedHome"
        :data="shownResults"
      />
    </ft-card>
    <ft-refresh-widget
      class="feedRefresh"
      :disable-refresh="isLoading && !isBackgroundLoad"
      :title="$t('Most Popular')"
      @click="refreshHome"
    />
  </div>
</template>

<script setup>
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome'
import { onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'

import FtLoader from '../../components/FtLoader/FtLoader.vue'
import FtCard from '../../components/ft-card/ft-card.vue'
import FtElementList from '../../components/FtElementList/FtElementList.vue'
import FtRefreshWidget from '../../components/FtRefreshWidget/FtRefreshWidget.vue'
import store from '../../store/index'

import { hasFreshSelection, homeSignal, loadHomeRecommendations, pickHomeSections } from '../../helpers/homeRecommendations'
import { identity, seedListening } from '../../helpers/yutuIdentity'
import { getInvidiousPopularFeed, searchHomeVideos, relatedHomeVideos } from '../../helpers/api/invidious'
import { copyToClipboard, showToast } from '../../helpers/utils'
import { useI18n } from 'vue-i18n'
import { LATIN_FEED_TTL } from '../../helpers/latinMusicFeed'
import { KeyboardShortcuts } from '../../../constants'

const { t } = useI18n()

const personalizedHome = !process.env.IS_ELECTRON && !process.env.YUTU_TV
const homeSections = shallowRef([])
const isLoading = ref(false)
// Una renovación silenciosa de la reserva no bloquea el botón de refrescar
const isBackgroundLoad = ref(false)
const feedError = ref(false)

// Do not reuse the previous global/US feed after updating the app.
const shownResults = shallowRef([])
let refreshTimer
let fetchedAt = 0
let refreshPending = false

/*
 * Portada personalizada: se guarda una reserva de candidatos por usuario, más grande de lo que cabe en
 * pantalla. Cada vez que se abre la portada se muestra una selección distinta (primero lo que no salió las
 * últimas veces) y, mientras tanto, la reserva se renueva en segundo plano.
 */
const POOL_MAX_AGE = 24 * 60 * 60 * 1000
const POOL_REFRESH_AFTER = 3 * 60 * 1000
const cacheKey = () => `yutu-home-v3:${identity.bucket}`
const shownKey = () => `yutu-home-shown-v1:${identity.bucket}`
const currentSignal = () => homeSignal(identity.searches, identity.history)
function readShown() {
  try {
    const stored = JSON.parse(localStorage.getItem(shownKey()) || '[]')
    return Array.isArray(stored) ? stored.filter(id => typeof id === 'string') : []
  } catch { return [] }
}
function showSelection(pools) {
  const previous = readShown()
  const sections = pickHomeSections(pools, new Set(previous))
  homeSections.value = sections
  shownResults.value = sections.flatMap(section => section.items)
  const ids = shownResults.value.map(video => video.videoId)
  try {
    localStorage.setItem(shownKey(), JSON.stringify([...new Set([...ids, ...previous])].slice(0, 300)))
  } catch { /* Sin almacenamiento solo se pierde la variedad entre aperturas. */ }
}
/** @returns {boolean} si la reserva guardada sigue siendo reciente y no hace falta pedir otra todavía */
function restoreHomeCache() {
  if (!personalizedHome) return false
  try {
    const cached = JSON.parse(localStorage.getItem(cacheKey()) || '{}')
    // Si el usuario buscó o vio algo nuevo, la reserva vieja ya no refleja sus gustos: se espera a la nueva
    // ...y si ya se mostró casi todo lo que tenía, tampoco sirve para enseñar algo distinto
    if (Date.now() - cached.at < POOL_MAX_AGE && Array.isArray(cached.pools) && cached.signal === currentSignal() &&
      hasFreshSelection(cached.pools, new Set(readShown()))) {
      showSelection(cached.pools)
      fetchedAt = cached.at
      return Date.now() - cached.at < POOL_REFRESH_AFTER
    }
  } catch { /* A damaged cache should not block fresh recommendations. */ }
  return false
}
watch(() => identity.bucket, () => {
  homeSections.value = []
  shownResults.value = []
  if (!restoreHomeCache()) fetchPopularInfo()
})

let hiddenAt = 0
function refreshIfStale(event) {
  if (document.visibilityState !== 'visible') {
    hiddenAt = Date.now()
    return
  }
  if (personalizedHome) {
    // Volver a la app tras un rato cuenta como "entrar otra vez": toca una selección distinta
    const cameBack = event?.type === 'visibilitychange' && hiddenAt && Date.now() - hiddenAt > 2 * 60_000
    if (cameBack) refreshHome()
    else if (Date.now() - fetchedAt >= LATIN_FEED_TTL) fetchPopularInfo({ background: shownResults.value.length > 0 })
    return
  }
  if (Date.now() - fetchedAt >= LATIN_FEED_TTL) {
    fetchPopularInfo()
  }
}

/** Botón de refrescar: con reserva guardada el cambio es inmediato y la reserva se renueva detrás. */
function refreshHome() {
  if (!personalizedHome) return fetchPopularInfo()
  try {
    const cached = JSON.parse(localStorage.getItem(cacheKey()) || '{}')
    if (Array.isArray(cached.pools) && cached.signal === currentSignal() && hasFreshSelection(cached.pools, new Set(readShown()))) {
      showSelection(cached.pools)
      window.scrollTo({ top: 0 })
      return fetchPopularInfo({ background: true })
    }
  } catch { /* Sin reserva válida se pide una nueva. */ }
  return fetchPopularInfo()
}

onMounted(() => {
  document.addEventListener('keydown', keyboardShortcutHandler)
  document.addEventListener('visibilitychange', refreshIfStale)
  refreshTimer = window.setInterval(refreshIfStale, 60_000)

  if (personalizedHome) {
    seedListening(store.getters.getHistoryCacheSorted)
    // Con una reserva reciente ya hay una selección nueva en pantalla; si no, se pide otra
    if (!restoreHomeCache()) fetchPopularInfo({ background: shownResults.value.length > 0 })
  } else if (shownResults.value.length === 0) {
    fetchPopularInfo()
  }
})

onBeforeUnmount(() => {
  document.removeEventListener('keydown', keyboardShortcutHandler)
  document.removeEventListener('visibilitychange', refreshIfStale)
  window.clearInterval(refreshTimer)
})

/**
 * @param {{ background?: boolean }} [options] en segundo plano solo se renueva la reserva: lo que el usuario
 *   ya está viendo no cambia bajo sus dedos
 */
async function fetchPopularInfo({ background = false } = {}) {
  if (isLoading.value) {
    // Un refresco manual durante una carga en segundo plano se atiende al terminar esta
    if (!background) refreshPending = true
    return
  }
  isLoading.value = true
  isBackgroundLoad.value = background
  feedError.value = false

  const bucket = identity.bucket
  try {
    if (personalizedHome) {
      const signal = currentSignal()
      const result = await loadHomeRecommendations({ history: identity.history, searches: identity.searches, search: searchHomeVideos, related: relatedHomeVideos })
      if (bucket !== identity.bucket) return
      fetchedAt = Date.now()
      try { localStorage.setItem(cacheKey(), JSON.stringify({ at: fetchedAt, signal, pools: result.pools })) } catch { /* Storage may be full. */ }
      if (!background || shownResults.value.length === 0) {
        showSelection(result.pools)
        feedError.value = result.partial
      }
      return
    }
    const items = await getInvidiousPopularFeed(shownResults.value.slice(0, 12).map(item => item.videoId))
    fetchedAt = Date.now()

    store.commit('setLastPopularRefreshTimestamp', new Date())
    shownResults.value = items
    isLoading.value = false
    store.commit('setPopularCache', items)
  } catch (err) {
    if (bucket !== identity.bucket) return
    if (personalizedHome && shownResults.value.length === 0) {
      // Sin conexión con el servidor: mejor la última reserva guardada que una portada vacía
      try {
        const cached = JSON.parse(localStorage.getItem(cacheKey()) || '{}')
        if (Array.isArray(cached.pools)) showSelection(cached.pools)
      } catch { /* Sin reserva: se muestra el aviso de error. */ }
    }
    if (background && shownResults.value.length > 0) {
      // Falló solo la renovación silenciosa: lo que está en pantalla sigue siendo válido
      fetchedAt = Date.now() - LATIN_FEED_TTL + 5 * 60_000
      return
    }
    feedError.value = true
    // Back off on failures while preserving the last successful list.
    fetchedAt = Date.now() - LATIN_FEED_TTL + 5 * 60_000
    isLoading.value = false
    const errorMessage = t('Invidious API Error (Click to copy)')
    showToast(`${errorMessage}: ${err}`, 10000, () => {
      copyToClipboard(err)
    })
  } finally {
    isLoading.value = false
    if (bucket !== identity.bucket || refreshPending) {
      refreshPending = false
      fetchPopularInfo()
    }
  }
}

/**
 * @param {KeyboardEvent} event the keyboard event
 */
function keyboardShortcutHandler(event) {
  if (document.activeElement.classList.contains('ft-input')) {
    return
  }
  // Avoid handling events due to user holding a key (not released)
  // https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/repeat
  if (event.repeat) { return }

  switch (event.key.toLowerCase()) {
    case 'f5':
    case KeyboardShortcuts.APP.SITUATIONAL.REFRESH:
      if (!isLoading.value || isBackgroundLoad.value) {
        refreshHome()
      }
      break
  }
}

</script>
<style scoped src="./Popular.css" />
