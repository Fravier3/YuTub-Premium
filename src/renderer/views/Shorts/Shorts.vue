<!-- eslint-disable @intlify/vue-i18n/no-raw-text -->
<template>
  <div class="shortsPage">
    <div class="shortsTop">
      <button
        type="button"
        class="shortsTopButton"
        aria-label="Más Shorts distintos"
        title="Más Shorts distintos"
        :disabled="isLoading"
        @click="reload"
      >
        <FontAwesomeIcon :icon="['fas', 'rotate-right']" />
      </button>
    </div>

    <FtLoader
      v-if="isLoading && shorts.length === 0"
      :fullscreen="true"
    />
    <div
      v-else-if="shorts.length === 0"
      class="shortsEmpty"
      role="status"
    >
      <p>No se pudieron cargar los Shorts.</p>
      <button
        type="button"
        class="shortsRetry"
        @click="reload"
      >
        Reintentar
      </button>
    </div>

    <div
      v-else
      ref="feed"
      class="shortsFeed"
      @scroll.passive="onScroll"
    >
      <section
        v-for="(short, index) in shorts"
        :key="short.videoId"
        class="short"
        :aria-label="short.title"
      >
        <img
          class="shortBackdrop"
          :src="posterUrl(short.videoId)"
          alt=""
          loading="lazy"
          @error="posterFallback($event, short.videoId)"
          @load="posterLoaded($event, short.videoId)"
        >
        <!-- eslint-disable-next-line vuejs-accessibility/click-events-have-key-events, vuejs-accessibility/no-static-element-interactions -->
        <div
          :id="`short-media-${index}`"
          class="shortMedia"
          @click="togglePlay(index)"
        >
          <img
            v-show="index !== activeIndex || !isShowingVideo"
            class="shortPoster"
            :src="posterUrl(short.videoId)"
            alt=""
            loading="lazy"
            @error="posterFallback($event, short.videoId)"
            @load="posterLoaded($event, short.videoId)"
          >
        </div>
        <div class="shortShade" />

        <div
          v-if="index === activeIndex && statusMessage"
          class="shortStatus"
          role="status"
        >
          {{ statusMessage }}
        </div>
        <button
          v-if="index === activeIndex && isMutedByBrowser"
          type="button"
          class="shortUnmute"
          @click="unmute"
        >
          <FontAwesomeIcon :icon="['fas', 'volume-mute']" />
          Toca para activar el sonido
        </button>
        <div
          v-if="index === activeIndex && isPaused && isShowingVideo"
          class="shortPausedIcon"
          aria-hidden="true"
        >
          <FontAwesomeIcon :icon="['fas', 'play']" />
        </div>

        <div class="shortActions">
          <button
            type="button"
            class="shortAction"
            :class="{ liked: liked.has(short.videoId) }"
            :aria-pressed="liked.has(short.videoId)"
            aria-label="Me gusta"
            @click="toggleLike(short)"
          >
            <svg
              viewBox="0 0 24 24"
              aria-hidden="true"
            ><path d="M12 20.5 4.6 13.4a4.9 4.9 0 0 1 0-7 5 5 0 0 1 7 0l.4.4.4-.4a5 5 0 0 1 7 0 4.9 4.9 0 0 1 0 7Z" /></svg>
            <span>{{ likeLabel(short) }}</span>
          </button>
          <RouterLink
            class="shortAction"
            :to="`/watch/${short.videoId}`"
            aria-label="Comentarios"
          >
            <svg
              viewBox="0 0 24 24"
              aria-hidden="true"
            ><path d="M4 4h16v13H9l-5 4ZM8 9h8M8 12.5h6" /></svg>
            <span>Comentar</span>
          </RouterLink>
          <button
            type="button"
            class="shortAction"
            aria-label="Guardar"
            @click="save(short)"
          >
            <svg
              viewBox="0 0 24 24"
              aria-hidden="true"
            ><path d="M6 3.5h12V21l-6-4.2L6 21Z" /></svg>
            <span>Guardar</span>
          </button>
          <button
            type="button"
            class="shortAction"
            aria-label="Compartir"
            @click="share(short)"
          >
            <svg
              viewBox="0 0 24 24"
              aria-hidden="true"
            ><path d="M13.5 5 21 12l-7.5 7v-4.2C8.5 14.8 5.3 16.3 3 20c.6-5.8 3.9-10.2 10.5-10.8Z" /></svg>
            <span>Compartir</span>
          </button>
        </div>

        <div class="shortInfo">
          <div class="shortChannelRow">
            <RouterLink
              class="shortChannel"
              :to="`/channel/${short.authorId}`"
            >
              <img
                v-if="avatars[short.videoId]"
                class="shortAvatar"
                :src="avatars[short.videoId]"
                alt=""
                width="36"
                height="36"
              >
              <span
                v-else
                class="shortAvatar shortAvatarEmpty"
              >{{ (short.author || '?').slice(0, 1).toUpperCase() }}</span>
              <span class="shortAuthor">{{ handle(short.author) }}</span>
            </RouterLink>
            <button
              v-if="short.authorId"
              type="button"
              class="shortSubscribe"
              :class="{ subscribed: isSubscribed(short.authorId) }"
              @click="toggleSubscription(short)"
            >
              {{ isSubscribed(short.authorId) ? 'Suscrito' : 'Suscribirse' }}
            </button>
          </div>
          <p class="shortTitle">
            {{ short.title }}
          </p>
        </div>
      </section>
      <div
        v-if="isLoadingMore"
        class="shortsMore"
        role="status"
      >
        Cargando más…
      </div>
    </div>

    <div
      v-if="shorts.length > 0"
      class="shortProgress"
      aria-hidden="true"
    >
      <span :style="{ transform: `scaleX(${progress})` }" />
    </div>

    <!-- Un único <video> que se muda al Short activo: en iPhone el sonido ya permitido se conserva. -->
    <Teleport
      v-if="shorts.length > 0"
      defer
      :to="`#short-media-${activeIndex}`"
    >
      <!-- eslint-disable-next-line vuejs-accessibility/media-has-caption -->
      <video
        ref="video"
        class="shortVideo"
        :class="{ ready: isShowingVideo }"
        playsinline
        webkit-playsinline
        loop
        preload="auto"
        @playing="onPlaying"
        @pause="isPaused = true"
        @timeupdate="onTimeUpdate"
      />
    </Teleport>
  </div>
