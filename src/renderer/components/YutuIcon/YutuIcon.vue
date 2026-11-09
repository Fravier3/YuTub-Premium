<template>
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.7"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path :d="paths[name]" />
  </svg>
</template>
<script setup>
defineProps({ name: { type: String, required: true } })
const paths = {
  home: 'M3 10.5 12 3l9 7.5M5 9v12h5v-7h4v7h5V9',
  shorts: 'm16.4 2.5-10 5.8a3.2 3.2 0 0 0 0 5.5l2 1.2-2.8 1.6a3.2 3.2 0 0 0 3.2 5.5l10-5.8a3.2 3.2 0 0 0 0-5.5l-2-1.2 2.8-1.6a3.2 3.2 0 0 0-3.2-5.5ZM10 9l5 3-5 3Z',
  plus: 'M12 5v14M5 12h14',
  subscriptions: 'M7 2h10M4 5h16M3 8h18v13H3ZM10 11l5 3-5 3Z',
  user: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM16 18a4 4 0 0 0-8 0M15 9a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',
  chats: 'M3 3h15v12h-7l-5 4v-4H3ZM21 8v12h-5l-3 2',
  bell: 'M18 8a6 6 0 0 0-12 0v6l-2 3h16l-2-3ZM10 20a2 2 0 0 0 4 0',
  search: 'M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0Zm-2 5 6 6'
}
</script>
