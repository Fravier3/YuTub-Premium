<!-- eslint-disable @intlify/vue-i18n/no-raw-text -->
<template>
  <div>
    <FtLoader
      v-if="isLoading"
    />
    <template
      v-else
    >
      <div
        v-if="errorChannels.length !== 0"
      >
        <h3> {{ $t("Subscriptions.Error Channels") }}</h3>
        <FtFlexBox>
          <FtChannelBubble
            v-for="channel in errorChannels"
            :key="channel.id"
            :channel-name="channel.name"
            :channel-id="channel.id"
            :channel-thumbnail="channel.thumbnail"
          />
        </FtFlexBox>
      </div>
      <FtFlexBox
        v-if="activeVideoList.length === 0"
      >
        <p
          v-if="!activeProfileHasSubscriptions"
          class="message"
        >
          {{ $t("Subscriptions['Your Subscription list is currently empty. Start adding subscriptions to see them here.']") }}
        </p>
        <p
          v-else-if="!fetchSubscriptionsAutomatically && !attemptedFetch"
          class="message"
        >
          {{ $t("Subscriptions.Disabled Automatic Fetching") }}
        </p>
        <p
          v-else
          class="message"
        >
          {{ isCommunity ? $t("Subscriptions.Empty Posts") : (publishedAfter > 0 && videoList.length > 0 ? 'Tus canales no han publicado nada en las últimas 24 horas.' : $t("Subscriptions.Empty Channels")) }}
        </p>
      </FtFlexBox>
      <FtElementList
        v-else
        :data="activeVideoList"
        :use-channels-hidden-preference="false"
        :display="isCommunity ? 'list' : ''"
      />
      <FtAutoLoadNextPageWrapper
        v-if="videoList.length > dataLimit"
        @load-next-page="increaseLimit"
      >
        <FtFlexBox>
          <FtButton
            :label="isCommunity ? $t('Subscriptions.Load More Posts') : $t('Subscriptions.Load More Videos')"
            background-color="var(--primary-color)"
            text-color="var(--text-with-main-color)"
            @click="increaseLimit"
          />
        </FtFlexBox>
      </FtAutoLoadNextPageWrapper>
    </template>

    <FtRefreshWidget
      :disable-refresh="isLoading || !activeProfileHasSubscriptions"
      :last-refresh-timestamp="lastRefreshTimestamp"
      :title="title"
      @click="refresh"
    />
  </div>
</template>

<script setup>
import { computed, inject, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import FtAutoLoadNextPageWrapper from '../FtAutoLoadNextPageWrapper.vue'
import FtButton from '../FtButton/FtButton.vue'
import FtChannelBubble from '../FtChannelBubble/FtChannelBubble.vue'
import FtElementList from '../FtElementList/FtElementList.vue'
import FtFlexBox from '../ft-flex-box/ft-flex-box.vue'
import FtLoader from '../FtLoader/FtLoader.vue'
import FtRefreshWidget from '../FtRefreshWidget/FtRefreshWidget.vue'

import store from '../../store/index'

import { KeyboardShortcuts } from '../../../constants'

const props = defineProps({
  isLoading: {
    type: Boolean,
    default: false
  },
  videoList: {
    type: Array,
    default: () => []
  },
  isCommunity: {
    type: Boolean,
    default: false
  },
  errorChannels: {
    type: Array,
    default: () => []
  },
  attemptedFetch: {
    type: Boolean,
    default: false
  },
  initialDataLimit: {
    type: Number,
    default: 100
  },
  lastRefreshTimestamp: {
    type: String,
    required: true
  },
  title: {
    type: String,
    required: true
  },
  // Entradas de otras pestañas (shorts, directos) que se mezclan con la lista por fecha
  extraVideos: {
    type: Array,
    default: () => []
  },
  // Marca de tiempo mínima de publicación; 0 = sin límite
  publishedAfter: {
    type: Number,
    default: 0
  }
})

const emit = defineEmits(['refresh'])

const subscriptionLimit = sessionStorage.getItem('subscriptionLimit')

const dataLimit = ref(subscriptionLimit !== null ? parseInt(subscriptionLimit) : props.initialDataLimit)

const activeVideoList = computed(() => {
  if (filteredVideoList.value.length < dataLimit.value) {
    return filteredVideoList.value
  } else {
    return filteredVideoList.value.slice(0, dataLimit.value)
  }
})

const activeProfileHasSubscriptions = computed(() => {
  return store.getters.getActiveProfile.subscriptions.length > 0
})

/** @type {import('vue').ComputedRef<boolean>} */
const fetchSubscriptionsAutomatically = computed(() => {
  return store.getters.getFetchSubscriptionsAutomatically
})

const historyCacheById = computed(() => {
  return store.getters.getHistoryCacheById
})

const hideWatchedSubs = computed(() => {
  return store.getters.getHideWatchedSubs
})

const onlyShowLatestFromChannel = computed(() => {
  return store.getters.getOnlyShowLatestFromChannel
})

const onlyShowLatestFromChannelNumber = computed(() => {
  return store.getters.getOnlyShowLatestFromChannelNumber
})

const filteredVideoList = computed(() => {
  if (props.isCommunity) {
    return props.videoList
  }

  let videoList = props.videoList

  if (props.extraVideos.length > 0) {
    const unique = new Map()
    for (const video of [...videoList, ...props.extraVideos]) {
      if (!unique.has(video.videoId)) unique.set(video.videoId, video)
    }
    videoList = [...unique.values()].sort((a, b) => (b.published ?? 0) - (a.published ?? 0))
  }

  if (props.publishedAfter > 0) {
    videoList = videoList.filter(video => (video.published ?? 0) >= props.publishedAfter)
  }

  if (hideWatchedSubs.value) {
    videoList = videoList.filter((video) => {
      return historyCacheById.value[video.videoId] === undefined
    })
  }

  if (onlyShowLatestFromChannel.value) {
    const authors = new Map()
    videoList = videoList.filter((video) => {
      if (!video.authorId) {
        return true
      }

      if (!authors.has(video.authorId)) {
        authors.set(video.authorId, 1)
        return true
      } else {
        const currentVideos = authors.get(video.authorId)

        if (currentVideos < onlyShowLatestFromChannelNumber.value) {
          authors.set(video.authorId, currentVideos + 1)
          return true
        }
      }

      return false
    })
  }

  return videoList
})

function increaseLimit() {
  dataLimit.value += props.initialDataLimit
  sessionStorage.setItem('subscriptionLimit', dataLimit.value.toFixed(0))
}

/**
 * @param {KeyboardEvent} event
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
      if (!props.isLoading && activeProfileHasSubscriptions.value) {
        refresh()
      }
      break
  }
}

onMounted(() => {
  document.addEventListener('keydown', keyboardShortcutHandler)
})

onBeforeUnmount(() => {
  document.removeEventListener('keydown', keyboardShortcutHandler)
})

function refresh() {
  emit('refresh')
}

// Yutu web: la vista de Suscripciones puede pedir la actualización desde su fila de fichas
const externalRefresh = inject('yutuSubscriptionsRefresh', null)
if (externalRefresh) {
  watch(externalRefresh, () => {
    if (!props.isLoading && activeProfileHasSubscriptions.value) refresh()
  })
}
</script>

<style scoped src="./SubscriptionsTabUi.css" />
