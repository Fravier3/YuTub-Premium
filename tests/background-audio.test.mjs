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
  setAttribute() {}
  removeAttribute() {}
  load() {}
  contains(target) { return target === this }
  play() {
    if (this.rejectPlay) return Promise.reject(new Error('NotAllowedError'))
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
async function setup() {
  const audio = new Media()
  const document = new EventTarget()
  document.hidden = false
  document.hasFocus = () => !document.hidden
  document.body = { appendChild() {} }
  document.createElement = () => audio
  globalThis.document = document
  globalThis.window = { HTMLAudioElement: Media }
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
    url: 'https://example.com/audio.mp4', host: { appendChild() {} }, title: 'Song',
    isAudioOnly: () => audioOnly, onReady: value => { ready = value }, onEnded: () => { ended++ }
  })
  return { audio, video, document, controller, ready: () => ready, ended: () => ended, setAudioOnly: value => { audioOnly = value } }
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
