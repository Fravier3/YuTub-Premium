<!-- eslint-disable @intlify/vue-i18n/no-raw-text -->
<template>
  <div>
    <nav
      class="browseChips"
      :aria-label="$t('Search Filters.Search Filters')"
    >
      <button
        class="selected"
        @click="fetchPopularInfo"
      >
        {{ $t('Mobile Browse.All') }}
      </button>
      <RouterLink to="/search/m%C3%BAsica%20latina">{{ $t('Latin Music') }}</RouterLink>
      <RouterLink to="/search/podcasts%20en%20espa%C3%B1ol">{{ $t('Mobile Browse.Podcasts') }}</RouterLink>
      <RouterLink to="/search/videojuegos">{{ $t('Trending.Gaming') }}</RouterLink>
      <button
        :disabled="isLoading"
        :aria-label="$t('Most Popular')"
        @click="fetchPopularInfo"
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
      :disable-refresh="isLoading"
      :title="$t('Most Popular')"
      @click="fetchPopularInfo"
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

import { loadHomeRecommendations } from '../../helpers/homeRecommendations'
import { identity, seedListening } from '../../helpers/yutuIdentity'
import { getInvidiousPopularFeed, searchHomeVideos, relatedHomeVideos } from '../../helpers/api/invidious'
import { copyToClipboard, showToast } from '../../helpers/utils'
import { useI18n } from 'vue-i18n'
import { LATIN_FEED_TTL } from '../../helpers/latinMusicFeed'
import { KeyboardShortcuts } from '../../../constants'

const { t } = useI18n()

const personalizedHome = !process.env.IS_ELECTRON && !process.env.YUTU_TV
const homeSections = shallowRef([])
const cacheKey = () => `yutu-home-v2:${identity.bucket}`
function restoreHomeCache() {
  if (!personalizedHome) return
  try {
    const cached = JSON.parse(localStorage.getItem(cacheKey()) || '{}')
    if (Date.now() - cached.at < 24 * 60 * 60 * 1000 && Array.isArray(cached.sections)) {
      homeSections.value = cached.sections
      shownResults.value = cached.sections.flatMap(section => section.items)
    }
  } catch { /* A damaged cache should not block fresh recommendations. */ }
}
watch(() => identity.bucket, () => {
  homeSections.value = []
  shownResults.value = []
  restoreHomeCache()
  fetchPopularInfo()
})
const isLoading = ref(false)
const feedError = ref(false)

// Do not reuse the previous global/US feed after updating the app.
const shownResults = shallowRef([])
let refreshTimer
let fetchedAt = 0
let refreshPending = false
watch(() => identity.history.slice(0, 2).map(video => video.videoId).join(','), () => {
  if (!personalizedHome) return
  if (isLoading.value) refreshPending = true
  else fetchPopularInfo()
})

function refreshIfStale() {
  if (document.visibilityState === 'visible' && Date.now() - fetchedAt >= LATIN_FEED_TTL) {
    fetchPopularInfo()
  }
}

onMounted(() => {
  document.addEventListener('keydown', keyboardShortcutHandler)
  document.addEventListener('visibilitychange', refreshIfStale)
  refreshTimer = window.setInterval(refreshIfStale, 60_000)

  if (personalizedHome) {
    seedListening(store.getters.getHistoryCacheSorted)
    restoreHomeCache()
  }
  if (shownResults.value.length === 0 || personalizedHome) {
    fetchPopularInfo()
  }
})

onBeforeUnmount(() => {
  document.removeEventListener('keydown', keyboardShortcutHandler)
  document.removeEventListener('visibilitychange', refreshIfStale)
  window.clearInterval(refreshTimer)
})

async function fetchPopularInfo() {
  if (isLoading.value) return
  isLoading.value = true
  feedError.value = false

  const bucket = identity.bucket
  try {
    if (personalizedHome) {
      const result = await loadHomeRecommendations({ history: identity.history, search: searchHomeVideos, related: relatedHomeVideos })
      if (bucket !== identity.bucket) return
      homeSections.value = result.sections
      shownResults.value = result.sections.flatMap(section => section.items)
      feedError.value = result.partial
      fetchedAt = Date.now()
      try { localStorage.setItem(cacheKey(), JSON.stringify({ at: fetchedAt, sections: result.sections })) } catch { /* Storage may be full. */ }
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
      if (!isLoading.value) {
        fetchPopularInfo()
      }
      break
  }
}

</script>
<style scoped src="./Popular.css" />
