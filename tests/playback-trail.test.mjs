import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const source = await readFile(new URL('../src/renderer/helpers/playbackTrail.js', import.meta.url), 'utf8')
const { adjacentPlayback, chooseNextVideo, recordPlayback } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)

test('next skips the current video, unavailable IDs and hidden recommendations', () => {
  const videos = [{ videoId: 'current' }, {}, { videoId: 'blocked' }, { videoId: 'next' }]
  assert.equal(chooseNextVideo(videos, 'current', v => v.videoId === 'blocked').videoId, 'next')
  assert.equal(chooseNextVideo([{ videoId: 'current' }], 'current', () => false), undefined)
})

test('next, previous and forward preserve the playback trail instead of leaving the player', () => {
  let trail = recordPlayback({ items: [], index: -1 }, '/watch/first?timestamp=20')
  assert.equal(adjacentPlayback(trail, -1), null)
  trail = recordPlayback(trail, '/watch/second')
  assert.equal(adjacentPlayback(trail, -1), '/watch/first?timestamp=20')
  trail = { ...trail, index: trail.index - 1 }
  trail = recordPlayback(trail, '/watch/first?timestamp=20')
  assert.equal(trail.items.length, 2)
  assert.equal(adjacentPlayback(trail, 1), '/watch/second')
  trail = { ...trail, index: trail.index + 1 }
  assert.deepEqual(recordPlayback(trail, '/watch/second'), trail)
})

test('choosing a new video after going back replaces the forward branch', () => {
  let trail = recordPlayback({ items: ['/watch/first', '/watch/second'], index: 0 }, '/watch/third')
  assert.deepEqual(trail.items, ['/watch/first', '/watch/third'])
  assert.equal(adjacentPlayback(trail, 1), null)
  for (let i = 0; i < 70; i++) trail = recordPlayback(trail, `/watch/video-${i}`)
  assert.equal(trail.items.length, 50)
  assert.equal(trail.index, 49)
})

// Run the real Watch handlers against a router that records playback routes.
const watchSource = await readFile(new URL('../src/renderer/views/Watch/Watch.js', import.meta.url), 'utf8')
const handlersSource = watchSource.slice(watchSource.indexOf('    handleSkipToNext: async function'), watchSource.indexOf('    abortAutoplayCountdown:'))
const handlers = new Function('adjacentPlayback', `return ({${handlersSource}})`)(adjacentPlayback)

test('actual next/previous handlers navigate between tracks and retain forward history', async () => {
  const navigations = []
  const view = {
    ...handlers,
    isLoading: false, skipPending: false, watchingPlaylist: false,
    hideRecommendedVideos: false, nextRecommendedVideo: { videoId: 'second' },
    playbackRoute: { fullPath: '/watch/first' },
    playbackTrail: recordPlayback({ items: [], index: -1 }, '/watch/first'),
    abortAutoplayCountdown() {},
    playbackRouter: {
      async push(target) {
        navigations.push(target)
        view.playbackRoute.fullPath = target
        view.playbackTrail = recordPlayback(view.playbackTrail, target)
      }
    }
  }
  await view.handleSkipToNext()
  assert.equal(view.playbackRoute.fullPath, '/watch/second')
  assert.equal(adjacentPlayback(view.playbackTrail, -1), '/watch/first')
  await view.handleSkipToPrev()
  assert.equal(view.playbackRoute.fullPath, '/watch/first')
  await view.handleSkipToNext()
  assert.deepEqual(navigations, ['/watch/second', '/watch/first', '/watch/second'])
  assert.equal(view.playbackTrail.items.length, 2)
  view.isLoading = true
  await view.handleSkipToNext()
  assert.equal(navigations.length, 3)
})
