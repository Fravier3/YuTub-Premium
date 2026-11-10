<template>
  <FtCard
    class="card"
  >
    <div
      v-if="previewMode && !commentsExpanded"
      class="commentPreview"
      @touchstart.passive="swipeStart = $event.changedTouches[0].clientX"
      @touchend.passive="swipePreview"
    >
      <div class="previewHeading">
        <button
          class="previewOpen"
          @click="expandComments"
        >
          {{ $t('Comments.Comments') }}
        </button><div class="previewDots">
          <button
            v-for="(_, index) in previewComments"
            :key="index"
            :aria-label="$t('Watch UI.Comment Number', { number: index + 1 })"
            :aria-pressed="previewIndex === index"
            @click="previewIndex = index"
          />
        </div>
      </div>
      <button
        v-if="previewComment"
        class="previewBody"
        @click="expandComments"
      >
        <img
          :src="previewComment.authorThumb"
          alt=""
          width="24"
          height="24"
        ><span>{{ previewText }}</span>
      </button>
      <button
        v-else
        class="previewEmpty"
        @click="expandComments"
      >
        {{ isLoading ? $t('Watch UI.Loading Comments') : $t('Comments.Click to View Comments') }}
      </button>
    </div>
    <div
      v-show="!previewMode || commentsExpanded"
      class="fullComments"
    >
      <button
        v-if="previewMode && commentsExpanded"
        class="closePreviewComments"
        :aria-label="$t('Close')"
        @click="commentsExpanded = false"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          aria-hidden="true"
        ><path d="m6 6 12 12M18 6 6 18" /></svg>
      </button>
      <h3
        v-if="commentData.length > 0 && !isLoading && showComments"
        class="commentsTitle"
      >
        {{ $t("Comments.Comments") }}
        <span
          class="hideComments"
          role="button"
          tabindex="0"
          @click="showComments = false"
          @keydown.enter.space.prevent="showComments = false"
        >
          {{ $t("Comments.Hide Comments") }}
        </span>
      </h3>
      <h4
        v-if="canPerformInitialCommentLoading"
        class="getCommentsTitle"
        role="button"
        tabindex="0"
        @click="getCommentData"
        @keydown.enter.space.prevent="getCommentData"
      >
        <span class="desktopCommentLabel">{{ $t("Comments.Click to View Comments") }}</span><span class="mobileCommentLabel">{{ $t("Comments.Comments") }}</span>
      </h4>
      <h4
        v-if="commentData.length > 0 && !isLoading && !showComments"
        class="getCommentsTitle"
        role="button"
        tabindex="0"
        @click="showComments = true"
        @keydown.enter.space.prevent="showComments = true"
      >
        <span class="desktopCommentLabel">{{ $t("Comments.Click to View Comments") }}</span><span class="mobileCommentLabel">{{ $t("Comments.Comments") }}</span>
      </h4>
      <FtSelect
        v-if="commentData.length > 0 && !isLoading && showComments && showSortBy"
        class="commentSort"
        :placeholder="$t('Global.Sort By')"
        :value="currentSortValue"
        :select-names="sortNames"
        :select-values="sortValues"
        :icon="['fas', 'arrow-down-short-wide']"
        @change="handleSortChange"
      />
      <div
        v-if="commentData.length > 0 && showComments"
      >
        <FtComment
          v-for="(comment, index) in commentData"
          :id="'comment' + index"
          :key="comment.id"
          :comment="comment"
          :channel-name="channelName"
          :channel-thumbnail="channelThumbnail"
          :autoload-this-reply-level="false"
          :can-fallback-to-invidious="canFallbackToInvidious"
          :get-invidious-comment-replies="getInvidiousCommentReplies"
          @timestamp-event="onTimestamp"
        />
      </div>
      <div
        v-else-if="showComments && !isLoading"
      >
        <h3
          v-if="areCommentsDisabled"
          class="noCommentMsg"
        >
          {{ $t("Comments.Comments are turned off") }}
        </h3>
        <h3
          v-else-if="isPostComments"
          class="noCommentMsg"
        >
          {{ $t("Comments.There are no comments available for this post") }}
        </h3>
        <h3
          v-else
          class="noCommentMsg"
        >
          {{ $t("Comments.There are no comments available for this video") }}
        </h3>
      </div>
      <h4
        v-if="canPerformMoreCommentLoading"
        class="getMoreComments"
        role="button"
        tabindex="0"
        @click="getMoreComments"
        @keydown.enter.space.prevent="getMoreComments"
      >
        {{ $t("Comments.Load More Comments") }}
      </h4>
      <FtLoader
        v-if="isLoading"
      />
      <div
        v-observe-visibility="observeVisibilityOptions"
      >
      <!--
        Dummy element to be observed by Intersection Observer
      -->
      </div>
    </div>
  </FtCard>
