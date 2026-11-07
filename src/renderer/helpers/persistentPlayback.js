/** Keep an independent route snapshot: browsing must not retarget the playing video. */
export function isWatchLocation(route) {
  return /^\/watch\/[^/]+\/?$/.test(route.path ?? '')
}

export function snapshotPlaybackRoute(route) {
  return {
    ...route,
    params: { ...route.params },
    query: { ...route.query },
    meta: { ...route.meta },
    matched: [...(route.matched ?? [])]
  }
}

export function supportsVideoPictureInPicture(video, doc = document) {
  if (!video || video.readyState < 1 || video.disablePictureInPicture) return false
  if (typeof video.webkitSupportsPresentationMode === 'function') {
    return !!video.webkitSupportsPresentationMode('picture-in-picture')
  }
  return !!doc.pictureInPictureEnabled && typeof video.requestPictureInPicture === 'function'
}

/** Must run directly from the user's click; never create another media element. */
export function enterVideoPictureInPicture(video, doc = document) {
  if (!supportsVideoPictureInPicture(video, doc)) throw new Error('PiP unavailable')
  if (video.paused) video.play().catch(() => {})
  if (typeof video.webkitSetPresentationMode === 'function') {
    video.webkitSetPresentationMode('picture-in-picture')
    return Promise.resolve()
  }
  return video.requestPictureInPicture()
}