</template>

<script setup>
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome'
import shaka from 'shaka-player'
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, shallowRef, useTemplateRef, watch } from 'vue'

import FtLoader from '../../components/FtLoader/FtLoader.vue'

import store from '../../store/index'
import { MAIN_PROFILE_ID } from '../../../constants'
import { getShortPlayback, invidiousFetch, searchShortVideos, shortManifestUrl } from '../../helpers/api/invidious'
import { startWebManifest } from '../../helpers/webManifest'
import { loadShortsFeed } from '../../helpers/shortsFeed'
import { identity } from '../../helpers/yutuIdentity'
import { copyToClipboard, formatNumber, showToast } from '../../helpers/utils'

const SHOWN_KEY = 'yutu-shorts-shown-v1:'
const LIKED_KEY = 'yutu-shorts-liked-v1:'

const shorts = shallowRef([])
const activeIndex = ref(0)
const isLoading = ref(false)
const isLoadingMore = ref(false)
const isShowingVideo = ref(false)
const isPaused = ref(false)
const isMutedByBrowser = ref(false)
const statusMessage = ref('')
const progress = ref(0)
const avatars = reactive({})
const likeCounts = reactive({})

const feed = useTemplateRef('feed')
const video = useTemplateRef('video')

const instanceUrl = computed(() => store.getters.getCurrentInvidiousInstanceUrl)

