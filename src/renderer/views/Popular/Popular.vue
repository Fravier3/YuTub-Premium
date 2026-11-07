<template>
  <div>
    <ft-loader
      v-if="isLoading && shownResults.length === 0"
      :fullscreen="true"
    />
    <ft-card
      v-else
      class="card"
    >
      <h2>
        <FontAwesomeIcon
          :icon="['fas', 'users']"
          class="headingIcon"
        />
        {{ $t("Latin Music") }}
      </h2>
      <p class="feedDescription">
        {{ $t('Latin Music Refresh') }}
      </p>
      <p
        v-if="feedError"
        role="status"
        class="feedDescription"
      >
        {{ $t('Latin Music Error') }}
      </p>
      <ft-element-list
        :data="shownResults"
      />
    </ft-card>
    <ft-refresh-widget
      :disable-refresh="isLoading"
      :last-refresh-timestamp="lastPopularRefreshTimestamp"
      :title="$t('Most Popular')"
      @click="fetchPopularInfo"
    />
  </div>
</template>

<script setup>
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome'
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'

import FtLoader from '../../components/FtLoader/FtLoader.vue'
import FtCard from '../../components/ft-card/ft-card.vue'
import FtElementList from '../../components/FtElementList/FtElementList.vue'
import FtRefreshWidget from '../../components/FtRefreshWidget/FtRefreshWidget.vue'
import store from '../../store/index'

import { getInvidiousPopularFeed } from '../../helpers/api/invidious'
import { copyToClipboard, getRelativeTimeFromDate, showToast } from '../../helpers/utils'
import { useI18n } from 'vue-i18n'
import { LATIN_FEED_TTL } from '../../helpers/latinMusicFeed'
import { KeyboardShortcuts } from '../../../constants'

const { t } = useI18n()

const isLoading = ref(false)
const feedError = ref(false)

const lastPopularRefreshTimestamp = computed(() => {
  return getRelativeTimeFromDate(store.getters.getLastPopularRefreshTimestamp, true)
})

// Do not reuse the previous global/US feed after updating the app.
const shownResults = shallowRef([])
let refreshTimer
let fetchedAt = 0

function refreshIfStale() {
  if (document.visibilityState === 'visible' && Date.now() - fetchedAt >= LATIN_FEED_TTL) {
    fetchPopularInfo()
  }
}

onMounted(() => {
  document.addEventListener('keydown', keyboardShortcutHandler)
  document.addEventListener('visibilitychange', refreshIfStale)
  refreshTimer = window.setInterval(refreshIfStale, 60_000)

  if (shownResults.value.length === 0) {
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

  try {
    const items = await getInvidiousPopularFeed(shownResults.value.slice(0, 12).map(item => item.videoId))
    fetchedAt = Date.now()

    store.commit('setLastPopularRefreshTimestamp', new Date())
    shownResults.value = items
    isLoading.value = false
    store.commit('setPopularCache', items)
  } catch (err) {
    feedError.value = true
    // Back off on failures while preserving the last successful list.
    fetchedAt = Date.now() - LATIN_FEED_TTL + 5 * 60_000
    isLoading.value = false
    const errorMessage = t('Invidious API Error (Click to copy)')
    showToast(`${errorMessage}: ${err}`, 10000, () => {
      copyToClipboard(err)
    })
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
