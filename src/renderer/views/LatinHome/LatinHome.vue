<template>
  <div>
    <ft-loader
      v-if="isLoading"
      :fullscreen="true"
    />
    <template v-else>
      <ft-card
        v-if="music.length > 0"
        class="card"
      >
        <h2>
          <FontAwesomeIcon
            :icon="['fas', 'music']"
            class="headingIcon"
          />
          {{ t('Latin Feed.Latin Music') }}
        </h2>
        <ft-element-list :data="music" />
      </ft-card>
      <ft-card
        v-if="popular.length > 0"
        class="card"
      >
        <h2>
          <FontAwesomeIcon
            :icon="['fas', 'fire']"
            class="headingIcon"
          />
          {{ t('Latin Feed.Popular in Latin America') }}
        </h2>
        <ft-element-list :data="popular" />
      </ft-card>
      <ft-card
        v-if="music.length === 0 && popular.length === 0"
        class="card"
      >
        <p class="emptyMessage">
          {{ t('Latin Feed.Nothing to show') }}
        </p>
      </ft-card>
    </template>
    <ft-refresh-widget
      :disable-refresh="isLoading"
      :last-refresh-timestamp="lastRefresh"
      :title="t('Latin Home')"
      @click="load(true)"
    />
  </div>
</template>

<script setup>
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome'
import { onMounted, ref, shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'

import FtLoader from '../../components/FtLoader/FtLoader.vue'
import FtCard from '../../components/ft-card/ft-card.vue'
import FtElementList from '../../components/FtElementList/FtElementList.vue'
import FtRefreshWidget from '../../components/FtRefreshWidget/FtRefreshWidget.vue'

import { getInvidiousLatinFeed } from '../../helpers/api/invidious'
import { copyToClipboard, getRelativeTimeFromDate, showToast } from '../../helpers/utils'

const { t } = useI18n()

const isLoading = ref(false)
const music = shallowRef([])
const popular = shallowRef([])
const lastRefresh = ref('')

onMounted(() => load(false))

async function load(forceRefresh) {
  isLoading.value = true

  try {
    const feed = await getInvidiousLatinFeed(forceRefresh)
    music.value = feed.music
    popular.value = feed.popular
    lastRefresh.value = getRelativeTimeFromDate(new Date(feed.time), true)
  } catch (err) {
    showToast(`${t('Invidious API Error (Click to copy)')}: ${err}`, 10000, () => {
      copyToClipboard(err)
    })
  } finally {
    isLoading.value = false
  }
}
</script>

<style scoped src="./LatinHome.css" />