// La miniatura vertical del Short; si el video no la tiene, las normales de mayor a menor.
const POSTERS = ['oar2.jpg', 'hq720.jpg', 'sddefault.jpg', 'hqdefault.jpg', 'mqdefault.jpg']
const posterUrl = id => `${instanceUrl.value}/vi/${id}/${POSTERS[0]}`
function posterFallback(event, id) {
  const img = event.target
  const level = Number(img.dataset.poster ?? 0) + 1
  if (!POSTERS[level]) return
  img.dataset.poster = String(level)
  img.src = `${instanceUrl.value}/vi/${id}/${POSTERS[level]}`
}
// Cuando una miniatura no existe, YouTube responde bien pero con un marcador gris de 120x90
function posterLoaded(event, id) {
  if (event.target.naturalWidth > 0 && event.target.naturalWidth <= 120) posterFallback(event, id)
}

const handle = author => '@' + String(author || '').replaceAll(/\s+/g, '')

function readIds(key) {
  try {
    const stored = JSON.parse(localStorage.getItem(key + identity.bucket) || '[]')
    return Array.isArray(stored) ? stored.filter(id => typeof id === 'string') : []
  } catch { return [] }
}
function writeIds(key, ids, limit) {
  try { localStorage.setItem(key + identity.bucket, JSON.stringify(ids.slice(0, limit))) } catch { /* Sin espacio: solo se pierde este recuerdo. */ }
}

/* ---------- Carga del feed ---------- */

let page = 1
let exhausted = false

async function fetchBatch() {
  const batch = await loadShortsFeed({
    searches: identity.searches,
    history: identity.history,
    search: searchShortVideos,
    shown: new Set(readIds(SHOWN_KEY)),
    exclude: new Set(shorts.value.map(short => short.videoId)),
    page
  })
  page++
  return batch
}

async function reload() {
  if (isLoading.value) return
  isLoading.value = true
  stopVideo()
  page = 1
  exhausted = false
  shorts.value = []
  activeIndex.value = 0
  try {
    shorts.value = await fetchBatch()
    if (shorts.value.length === 0) shorts.value = await fetchBatch()
  } catch (error) {
    showToast(`No se pudieron cargar los Shorts: ${error?.message || error}`)
  } finally {
    isLoading.value = false
  }
  await nextTick()
  if (feed.value) feed.value.scrollTop = 0
  if (shorts.value.length > 0) playActive()
}

async function loadMore() {
  if (isLoadingMore.value || exhausted) return
  isLoadingMore.value = true
  try {
    const batch = await fetchBatch()
    if (batch.length === 0) exhausted = page > 4
    else shorts.value = [...shorts.value, ...batch]
  } catch { /* Se reintenta al seguir deslizando. */ } finally {
    isLoadingMore.value = false
  }
}

/* ---------- Reproducción ---------- */

/*
 * Mismo camino que el reproductor principal: manifiesto DASH del servidor reproducido con Shaka. El formato
 * combinado de la API queda solo como respaldo, porque muchos servidores ya no lo ofrecen.
 */
const manifestCache = new Map()
function manifestFor(id) {
  if (!manifestCache.has(id)) {
    manifestCache.set(id, startWebManifest(shortManifestUrl(id), invidiousFetch).ready.then((manifest) => {
      if (!manifest) manifestCache.delete(id)
      return manifest
    }))
  }
  return manifestCache.get(id)
}

const infoCache = new Map()
function infoFor(short) {
  const id = short.videoId
  if (!infoCache.has(id)) {
    infoCache.set(id, getShortPlayback(id).then((info) => {
      if (info.authorThumbnail) avatars[id] = info.authorThumbnail
      if (info.likeCount) likeCounts[id] = info.likeCount
      return info
    }).catch(() => {
      infoCache.delete(id)
      return null
    }))
  }
  return infoCache.get(id)
}

