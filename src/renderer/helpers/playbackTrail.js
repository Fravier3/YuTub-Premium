/** A playback-only trail. Never send the user back to a search/settings route. */
export function recordPlayback(trail, fullPath) {
  if (trail.items[trail.index] === fullPath) return trail
  const items = [...trail.items.slice(0, trail.index + 1), fullPath].slice(-50)
  return { items, index: items.length - 1 }
}

export function adjacentPlayback(trail, direction) {
  return trail.items[trail.index + direction] || null
}

export function chooseNextVideo(videos, currentId, isHidden) {
  return videos.find(video => video.videoId && video.videoId !== currentId && !isHidden(video))
}
