<template>
  <div class="tvHome">
    <ft-loader
      v-if="isLoading && shelves.length === 0"
      :fullscreen="true"
    />
    <template v-else>
      <section
        v-for="(shelf, index) in shelves"
        :key="shelf.id"
        class="tvShelf"
        :class="{ tvShelfLarge: index === 0 }"
      >
        <h2 class="tvShelfTitle">
          {{ shelf.title }}
        </h2>
        <div class="tvShelfRow">
          <router-link
            v-for="video in shelf.items"
            :key="video.videoId"
            :to="`/watch/${video.videoId}`"
            class="tvCard"
            :title="video.title"
          >
            <span class="tvThumb">
              <img
                :src="thumbnailUrl(video.videoId)"
                alt=""
                loading="lazy"
                @error="nextThumbnail($event, instanceUrl, video.videoId)"
              >
              <span
                v-if="duration(video)"
                class="tvDuration"
              >{{ duration(video) }}</span>
            </span>
            <span class="tvTitle">{{ video.title }}</span>
            <span class="tvMeta">{{ meta(video) }}</span>
          </router-link>
        </div>
      </section>
      <p
        v-if="!isLoading && shelves.length === 0"
        class="emptyMessage"
      >
        {{ t('Latin Feed.Nothing to show') }}
      </p>
    </template>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'

import FtLoader from '../../components/FtLoader/FtLoader.vue'

import store from '../../store/index'
import { hdThumbnailUrl, nextThumbnail } from '../../helpers/tvThumbnails'
import { LATIN_FEED_TTL } from '../../helpers/latinMusicFeed'
import {
  getInvidiousLatinFeed,
  getInvidiousNature,
  getInvidiousRecommendedFromHistory,
  getInvidiousTrailers
} from '../../helpers/api/invidious'
import { copyToClipboard, formatDurationAsTimestamp, formatNumber, showToast } from '../../helpers/utils'

const { t } = useI18n()

const isLoading = ref(false)
const emptyFeed = () => ({ recommended: [], music: [], trailers: [], popular: [], nature: [] })
const feed = shallowRef(emptyFeed())

/** Filas de la portada, en orden. Un video que ya salió en una fila de arriba no se repite abajo. */
const shelves = computed(() => {
  const current = feed.value
  const seen = new Set()

  // Sin historial todavía: "Recomendados" sale de lo más popular y la música
  let recommended = current.recommended
  if (recommended.length === 0) {
    recommended = []
    for (let i = 0; i < 8; i++) {
      for (const list of [current.popular, current.music]) {
        if (list[i]) recommended.push(list[i])
      }
    }
  }

  const definitions = [
    ['recommended', t('Latin Feed.Recommended'), recommended],
    ['music', t('Latin Feed.Latin Music'), current.music],
    ['trailers', t('Latin Feed.Trailers'), current.trailers],
    ['popular', t('Latin Feed.Popular in Latin America'), current.popular],
    ['nature', t('Latin Feed.Nature and More'), current.nature]
  ]

  const result = []
  for (const [id, title, list] of definitions) {
    const items = list.filter((video) => {
      if (!video.videoId || seen.has(video.videoId)) return false
      seen.add(video.videoId)
      return true
    })
    if (items.length > 0) result.push({ id, title, items: items.slice(0, 24) })
  }
  return result
})

const instanceUrl = computed(() => store.getters.getCurrentInvidiousInstanceUrl)
const thumbnailUrl = (id) => hdThumbnailUrl(instanceUrl.value, id)
const duration = (video) => video.liveNow ? 'EN VIVO' : (video.lengthSeconds > 0 ? formatDurationAsTimestamp(video.lengthSeconds) : '')

const meta = (video) => {
  const views = typeof video.viewCount === 'number'
    ? `${formatNumber(video.viewCount)} ${t('Latin Feed.Views')}`
    : (video.viewCountText ?? '')
  return [video.author, views, video.publishedText].filter(Boolean).join(' • ')
}

let cache = null
let refreshTimer
let fetchedAt = 0

function refreshIfStale() {
  if (!document.hidden && Date.now() - fetchedAt >= LATIN_FEED_TTL) load(false)
}

onMounted(() => {
  load(false)
  refreshTimer = window.setInterval(refreshIfStale, 60_000)
  document.addEventListener('visibilitychange', refreshIfStale)
})

onBeforeUnmount(() => {
  window.clearInterval(refreshTimer)
  document.removeEventListener('visibilitychange', refreshIfStale)
})

async function load(forceRefresh) {
  if (isLoading.value) return

  if (!forceRefresh && cache && Date.now() - cache.time < LATIN_FEED_TTL) {
    feed.value = cache.feed
    fetchedAt = cache.time
    return
  }

  isLoading.value = true
  const next = feed.value.music.length > 0 ? { ...feed.value } : emptyFeed()
  // Las filas van apareciendo a medida que llegan, sin esperar a las demás
  const publish = () => { feed.value = { ...next } }

  try {
    // El historial se carga en segundo plano al abrir la app: esperarlo para saber qué has visto
    if (store.getters.getHistoryCacheSorted.length === 0) await store.dispatch('grabHistory')
    const history = store.getters.getHistoryCacheSorted
    const watchedIds = history.map((entry) => entry.videoId)
    const recentIds = [...new Set(watchedIds)].slice(0, 3)

    // Primero lo que se ve al abrir; el resto después, para no saturar la instancia
    const firstWave = await Promise.allSettled([
      recentIds.length > 0
        ? getInvidiousRecommendedFromHistory(recentIds, watchedIds).then((items) => { next.recommended = items; publish() })
        : Promise.resolve(),
      getInvidiousLatinFeed(forceRefresh).then((latin) => { next.music = latin.music; next.popular = latin.popular; publish() })
    ])

    const secondWave = await Promise.allSettled([
      getInvidiousTrailers().then((items) => { next.trailers = items; publish() }),
      getInvidiousNature().then((items) => { next.nature = items; publish() })
    ])

    const failures = [...firstWave, ...secondWave].filter((result) => result.status === 'rejected')
    const nothing = Object.values(next).every((list) => list.length === 0)

    if (nothing) throw failures[0]?.reason ?? new Error('Sin resultados')

    fetchedAt = Date.now()
    cache = { time: fetchedAt, feed: { ...next } }
  } catch (err) {
    fetchedAt = Date.now() - LATIN_FEED_TTL + 5 * 60_000
    showToast(`${t('Invidious API Error (Click to copy)')}: ${err}`, 10000, () => {
      copyToClipboard(err)
    })
  } finally {
    isLoading.value = false
  }
}
</script>

<style scoped src="./LatinHome.css" />