/** @type {shaka.Player | null} */
let player = null
let attachedElement = null
async function playerFor(element) {
  if (!player) {
    player = new shaka.Player()
    player.configure({
      streaming: { bufferingGoal: 20, rebufferingGoal: 1, bufferBehind: 10 },
      abr: { enabled: true, restrictToElementSize: true, defaultBandwidthEstimate: 3_000_000 },
      // Como el reproductor principal: primero las variantes que el dispositivo decodifica con fluidez
      preferredDecodingAttributes: ['smooth', 'powerEfficient']
    })
  }
  if (attachedElement !== element) {
    await player.attach(element)
    attachedElement = element
  }
  return player
}

function stopVideo() {
  isShowingVideo.value = false
  isPaused.value = false
  progress.value = 0
  video.value?.pause()
  player?.unload().catch(() => {})
}

let playToken = 0
let shownTimer

async function playActive() {
  const index = activeIndex.value
  const short = shorts.value[index]
  if (!short) return
  const token = ++playToken
  isShowingVideo.value = false
  isPaused.value = false
  progress.value = 0
  video.value?.pause()
  statusMessage.value = ''
  clearTimeout(shownTimer)

  // Los datos del canal y los me gusta no deben retrasar el video
  const info = infoFor(short)
  const manifest = await manifestFor(short.videoId)
  // El <video> tarda un instante en mudarse a la tarjeta nueva
  await nextTick()
  const element = video.value
  if (!element || token !== playToken) return

  let loaded = false
  try {
    const shakaPlayer = await playerFor(element)
    if (token !== playToken) return
    if (manifest) {
      try {
        await shakaPlayer.load(manifest, 0, 'application/dash+xml')
        loaded = true
      } catch (error) {
        if (token !== playToken) return
        console.warn('Short: el manifiesto DASH no cargó, se prueba el formato directo', error)
      }
    }
    if (!loaded) {
      const fallback = (await info)?.url
      if (token !== playToken) return
      if (fallback) {
        await shakaPlayer.load(fallback, 0, 'video/mp4')
        loaded = true
      }
    }
  } catch (error) {
    if (token !== playToken) return
    console.warn('Short: no se pudo reproducir', error)
  }
  if (token !== playToken) return
  if (!loaded) {
    statusMessage.value = 'Este Short no se pudo reproducir. Desliza al siguiente.'
    return
  }

  try {
    await element.play()
  } catch (error) {
    if (token !== playToken) return
    if (error?.name === 'NotAllowedError') {
      // El navegador no deja arrancar con sonido sin un toque: se empieza en silencio y se avisa
      element.muted = true
      isMutedByBrowser.value = true
      element.play().catch(() => {})
    }
  }

  // Lo que se vio de verdad (no lo que pasó de largo) no vuelve a salir primero la próxima vez
  shownTimer = setTimeout(() => {
    writeIds(SHOWN_KEY, [...new Set([short.videoId, ...readIds(SHOWN_KEY)])], 400)
  }, 1500)

  // Preparar el siguiente para que el cambio sea inmediato
  const next = shorts.value[index + 1]
  if (next) {
    manifestFor(next.videoId)
    infoFor(next)
  }
  if (index >= shorts.value.length - 3) loadMore()
}

function onPlaying() {
  isShowingVideo.value = true
  isPaused.value = false
  statusMessage.value = ''
}

function onTimeUpdate() {
  const element = video.value
  if (element?.duration > 0) progress.value = Math.min(1, element.currentTime / element.duration)
}

function unmute() {
  const element = video.value
  if (!element) return
  element.muted = false
  isMutedByBrowser.value = false
  if (element.paused) element.play().catch(() => {})
}

function togglePlay(index) {
  const element = video.value
  if (!element || index !== activeIndex.value) return
  if (isMutedByBrowser.value) {
    unmute()
  } else if (element.paused) {
    element.play().catch(() => {})
  } else {
    element.pause()
  }
}