</template>

<script setup>
import { computed, onMounted, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ObserveVisibility as vObserveVisibility } from 'vue-observe-visibility'

import FtCard from '../ft-card/ft-card.vue'
import FtComment from '../FtComment/FtComment.vue'
import FtLoader from '../FtLoader/FtLoader.vue'
import FtSelect from '../FtSelect/FtSelect.vue'

import store from '../../store/index'

import { copyToClipboard, showToast } from '../../helpers/utils'
import { getLocalCommunityPostComments, getLocalComments, parseLocalComment } from '../../helpers/api/local'
import {
  getInvidiousCommunityPostCommentReplies,
  getInvidiousCommunityPostComments,
  invidiousGetCommentReplies,
  invidiousGetComments
} from '../../helpers/api/invidious'

const { t } = useI18n()

const props = defineProps({
  id: {
    type: String,
    required: true
  },
  channelName: {
    type: String,
    required: true
  },
  channelThumbnail: {
    type: String,
    required: true
  },
  videoPlayerReady: {
    type: Boolean,
    required: true
  },
  isPostComments: {
    type: Boolean,
    default: false,
  },
  postAuthorId: {
    type: String,
    default: null
  },
  showSortBy: {
    type: Boolean,
    default: true,
  }
})

const emit = defineEmits(['timestamp-event'])
/**
 * @param {number} timestamp
 */
function onTimestamp(timestamp) {
  emit('timestamp-event', timestamp)
}

const isLoading = ref(false)
const isMoreCommentsLoading = ref(false)
const showComments = ref(false)
const areCommentsDisabled = ref(false)
const nextPageToken = shallowRef(null)

/** @type {import('vue').ShallowRef<import('../FtComment/FtComment.vue').Comment[]>} */
const commentData = shallowRef([])
const previewMode = !process.env.IS_ELECTRON && !process.env.YUTU_TV && window.matchMedia('(max-width: 680px)').matches && !props.isPostComments
const commentsExpanded = ref(false)
const previewIndex = ref(0)
const swipeStart = 0
const previewComments = computed(() => commentData.value.slice(0, 3))
const previewComment = computed(() => previewComments.value[previewIndex.value] || previewComments.value[0])
const previewText = computed(() => {
  const text = document.createElement('textarea')
  text.innerHTML = (previewComment.value?.text || '').replaceAll(/<br\s*\/?\s*>/gi, ' ').replaceAll(/<[^>]*>/g, '')
  return text.value
})
function expandComments() {
  commentsExpanded.value = true
  if (canPerformInitialCommentLoading.value) getCommentData()
  else showComments.value = true
}
function swipePreview(event) {
  const delta = event.changedTouches[0].clientX - swipeStart
  if (Math.abs(delta) < 30 || previewComments.value.length < 2) return
  previewIndex.value = (previewIndex.value + (delta < 0 ? 1 : -1) + previewComments.value.length) % previewComments.value.length
}
let previewRequested = false
function loadPreview() {
  if (!previewMode || previewRequested || !props.videoPlayerReady) return
  previewRequested = true
  if (canPerformInitialCommentLoading.value) getCommentData()
}
onMounted(loadPreview)
watch(() => props.videoPlayerReady, loadPreview)

/** @type {import('youtubei.js').YT.Comments | undefined} */
let localCommentsInstance

/** @type {import('vue').ComputedRef<'local' | 'invidious'>} */
const backendPreference = computed(() => {
  return store.getters.getBackendPreference
})

/** @type {import('vue').ComputedRef<boolean>} */
const backendFallback = computed(() => {
  return store.getters.getBackendFallback
})

