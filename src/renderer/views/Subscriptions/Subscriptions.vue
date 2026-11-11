<!-- eslint-disable @intlify/vue-i18n/no-raw-text -->
<template>
  <div class="subsPage">
    <FtCard
      class="card"
      :class="{ yutuSubs: yutuWeb }"
    >
      <!-- Yutu web: cabecera como la de YouTube, con los canales arriba y filtros en fichas -->
      <template v-if="yutuWeb">
        <div
          v-if="stripChannels.length > 0"
          class="channelStripRow"
        >
          <div class="channelStrip">
            <RouterLink
              v-for="channel in stripChannels"
              :key="channel.id"
              :to="`/channel/${channel.id}`"
              class="stripChannel"
              :title="channel.name"
            >
              <span class="stripAvatar">
                <img
                  v-if="channel.thumbnail"
                  :src="channel.thumbnail"
                  alt=""
                  loading="lazy"
                  width="56"
                  height="56"
                >
                <FontAwesomeIcon
                  v-else
                  :icon="['fas', 'circle-user']"
                />
                <span
                  v-if="channel.hasNew"
                  class="stripDot"
                  title="Contenido nuevo"
                />
              </span>
              <span class="stripName">{{ channel.name }}</span>
            </RouterLink>
          </div>
          <RouterLink
            to="/subscribedchannels"
            class="stripAll"
          >
            Todos
          </RouterLink>
        </div>
        <div
          class="subsChips"
          role="tablist"
          :aria-label="$t('Subscriptions.Subscriptions Tabs')"
        >
          <button
            v-for="chip in chips"
            :key="chip.id"
            type="button"
            role="tab"
            class="subsChip"
            :class="{ selected: currentTab === chip.id }"
            :aria-selected="currentTab === chip.id"
            aria-controls="subscriptionsPanel"
            @click="changeTab(chip.id)"
          >
            {{ chip.label }}
          </button>
          <button
            type="button"
            class="subsChip subsRefresh"
            aria-label="Actualizar suscripciones"
            title="Actualizar suscripciones"
            @click="refreshSignal++"
          >
            <FontAwesomeIcon :icon="['fas', 'rotate-right']" />
          </button>
        </div>
      </template>
      <h2 v-if="!yutuWeb">
        <FontAwesomeIcon
          :icon="['fas', 'rss']"
          class="subscriptionIcon"
        />
        {{ $t("Subscriptions.Subscriptions") }}
      </h2>
      <FtFlexBox
        v-if="!yutuWeb"
        class="tabs"
        role="tablist"
        :aria-label="$t('Subscriptions.Subscriptions Tabs')"
      >
        <!-- eslint-disable-next-line vuejs-accessibility/interactive-supports-focus -->
        <div
          v-if="!hideSubscriptionsVideos"
          ref="videosTab"
          class="tab"
          role="tab"
          :aria-selected="currentTab === 'videos'"
          aria-controls="subscriptionsPanel"
          :tabindex="currentTab === 'videos' ? 0 : -1"
          :class="{ selectedTab: currentTab === 'videos' }"
          @click="changeTab('videos')"
          @keydown.space.enter.prevent="changeTab('videos')"
          @keydown.left.right="focusTab($event, 'videos')"
        >
          <FontAwesomeIcon
            :icon="['fa', 'video']"
            class="subscriptionIcon"
          />
          {{ $t("Global.Videos") }}
        </div>
        <!-- eslint-disable-next-line vuejs-accessibility/interactive-supports-focus -->
        <div
          v-if="!hideSubscriptionsShorts"
          ref="shortsTab"
          class="tab"
          role="tab"
          :aria-selected="currentTab === 'shorts'"
          aria-controls="subscriptionsPanel"
          :tabindex="currentTab === 'shorts' ? 0 : -1"
          :class="{ selectedTab: currentTab === 'shorts' }"
          @click="changeTab('shorts')"
          @keydown.space.enter.prevent="changeTab('shorts')"
          @keydown.left.right="focusTab($event, 'shorts')"
        >
          <FontAwesomeIcon
            :icon="['fa', 'clapperboard']"
            class="subscriptionIcon"
          />
          {{ $t("Global.Shorts") }}
        </div>
        <!-- eslint-disable-next-line vuejs-accessibility/interactive-supports-focus -->
        <div
          v-if="!hideSubscriptionsLive"
          ref="liveTab"
          class="tab"
          role="tab"
          :aria-selected="currentTab === 'live'"
          aria-controls="subscriptionsPanel"
          :tabindex="currentTab === 'live' ? 0 : -1"
          :class="{ selectedTab: currentTab === 'live' }"
          @click="changeTab('live')"
          @keydown.space.enter.prevent="changeTab('live')"
          @keydown.left.right="focusTab($event, 'live')"
        >
          <FontAwesomeIcon
            :icon="['fa', 'tower-broadcast']"
            class="subscriptionIcon"
          />
          {{ $t("Global.Live") }}
        </div>
        <!-- eslint-disable-next-line vuejs-accessibility/interactive-supports-focus -->
        <div
          v-if="!hideSubscriptionsCommunity"
          ref="communityTab"
          class="tab"
          role="tab"
          :aria-selected="currentTab === 'community'"
          aria-controls="subscriptionsPanel"
          :tabindex="currentTab === 'community' ? 0 : -1"
          :class="{ selectedTab: currentTab === 'community' }"
          @click="changeTab('community')"
          @keydown.space.enter.prevent="changeTab('community')"
          @keydown.left.right="focusTab($event, 'community')"
        >
          <FontAwesomeIcon
            :icon="['fa', 'message']"
            class="subscriptionIcon"
          />
          {{ $t("Global.Posts") }}
        </div>
      </FtFlexBox>
      <SubscriptionsVideos
        v-if="currentTab === 'videos' || currentTab === 'all' || currentTab === 'today'"
        id="subscriptionsPanel"
        role="tabpanel"
        :filter="currentTab"
      />
      <SubscriptionsShorts
        v-else-if="currentTab === 'shorts'"
        id="subscriptionsPanel"
        role="tabpanel"
      />
      <SubscriptionsLive
        v-else-if="currentTab === 'live'"
        id="subscriptionsPanel"
        role="tabpanel"
      />
      <SubscriptionsPosts
        v-else-if="currentTab === 'community'"
        id="subscriptionsPanel"
        role="tabpanel"
      />
      <p v-else>
        {{ $t("Subscriptions.All Subscription Tabs Hidden", {
          subsection: $t('Settings.Distraction Free Settings.Sections.Subscriptions Page'),
          settingsSection: $t('Settings.Distraction Free Settings.Distraction Free Settings')
        }) }}
      </p>
    </FtCard>
  </div>