let scrollTimer
function onScroll() {
  clearTimeout(scrollTimer)
  scrollTimer = setTimeout(() => {
    const element = feed.value
    if (!element || element.clientHeight === 0) return
    const index = Math.max(0, Math.min(shorts.value.length - 1, Math.round(element.scrollTop / element.clientHeight)))
    if (index !== activeIndex.value) activeIndex.value = index
  }, 90)
}

watch(activeIndex, playActive)

function step(direction) {
  const element = feed.value
  if (!element) return
  element.scrollBy({ top: direction * element.clientHeight, behavior: 'smooth' })
}

function onKeydown(event) {
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return
  if (event.key === 'ArrowDown' || event.key === 'PageDown') {
    event.preventDefault()
    step(1)
  } else if (event.key === 'ArrowUp' || event.key === 'PageUp') {
    event.preventDefault()
    step(-1)
  } else if (event.key === ' ' && !(event.target instanceof HTMLButtonElement || event.target instanceof HTMLAnchorElement)) {
    event.preventDefault()
    togglePlay(activeIndex.value)
  }
}

function onVisibility() {
  const element = video.value
  if (!element) return
  if (document.hidden) element.pause()
  else if (isShowingVideo.value) element.play().catch(() => {})
}

/* ---------- Acciones ---------- */

const liked = ref(new Set(readIds(LIKED_KEY)))
function toggleLike(short) {
  const next = new Set(liked.value)
  if (next.has(short.videoId)) next.delete(short.videoId)
  else next.add(short.videoId)
  liked.value = next
  writeIds(LIKED_KEY, [...next], 500)
}
function likeLabel(short) {
  const count = (likeCounts[short.videoId] || 0) + (liked.value.has(short.videoId) ? 1 : 0)
  return count > 0 ? formatNumber(count, { notation: 'compact' }) : 'Me gusta'
}

function save(short) {
  store.dispatch('showAddToPlaylistPromptForManyVideos', {
    videos: [{
      videoId: short.videoId,
      title: short.title,
      author: short.author,
      authorId: short.authorId,
      description: short.description,
      viewCount: short.viewCount,
      lengthSeconds: short.lengthSeconds,
      published: short.published
    }]
  })
}

async function share(short) {
  const url = `https://youtube.com/shorts/${short.videoId}`
  if (navigator.share) {
    try {
      await navigator.share({ title: short.title, url })
    } catch { /* El usuario cerró el menú de compartir. */ }
  } else {
    copyToClipboard(url, { messageOnSuccess: 'Enlace copiado' })
  }
}

const subscribedIds = computed(() => new Set(store.getters.getActiveProfile.subscriptions.map(channel => channel.id)))
const isSubscribed = id => subscribedIds.value.has(id)
function toggleSubscription(short) {
  const profile = store.getters.getActiveProfile
  if (isSubscribed(short.authorId)) {
    store.dispatch('removeChannelFromProfiles', { channelId: short.authorId, profileIds: [profile._id] })
    showToast('Suscripción eliminada')
    return
  }
  const profileIds = [profile._id]
  if (profile._id !== MAIN_PROFILE_ID) profileIds.push(MAIN_PROFILE_ID)
  store.dispatch('addChannelToProfiles', {
    channel: { id: short.authorId, name: short.author, thumbnail: avatars[short.videoId] || null },
    profileIds
  })
  showToast(`Te suscribiste a ${short.author}`)
}

onMounted(() => {
  document.addEventListener('keydown', onKeydown)
  document.addEventListener('visibilitychange', onVisibility)
  reload()
})

onBeforeUnmount(() => {
  playToken++
  clearTimeout(scrollTimer)
  clearTimeout(shownTimer)
  document.removeEventListener('keydown', onKeydown)
  document.removeEventListener('visibilitychange', onVisibility)
  video.value?.pause()
  player?.destroy().catch(() => {})
  player = null
  attachedElement = null
})
</script>

<style scoped src="./Shorts.css" />