/** @type {import('vue').ComputedRef<boolean>} */
const canFallbackToInvidious = computed(() => {
  return backendFallback.value && backendPreference.value === 'local'
})

/** @type {import('vue').ComputedRef<boolean>} */
const generalAutoLoadMorePaginatedItemsEnabled = computed(() => {
  return store.getters.getGeneralAutoLoadMorePaginatedItemsEnabled
})

const canPerformInitialCommentLoading = computed(() => {
  return commentData.value.length === 0 && !isLoading.value && !showComments.value
})

const canPerformMoreCommentLoading = computed(() => {
  return commentData.value.length > 0 && !isLoading.value && showComments.value && !!nextPageToken.value && !isMoreCommentsLoading.value
})

const observeVisibilityOptions = computed(() => {
  if (!generalAutoLoadMorePaginatedItemsEnabled.value) {
    return false
  }
  if (!props.videoPlayerReady && !props.isPostComments) { return false }

  return {
    /**
     * @param {boolean} isVisible
     */
    callback: (isVisible) => {
      // This is also fired when **hidden**
      // No point doing anything if not visible
      if (!isVisible) { return }
      // It's possible the comments are being loaded/already loaded
      if (canPerformInitialCommentLoading.value) {
        getCommentData()
      } else if (canPerformMoreCommentLoading.value) {
        getMoreComments()
      }
    },
    intersection: {
      // Only when it intersects with N% above bottom
      rootMargin: '0% 0% 0% 0%',
    },
    // Callback responsible for loading multiple comment pages
    once: false,
  }
})

const sortNames = computed(() => [
  t('Comments.Top comments'),
  t('Comments.Newest first')
])

const sortValues = [
  'top',
  'newest'
]

const sortNewest = ref(false)

const currentSortValue = computed(() => sortNewest.value ? 'newest' : 'top')

function handleSortChange() {
  sortNewest.value = !sortNewest.value
  commentData.value = []
  nextPageToken.value = null
  getCommentData()
}

function getCommentData() {
  isLoading.value = true
  areCommentsDisabled.value = false

  if (!process.env.SUPPORTS_LOCAL_API || backendPreference.value === 'invidious') {
    if (!props.isPostComments) {
      getCommentDataInvidious()
    } else {
      getPostCommentsInvidious()
    }
  } else {
    getCommentDataLocal()
  }
}

async function getMoreComments() {
  if (commentData.value.length === 0 || nextPageToken.value == null) {
    showToast(t('Comments.There are no more comments for this video'))
  } else {
    if (isMoreCommentsLoading.value) return

    isMoreCommentsLoading.value = true

    if (!process.env.SUPPORTS_LOCAL_API || backendPreference.value === 'invidious') {
      if (!props.isPostComments) {
        await getCommentDataInvidious()
      } else {
        await getPostCommentsInvidious()
      }
    } else {
      await getCommentDataLocal(true)
    }

    isMoreCommentsLoading.value = false
  }
}

/**
 * @param {boolean | undefined} more
 */
async function getCommentDataLocal(more = false) {
  try {
    /** @type {import('youtubei.js').YT.Comments} */
    let comments
    if (more) {
      comments = await nextPageToken.value.getContinuation()
    } else if (localCommentsInstance) {
      comments = await localCommentsInstance.applySort(sortNewest.value ? 'NEWEST_FIRST' : 'TOP_COMMENTS')
      localCommentsInstance = comments
    } else {
      if (props.isPostComments) {
        comments = await getLocalCommunityPostComments(props.id, props.postAuthorId)
        sortNewest.value = comments.header?.sort_menu?.sub_menu_items?.[1].selected ?? false
        localCommentsInstance = comments
      } else {
        comments = await getLocalComments(props.id)
        sortNewest.value = comments.header?.sort_menu?.sub_menu_items?.[1].selected ?? false
        localCommentsInstance = comments
      }
    }

    const parsedComments = comments.contents
      .map(commentThread => parseLocalComment(commentThread.comment, commentThread))

    if (more) {
      commentData.value = commentData.value.concat(parsedComments)
    } else {
      commentData.value = parsedComments
    }

    nextPageToken.value = comments.has_continuation ? comments : null
    isLoading.value = false
    showComments.value = true
  } catch (err) {
    // region No comment detection
    // No comment related info when video info requested earlier in parent component
    if (err.message.includes('The comments page did not have any content')) {
      // For videos without any comment (comment disabled?)
      // e.g. https://youtu.be/8NBSwDEf8a8
      commentData.value = []
      nextPageToken.value = null
      isLoading.value = false
      showComments.value = true
      areCommentsDisabled.value = true
      localCommentsInstance = undefined
      return
    }
    // endregion No comment detection

    console.error(err)
    const errorMessage = t('Local API Error (Click to copy)')
    showToast(`${errorMessage}: ${err}`, 10000, () => {
      copyToClipboard(err)
    })
    if (backendFallback.value && backendPreference.value === 'local') {
      localCommentsInstance = undefined
      showToast(t('Falling back to Invidious API'))
      if (props.isPostComments) {
        await getPostCommentsInvidious()
      } else {
        await getCommentDataInvidious()
      }
    } else {
      isLoading.value = false
    }
  }
}

