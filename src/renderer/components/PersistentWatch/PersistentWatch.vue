<template>
  <section
    class="persistentWatch"
    :class="{ minimized }"
    :aria-label="t('Playback Dock.Now Playing')"
    @play.capture="syncState"
    @pause.capture="syncState"
    @ended.capture="syncState"
    @loadedmetadata.capture="syncState"
  >
    <div
      v-if="!minimized"
      class="browseActions"
    >
      <button
        type="button"
        @click="emit('browse')"
      >
        {{ t('Playback Dock.Explore') }}
      </button>
      <button
        v-if="pipAvailable"
        type="button"
        @click="enterPip"
      >
        <FontAwesomeIcon :icon="faClone" />
        {{ t('Playback Dock.Picture in Picture') }}
      </button>
    </div>
    <Watch
      ref="watchInstance"
      :route-override="frozenRoute"
      :navigation-router="playbackRouter"
      :minimized="minimized"
    />
    <div
      v-if="minimized"
      class="miniControls"
    >
      <button
        class="miniTitle"
        type="button"
        :title="t('Playback Dock.Expand')"
        @click="expand"
      >
        {{ title }}
      </button>
      <button
        type="button"
        :aria-label="paused ? t('Playback Dock.Play') : t('Playback Dock.Pause')"
        @click="togglePlayback"
      >
        <FontAwesomeIcon :icon="paused ? faPlay : faPause" />
      </button>
      <button
        v-if="pipAvailable"
        type="button"
        :aria-label="t('Playback Dock.Picture in Picture')"
        @click="enterPip"
      >
        <FontAwesomeIcon :icon="faClone" />
      </button>
      <button
        type="button"
        :disabled="closing"
        :aria-label="t('Playback Dock.Close')"
        @click="close"
      >
        <FontAwesomeIcon :icon="faXmark" />
      </button>
    </div>
  </section>
</template>

<script setup>
import { computed, nextTick, onMounted, provide, reactive, ref, useTemplateRef, watch } from 'vue'
import { routeLocationKey, routerKey, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome'
import { faClone, faPause, faPlay, faXmark } from '@fortawesome/free-solid-svg-icons'
import Watch from '../../views/Watch/Watch.vue'
import { enterVideoPictureInPicture, isWatchLocation, snapshotPlaybackRoute, supportsVideoPictureInPicture } from '../../helpers/persistentPlayback'
import { showToast } from '../../helpers/utils'

const props = defineProps({
  playbackRoute: { type: Object, required: true },
  minimized: { type: Boolean, default: false }
})
const emit = defineEmits(['close', 'browse', 'navigate'])
const { t } = useI18n()
const router = useRouter()
const frozenRoute = reactive(snapshotPlaybackRoute(props.playbackRoute))
const watchInstance = useTemplateRef('watchInstance')
const paused = ref(true)
const pipAvailable = ref(false)
const closing = ref(false)
const title = computed(() => watchInstance.value?.videoTitle || t('Playback Dock.Now Playing'))

// Playlist/autoplay changes the playing video without replacing the search page.
const navigate = (method, target) => {
  const resolved = router.resolve(target)
  if (props.minimized && isWatchLocation(resolved)) {
    emit('navigate', snapshotPlaybackRoute(resolved))
    return Promise.resolve()
  }
  return router[method](target)
}
const playbackRouter = {
  ...router,
  push: target => navigate('push', target),
  replace: target => navigate('replace', target)
}
provide(routeLocationKey, frozenRoute)
provide(routerKey, playbackRouter)
watch(() => props.playbackRoute, value => {
  Object.assign(frozenRoute, snapshotPlaybackRoute(value))
})

function getVideo() {
  return watchInstance.value?.$el?.querySelector('video')
}
function syncState() {
  const video = getVideo()
  paused.value = !video || video.paused || video.ended
  pipAvailable.value = supportsVideoPictureInPicture(video)
}
function togglePlayback() {
  const video = getVideo()
  if (!video) return
  if (video.paused) video.play().catch(() => {})
  else video.pause()
}
function expand() {
  router.push(props.playbackRoute.fullPath)
}
async function enterPip() {
  try {
    await enterVideoPictureInPicture(getVideo())
  } catch {
    pipAvailable.value = false
    showToast(t('Playback Dock.PiP Unavailable'))
  }
}
async function close() {
  if (closing.value) return
  closing.value = true
  getVideo()?.pause()
  try {
    await watchInstance.value?.stopPersistentPlayback()
  } finally {
    emit('close')
  }
}
onMounted(() => nextTick(syncState))
</script>

<style scoped lang="scss" src="./PersistentWatch.scss" />
