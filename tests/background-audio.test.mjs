import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
const source = await readFile(new URL('../src/renderer/helpers/backgroundAudio.js', import.meta.url), 'utf8')
class Media extends EventTarget {
  paused = true
  ended = false
  muted = false
  volume = 1
  playbackRate = 1
  currentTime = 0
  style = {}
  rejectPlay = false
  rejectSources = new Set()
  setAttribute() {}
  removeAttribute() {}
  load() {}
  contains(target) { return target === this }
  play() {
    if (this.rejectPlay) return Promise.reject(Object.assign(new Error('Blocked'), { name: 'NotAllowedError' }))
    if (this.rejectSources.has(this.src)) return Promise.reject(Object.assign(new Error('Format failed'), { name: 'NotSupportedError' }))
    const wasPaused = this.paused
    this.paused = false
    if (wasPaused) this.dispatchEvent(new Event('play'))
    return Promise.resolve()
  }
  pause() {
    if (this.paused) return
    this.paused = true
    this.dispatchEvent(new Event('pause'))
  }
}
async function setup(options = {}) {
  const audio = new Media()
  const document = new EventTarget()
  document.hidden = false
  document.hasFocus = () => !document.hidden
  document.body = { appendChild() {} }
  document.createElement = () => audio
  globalThis.document = document
  globalThis.window = new EventTarget()
  window.HTMLAudioElement = Media
  const mediaSession = { setActionHandler() {} }
  Object.defineProperty(globalThis, 'navigator', { value: { mediaSession }, configurable: true })
  globalThis.MediaMetadata = class { constructor(data) { Object.assign(this, data) } }
  const mod = await import(`data:text/javascript;base64,${Buffer.from(source + `\n//${Math.random()}`).toString('base64')}`)
  const video = new Media()
  video.currentTime = 42
  let ready = false
  let ended = 0
  let audioOnly = false
  const controller = mod.connectContinuousAudio(video, {
    url: 'https://example.com/audio.mp4', urls: options.urls ?? [], host: { appendChild() {} }, title: 'Song',
    isAudioOnly: () => audioOnly, onReady: value => { ready = value }, onEnded: () => { ended++ }
  })
  return { audio, video, document, controller, module: mod, setVideoState: mod.setVideoMediaSessionPlaybackState, ready: () => ready, ended: () => ended, setAudioOnly: value => { audioOnly = value } }
}
const tick = () => new Promise(resolve => setImmediate(resolve))
test('same audible stream survives minimizing and resynchronizes on return', async () => {
  const x = await setup()
  await x.video.play(); await tick()
  assert.equal(x.ready(), true)
  assert.equal(x.audio.currentTime, 42)
  assert.equal(x.video.muted, true)
  assert.equal(x.audio.paused, false)
  x.document.hidden = true
  x.document.dispatchEvent(new Event('visibilitychange'))
  assert.equal(x.video.paused, true)
  assert.equal(x.audio.paused, false)
  x.audio.currentTime = 65
  x.document.hidden = false
  x.document.dispatchEvent(new Event('visibilitychange'))
  await tick()
  assert.equal(x.video.paused, false)
  assert.equal(x.video.currentTime, 65)
  x.video.pause()
  await new Promise(resolve => setTimeout(resolve, 350))
  assert.equal(x.audio.paused, true)
  x.controller.dispose()
  assert.equal(x.video.muted, false)
})
test('lock-screen pause is respected and audio-only mode keeps sound after visual pause', async () => {
  const x = await setup()
  await x.video.play(); await tick()
  x.setAudioOnly(true)
  await x.controller.setAudioOnly(true)
  assert.equal(x.video.paused, true)
  assert.equal(x.audio.paused, false)
  x.document.hidden = true
  x.document.dispatchEvent(new Event('visibilitychange'))
  x.audio.pause()
  x.document.hidden = false
  x.document.dispatchEvent(new Event('visibilitychange'))
  assert.equal(x.video.paused, true)
  x.controller.dispose()
})
test('autoplay rejection restores video audio and explicit activation can retry', async () => {
  const x = await setup()
  x.audio.rejectPlay = true
  await x.video.play(); await tick()
  assert.equal(x.video.muted, false)
  assert.equal(x.ready(), false)
  x.audio.rejectPlay = false
  assert.equal(await x.controller.start(), true)
  assert.equal(x.ready(), true)
  x.audio.dispatchEvent(new Event('ended'))
  x.audio.dispatchEvent(new Event('ended'))
  assert.equal(x.ended(), 1)
  x.controller.dispose()
})

test('iOS may pause video before visibilitychange without pausing the audio stream', async () => {
  const x = await setup()
  await x.video.play(); await tick()
  // WebKit can emit this while hidden=false and hasFocus() still returns true.
  x.video.pause()
  assert.equal(x.audio.paused, false)
  x.document.hidden = true
  x.document.dispatchEvent(new Event('visibilitychange'))
  await new Promise(resolve => setTimeout(resolve, 350))
  assert.equal(x.audio.paused, false)
  assert.equal(navigator.mediaSession.playbackState, 'playing')
  x.controller.dispose()
})

test('visual pause/end cannot overwrite an audible Media Session', async () => {
  const x = await setup()
  await x.video.play(); await tick()
  x.setVideoState('paused')
  assert.equal(navigator.mediaSession.playbackState, 'playing')
  x.setVideoState('none')
  assert.equal(navigator.mediaSession.playbackState, 'playing')
  x.audio.pause()
  x.setVideoState('paused')
  assert.equal(navigator.mediaSession.playbackState, 'paused')
  x.controller.dispose()
})

test('Play gesture starts native audio before the visual player consumes the click', async () => {
  const x = await setup()
  const playButton = { getAttribute: () => 'Play' }
  const event = new Event('click')
  Object.defineProperty(event, 'target', { value: { closest: () => playButton } })
  x.document.dispatchEvent(event)
  assert.equal(x.audio.paused, false)
  await tick()
  assert.equal(x.ready(), true)
  x.controller.dispose()
})

test('technical video mute is not the user mute and unmute cannot mute native audio', async () => {
  const x = await setup()
  await x.video.play(); await tick()
  assert.equal(x.video.muted, true)
  assert.equal(x.module.getVideoAudioState(x.video).muted, false)
  x.video.muted = false
  x.video.dispatchEvent(new Event('volumechange'))
  assert.equal(x.audio.muted, false)
  assert.equal(x.module.getVideoAudioState(x.video).muted, false)
  x.module.setVideoAudioMuted(x.video, true)
  assert.equal(x.audio.muted, true)
  x.module.setVideoAudioMuted(x.video, false)
  assert.equal(x.audio.muted, false)
  x.controller.dispose()
  assert.equal(x.video.muted, false)
})
test('unsupported audio stream falls back to a muxed stream without losing sound', async () => {
  const x = await setup({ urls: ['https://example.com/combined.mp4'] })
  x.audio.rejectSources.add('https://example.com/audio.mp4')
  await x.video.play(); await tick()
  assert.equal(x.audio.src, 'https://example.com/combined.mp4')
  assert.equal(x.ready(), true)
  assert.equal(x.audio.muted, false)
  x.controller.dispose()
})
test('total stream failure restores the original video sound and leaves no audio owner', async () => {
  const x = await setup()
  x.audio.rejectSources.add('https://example.com/audio.mp4')
  await x.video.play(); await tick()
  assert.equal(x.ready(), false)
  assert.equal(x.video.muted, false)
  assert.equal(x.video.paused, false)
  assert.equal(x.controller.ownsAudio(), false)
  x.controller.dispose()
})
test('old forced mute is repaired once; later intentional mute preferences are preserved', async () => {
  const x = await setup()
  const values = new Map([['muted', 'true']])
  const storage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) }
  x.module.repairStoredMutePreference(storage)
  assert.equal(values.has('muted'), false)
  storage.setItem('muted', 'true')
  x.module.repairStoredMutePreference(storage)
  assert.equal(values.get('muted'), 'true')
  x.controller.dispose()
})
test('stream selection uses supported alternatives and muxed MP4 instead of requiring AAC', async () => {
  const x = await setup()
  const formats = [
    { type: 'audio/webm', url: 'opus', bitrate: 128000 },
    { type: 'audio/mp4', url: 'aac', bitrate: 64000 },
    { type: 'audio/unknown', url: 'unsupported' }
  ]
  const muxed = [{ type: 'video/mp4', url: 'combined', resolution: '360p' }]
  assert.deepEqual(x.module.pickAudioSources(formats, muxed, type => !type.includes('unknown')), ['aac', 'opus', 'combined'])
  assert.deepEqual(x.module.pickAudioSources([], muxed, () => true), ['combined'])
  x.controller.dispose()
})