</template>

<script setup>
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome'
import { computed, provide, ref, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import FtCard from '../../components/ft-card/ft-card.vue'
import FtFlexBox from '../../components/ft-flex-box/ft-flex-box.vue'
import SubscriptionsVideos from '../../components/SubscriptionsVideos.vue'
import SubscriptionsLive from '../../components/SubscriptionsLive.vue'
import SubscriptionsShorts from '../../components/SubscriptionsShorts.vue'
import SubscriptionsPosts from '../../components/SubscriptionPosts/SubscriptionsPosts.vue'

import store from '../../store/index'
import { youtubeImageUrlToInvidious } from '../../helpers/api/invidious'

const { t } = useI18n()

// La cabecera nueva es solo de la app web; Android TV y escritorio conservan las pestañas de siempre
const yutuWeb = !process.env.IS_ELECTRON && !process.env.YUTU_TV

// En el teléfono el botón de actualizar vive en la fila de fichas; la pestaña activa escucha este contador
const refreshSignal = ref(0)
provide('yutuSubscriptionsRefresh', refreshSignal)

/** @type {import('vue').ComputedRef<boolean>} */
const hideSubscriptionsVideos = computed(() => {
  return store.getters.getHideSubscriptionsVideos
})

/** @type {import('vue').ComputedRef<boolean>} */
const hideSubscriptionsShorts = computed(() => {
  return store.getters.getHideSubscriptionsShorts
})

/** @type {import('vue').ComputedRef<boolean>} */
const hideSubscriptionsLive = computed(() => {
  return store.getters.getHideLiveStreams || store.getters.getHideSubscriptionsLive
})

/** @type {import('vue').ComputedRef<boolean>} */
const hideSubscriptionsCommunity = computed(() => {
  return store.getters.getHideSubscriptionsCommunity
})

/** @type {import('vue').Ref<'all' | 'today' | 'videos' | 'shorts' | 'live' | 'community' | null>} */
const currentTab = ref(yutuWeb ? 'all' : 'videos')

watch(currentTab, (value) => {
  if (value !== null) {
  // Save last used tab, restore when view mounted again
    sessionStorage.setItem('Subscriptions/currentTab', value)
  } else {
    sessionStorage.removeItem('Subscriptions/currentTab')
  }
})

const visibleTabs = computed(() => {
  /** @type {('videos' | 'shorts' | 'live' | 'community')[]} */
  const tabs = []

  if (!hideSubscriptionsVideos.value) {
    if (yutuWeb) tabs.push('all', 'today')
    tabs.push('videos')
  }

  if (!hideSubscriptionsShorts.value) {
    tabs.push('shorts')
  }

  if (!hideSubscriptionsLive.value) {
    tabs.push('live')
  }

  if (!hideSubscriptionsCommunity.value) {
    tabs.push('community')
  }

  return tabs
})

watch(visibleTabs, (value) => {
  if (value.length === 0) {
    currentTab.value = null
  } else if (!value.includes(currentTab.value)) {
    currentTab.value = value[0]
  }
})

if (visibleTabs.value.length === 0) {
  currentTab.value = null
} else {
  // Restore currentTab
  const lastCurrentTabId = sessionStorage.getItem('Subscriptions/currentTab')
  if (lastCurrentTabId !== null) {
    changeTab(lastCurrentTabId)
  } else if (!visibleTabs.value.includes(currentTab.value)) {
    currentTab.value = visibleTabs.value[0]
  }
}

/**
 * @param {'videos' | 'shorts' | 'live' | 'community'} tab
 */
function changeTab(tab) {
  if (tab === currentTab.value) {
    return
  }

  if (visibleTabs.value.includes(tab)) {
    currentTab.value = tab
  } else {
    // First visible tab or no tab
    currentTab.value = visibleTabs.value.length > 0 ? visibleTabs.value[0] : null
  }
}

const chips = computed(() => {
  const labels = {
    all: 'Todos',
    today: 'Hoy',
    videos: 'Videos',
    shorts: 'Shorts',
    live: 'En tiempo real',
    community: t('Global.Posts')
  }
  return visibleTabs.value.map(id => ({ id, label: labels[id] }))
})

const DAY = 24 * 60 * 60 * 1000

/** Canales suscritos para la tira de arriba: primero los que publicaron en las últimas 24 horas. */
const stripChannels = computed(() => {
  if (!yutuWeb) return []
  const videoCache = store.getters.getVideoCache
  const instance = store.getters.getCurrentInvidiousInstanceUrl
  const since = Date.now() - DAY
  return store.getters.getActiveProfile.subscriptions
    .map(channel => ({
      id: channel.id,
      name: channel.name || '',
      thumbnail: channel.thumbnail ? youtubeImageUrlToInvidious(channel.thumbnail, instance) : '',
      hasNew: (videoCache[channel.id]?.videos ?? []).some(video => video.published >= since)
    }))
    .sort((a, b) => Number(b.hasNew) - Number(a.hasNew) || a.name.localeCompare(b.name))
})

const videosTab = useTemplateRef('videosTab')
const liveTab = useTemplateRef('liveTab')
const shortsTab = useTemplateRef('shortsTab')
const communityTab = useTemplateRef('communityTab')

/**
 * @param {KeyboardEvent} event
 * @param {'videos' | 'shorts' | 'live' | 'community'} focusedTab
 */
function focusTab(event, focusedTab) {
  if (event.altKey) {
    return
  }

  event.preventDefault()

  const visibleTabsCached = visibleTabs.value

  if (visibleTabsCached.length === 1) {
    store.commit('setOutlinesHidden', false)
    return
  }

  let index = visibleTabsCached.indexOf(focusedTab)

  if (event.key === 'ArrowLeft') {
    index--
  } else {
    index++
  }

  if (index < 0) {
    index = visibleTabsCached.length - 1
  } else if (index > visibleTabsCached.length - 1) {
    index = 0
  }

  switch (visibleTabsCached[index]) {
    case 'videos':
      videosTab.value?.focus()
      break
    case 'live':
      liveTab.value?.focus()
      break
    case 'shorts':
      shortsTab.value?.focus()
      break
    case 'community':
      communityTab.value?.focus()
      break
  }

  store.commit('setOutlinesHidden', false)
}
</script>

<style scoped src="./Subscriptions.css" />
