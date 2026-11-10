<template>
  <section
    ref="dockElement"
    class="persistentWatch"
    :style="minimized && position ? { left: position.x + 'px', top: position.y + 'px', right: 'auto', bottom: 'auto' } : undefined"
    :class="{ minimized, settling }"
    :aria-label="t('Playback Dock.Now Playing')"
    @click.capture="guardGestureClick"
    @keydown.esc.capture="swipeCancel"
    @touchstart.capture.passive="swipeStart"
    @touchmove.capture="swipeMove"
    @touchend.capture="swipeEnd"
    @touchcancel.capture="swipeCancel"
    @play.capture="syncState"
    @pause.capture="syncState"
    @ended.capture="syncState"
    @loadedmetadata.capture="syncState"
  >
    <Watch
      ref="watchInstance"
      :route-override="frozenRoute"
      :navigation-router="playbackRouter"
      :minimized="minimized"
    >
      <template #player-overlay>
        <button
          v-if="minimized"
          class="miniVideoHitTarget"
          type="button"
          :aria-label="t('Playback Dock.Expand')"
          @pointerdown="dragStart"
          @pointermove="dragMove"
          @pointerup="dragEnd"
          @pointercancel="dragCancel"
          @click.stop="expandUnlessDragged"
        />
        <div
          v-else
          class="playerActions"
        >
          <button
            class="minimizeVideo"
            type="button"
            :aria-label="t('Playback Dock.Explore')"
            :title="t('Playback Dock.Explore')"
            @click.stop="browse"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.4"
              aria-hidden="true"
            ><path d="m6 9 6 6 6-6" /></svg>
          </button>
          <button
            v-if="pipAvailable"
            class="pipVideo"
            type="button"
            :aria-label="t('Playback Dock.Picture in Picture')"
            @click.stop="enterPip"
          >
            <FontAwesomeIcon :icon="faClone" />
          </button>
        </div>
      </template>
    </Watch>
    <div
      v-if="minimized"
      class="miniControls"
    >
      <button
        class="miniTitle"
        type="button"
        :title="t('Playback Dock.Expand')"
        @pointerdown="dragStart"
        @pointermove="dragMove"
        @pointerup="dragEnd"
        @pointercancel="dragCancel"
        @click="expandUnlessDragged"
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
import { animate } from 'motion/mini'
import { computed, nextTick, onBeforeUnmount, onMounted, provide, reactive, ref, useTemplateRef, watch } from 'vue'
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
const dockElement = useTemplateRef('dockElement')
const position = ref(null)
const settling = ref(false)
let motion
let gestureClickUntil = 0
let drag = null
let suppressClickUntil = 0
let swipe = null
function clampPosition(x, y) {
  const rect = dockElement.value.getBoundingClientRect()
  const viewport = window.visualViewport
  const left = viewport?.offsetLeft || 0
  const top = viewport?.offsetTop || 0
  const width = viewport?.width || window.innerWidth
  const height = viewport?.height || window.innerHeight
  // Keep the card within the visible viewport, including when the keyboard opens.
  const safeTop = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--yt-safe-top')) || 0
  return {
    x: Math.max(left + 8, Math.min(x, left + width - rect.width - 8)),
    y: Math.max(top + safeTop + 8, Math.min(y, top + height - rect.height - 8))
  }
}
function dragStart(event) {
  if (!props.minimized || (event.button != null && event.button !== 0)) return
  const rect = dockElement.value.getBoundingClientRect()
  drag = { id: event.pointerId, x: event.clientX, y: event.clientY, left: rect.left, top: rect.top, moved: false }
  event.currentTarget.setPointerCapture?.(event.pointerId)
}
function dragMove(event) {
  if (!drag || event.pointerId !== drag.id) return
  const dx = event.clientX - drag.x
  const dy = event.clientY - drag.y
  if (!drag.moved && Math.hypot(dx, dy) < 8) return
  drag.moved = true
  event.preventDefault()
  position.value = clampPosition(drag.left + dx, drag.top + dy)
}
function dragEnd(event) {
  if (!drag || event.pointerId !== drag.id) return
  if (drag.moved) suppressClickUntil = Date.now() + 500
  drag = null
}
function dragCancel() {
  if (drag?.moved) suppressClickUntil = Date.now() + 500
  drag = null
}
function expandUnlessDragged() {
  if (Date.now() >= suppressClickUntil) expand()
}
function swipeStart(event) {
  swipe = null
  if (props.minimized || settling.value || event.touches.length !== 1 ||
      !event.target.closest('.videoAreaMargin') ||
      event.target.closest('button, input, [role="slider"], .shaka-bottom-controls, .shaka-seek-bar-container')) return
  const touch = event.touches[0]
  motion?.stop()
  swipe = { x: touch.clientX, y: touch.clientY, down: false, horizontal: false }
}
function swipeMove(event) {
  if (!swipe || event.touches.length !== 1) return
  const touch = event.touches[0]
  const dx = touch.clientX - swipe.x
  const dy = touch.clientY - swipe.y
  if (!swipe.down && Math.abs(dx) > 16 && Math.abs(dx) > Math.abs(dy)) swipe.horizontal = true
  if (swipe.horizontal) return
  if (swipe.down || (dy > 12 && dy > Math.abs(dx) * 1.5)) {
    swipe.down = true
    if (event.cancelable) event.preventDefault()
    // Shaka interprets touchend as a tap/double-tap seek. A vertical drag
    // belongs exclusively to minimization, never to the video controls.
    event.stopPropagation?.()
    const area = dockElement.value?.querySelector('.videoAreaMargin')
    if (area?.style) {
      const progress = Math.min(1, Math.max(0, dy) / 300)
      const target = Math.min(220 / (area.offsetWidth || window.innerWidth), 0.8)
      area.style.transform = `translateY(${Math.max(0, dy) * 0.65}px) scale(${1 - progress * (1 - target)})`
      area.style.borderRadius = `${progress * 16}px`
    }
  }
}
function guardGestureClick(event) {
  if (Date.now() < gestureClickUntil) {
    event.preventDefault()
    event.stopPropagation()
  }
}
function resetPreview() {
  const area = dockElement.value?.querySelector('.videoAreaMargin')
  if (area?.style) {
    area.style.transform = ''
    area.style.borderRadius = ''
  }
}
function swipeEnd(event) {
  if (swipe?.down) {
    event.preventDefault?.()
    event.stopPropagation?.()
    gestureClickUntil = Date.now() + 500
    if (event.changedTouches[0].clientY - swipe.y > 70) browse()
    else returnPreview()
  }
  swipe = null
}
function returnPreview() {
  const area = dockElement.value?.querySelector('.videoAreaMargin')
  if (area?.style && area.style.transform) {
    motion = animate(area, { transform: [area.style.transform, 'none'], borderRadius: '0px' }, { duration: 0.22, ease: [0.22, 1, 0.36, 1] })
    motion.then(resetPreview)
  } else resetPreview()
}
function swipeCancel() { swipe = null; returnPreview() }
function keepInViewport() {
  if (props.minimized && position.value) position.value = clampPosition(position.value.x, position.value.y)
}
onMounted(() => {
  window.addEventListener?.('resize', keepInViewport)
  window.visualViewport?.addEventListener('resize', keepInViewport)
})
onBeforeUnmount(() => {
  window.removeEventListener?.('resize', keepInViewport)
  window.visualViewport?.removeEventListener('resize', keepInViewport)
})

let savedScroll = 0
let restoreTimer
function browse() {
  savedScroll = window.scrollY
  const area = dockElement.value?.querySelector('.videoAreaMargin')
  const before = area?.getBoundingClientRect?.()
  settling.value = true
  emit('browse')
  nextTick(() => {
    resetPreview()
    const element = dockElement.value
    if (!before || !element?.getBoundingClientRect || !props.minimized) { settling.value = false; return }
    const after = element.getBoundingClientRect()
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const transform = `translate(${before.left - after.left}px, ${before.top - after.top}px) scale(${before.width / after.width})`
    motion = animate(element, { transform: [transform, 'none'] }, { duration: reduced ? 0 : 0.3, ease: [0.22, 1, 0.36, 1] })
    motion.then(() => { settling.value = false })
  })
}
async function expand() {
  await router.push(props.playbackRoute.fullPath)
  // Router scrollBehavior restores the route after 500ms. Restore this view's
  // own position after it, without mounting or seeking the playing video.
  clearTimeout(restoreTimer)
  restoreTimer = setTimeout(() => window.scrollTo({ top: savedScroll, behavior: 'instant' }), 550)
}
onBeforeUnmount(() => { clearTimeout(restoreTimer); motion?.stop() })
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
