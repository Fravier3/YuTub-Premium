<template>
  <nav
    class="mobileDock"
    :aria-label="t('More')"
  >
    <RouterLink
      to="/popular"
      class="dockItem"
      :aria-label="t('Most Popular')"
      :title="t('Most Popular')"
    >
      <YutuIcon name="home" />
    </RouterLink>
    <RouterLink
      to="/search/m%C3%BAsica%20latina%20%23shorts"
      class="dockItem"
      :aria-label="t('Global.Shorts')"
      :title="t('Global.Shorts')"
    >
      <YutuIcon name="shorts" />
    </RouterLink>
    <button
      class="dockItem create"
      :aria-label="t('User Playlists.Create New Playlist')"
      :title="t('User Playlists.Create New Playlist')"
      @click="createPlaylist"
    >
      <YutuIcon name="plus" />
    </button>
    <RouterLink
      to="/subscriptions"
      class="dockItem"
      :aria-label="t('Subscriptions.Subscriptions')"
      :title="t('Subscriptions.Subscriptions')"
    >
      <YutuIcon name="subscriptions" />
    </RouterLink>
    <button
      class="dockItem account"
      :aria-label="t('Profile.Toggle Profile List')"
      :title="t('Profile.Toggle Profile List')"
      :aria-expanded="accountOpen"
      aria-controls="dockAccount"
      @click="accountOpen = !accountOpen"
    >
      <span
        class="avatar"
        :style="{ backgroundColor: profile.bgColor, color: profile.textColor }"
      >{{ initial }}</span>
    </button>
    <div
      v-if="accountOpen"
      id="dockAccount"
      class="accountMenu"
      @keydown.esc="accountOpen = false"
    >
      <FtProfileSelector />
      <RouterLink to="/history">{{ t('History.History') }}</RouterLink>
      <RouterLink to="/userplaylists">{{ t('Playlists') }}</RouterLink>
      <RouterLink to="/subscribedchannels">{{ t('Channels.Channels') }}</RouterLink>
      <RouterLink to="/settings">{{ t('Settings.Settings') }}</RouterLink>
    </div>
  </nav>
</template>
<script setup>
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import store from '../../store/index'
import YutuIcon from '../YutuIcon/YutuIcon.vue'
import FtProfileSelector from '../FtProfileSelector/FtProfileSelector.vue'
const { t } = useI18n()
const route = useRoute()
const accountOpen = ref(false)
const profile = computed(() => store.getters.getActiveProfile)
const initial = computed(() => Array.from(profile.value.name || 'Y')[0].toUpperCase())
watch(() => route.fullPath, () => { accountOpen.value = false })
function createPlaylist() {
  accountOpen.value = false
  store.dispatch('showCreatePlaylistPrompt', { title: '' })
}
</script>
<style scoped src="./MobileDock.css" />