async function getCommentDataInvidious() {
  try {
    const { response, commentData: comments } = await invidiousGetComments({
      id: props.id,
      nextPageToken: nextPageToken.value,
      sortNewest: sortNewest.value
    })

    commentData.value = commentData.value.concat(comments)
    nextPageToken.value = response.continuation
    isLoading.value = false
    showComments.value = true
  } catch (err) {
    // region No comment detection
    // No comment related info when video info requested earlier in parent component
    if (err.message.includes('Comments not found')) {
      // For videos without any comment (comment disabled?)
      // e.g. https://youtu.be/8NBSwDEf8a8
      commentData.value = []
      nextPageToken.value = null
      isLoading.value = false
      showComments.value = true
      areCommentsDisabled.value = true
      return
    }
    // endregion No comment detection

    console.error(err)
    const errorMessage = t('Invidious API Error (Click to copy)')
    showToast(`${errorMessage}: ${err}`, 10000, () => {
      copyToClipboard(err)
    })

    if (process.env.SUPPORTS_LOCAL_API && backendFallback.value && backendPreference.value === 'invidious') {
      showToast(t('Falling back to Local API'))
      await getCommentDataLocal()
    } else {
      isLoading.value = false
    }
  }
}

async function getPostCommentsInvidious() {
  try {
    const fetchComments = nextPageToken.value == null
      ? getInvidiousCommunityPostComments({ postId: props.id, authorId: props.postAuthorId })
      : getInvidiousCommunityPostCommentReplies({ postId: props.id, replyToken: nextPageToken.value, authorId: props.postAuthorId })

    const { response, commentData: comments, continuation } = await fetchComments

    commentData.value = commentData.value.concat(comments)
    nextPageToken.value = response?.continuation ?? continuation
    isLoading.value = false
    showComments.value = true
  } catch (err) {
    if (err.message.includes('Comments not found')) {
      commentData.value = []
      nextPageToken.value = null
      isLoading.value = false
      showComments.value = true
      areCommentsDisabled.value = true
      return
    }

    console.error(err)
    const errorMessage = t('Invidious API Error (Click to copy)')
    showToast(`${errorMessage}: ${err}`, 10000, () => {
      copyToClipboard(err)
    })

    if (process.env.SUPPORTS_LOCAL_API && backendFallback.value && backendPreference.value === 'invidious') {
      showToast(t('Falling back to Local API'))
      await getCommentDataLocal()
    } else {
      isLoading.value = false
    }
  }
}

/**
 * Pure function for use inside FtComment
 * @param {string} replyToken
 */
async function getInvidiousCommentReplies(replyToken) {
  try {
    return !props.isPostComments
      ? await invidiousGetCommentReplies({ id: props.id, replyToken })
      : await getInvidiousCommunityPostCommentReplies({ postId: props.id, replyToken, authorId: props.postAuthorId })
  } catch (error) {
    console.error(error)
    const errorMessage = t('Invidious API Error (Click to copy)')
    showToast(`${errorMessage}: ${error}`, 10000, () => {
      copyToClipboard(error)
    })
    return null
  } finally {
    isLoading.value = false
  }
}
</script>

<style scoped src="./CommentSection.css" />
