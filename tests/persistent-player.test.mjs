import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRenderer, defineComponent, h, nextTick, onBeforeUnmount, ref } from 'vue'
import { routerKey } from 'vue-router'
import { parse, compileScript } from 'vue/compiler-sfc'

const dataModule = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
const helperSource = await readFile(new URL('../src/renderer/helpers/persistentPlayback.js', import.meta.url), 'utf8')
const helperUrl = dataModule(helperSource)
const { snapshotPlaybackRoute, isWatchLocation, enterVideoPictureInPicture, supportsVideoPictureInPicture } = await import(helperUrl)
const route = id => ({ path: `/watch/${id}`, fullPath: `/watch/${id}`, params: { id }, query: {}, meta: {}, matched: [] })

test('the playing route remains independent while browsing changes the live route', () => {
  const live = route('song')
  const playing = snapshotPlaybackRoute(live)
  live.path = '/search/another'
  live.params.id = 'another'
  live.query.q = 'search'
  assert.equal(playing.params.id, 'song')
  assert.deepEqual(playing.query, {})
  assert.equal(isWatchLocation(playing), true)
  assert.equal(isWatchLocation(live), false)
})

test('PiP uses the same existing video and respects Safari reporting no support', async () => {
  let calls = 0
  const video = { readyState: 4, paused: false, webkitSupportsPresentationMode: () => true, webkitSetPresentationMode: mode => { assert.equal(mode, 'picture-in-picture'); calls++ } }
  await enterVideoPictureInPicture(video, {})
  assert.equal(calls, 1)
  video.webkitSupportsPresentationMode = () => false
  assert.equal(supportsVideoPictureInPicture(video, { pictureInPictureEnabled: true }), false)
  assert.throws(() => enterVideoPictureInPicture(video, {}), /PiP unavailable/)
  const standard = { readyState: 4, paused: false, requestPictureInPicture: async () => { calls++ } }
  await enterVideoPictureInPicture(standard, { pictureInPictureEnabled: true })
  assert.equal(calls, 2)
})

// Compile the actual dock component. Stub only the heavy Watch view/network and
// labels, so this test catches real remounts and close/control regressions.
const { descriptor } = parse(await readFile(new URL('../src/renderer/components/PersistentWatch/PersistentWatch.vue', import.meta.url), 'utf8'))
let compiled = compileScript(descriptor, { id: 'dock-test', inlineTemplate: true }).content
compiled = compiled
  .replace(/import Watch from [^\n]+/, 'const Watch = globalThis.__dockTestWatch')
  .replace(/import \{ useI18n \} from [^\n]+/, 'const useI18n = () => ({ t: key => key })')
  .replace(/import \{ FontAwesomeIcon \} from [^\n]+/, 'const FontAwesomeIcon = { render: () => null }')
  .replace(/import \{ faClone, faPause, faPlay, faXmark \} from [^\n]+/, 'const faClone = {}, faPause = {}, faPlay = {}, faXmark = {}')
  .replace(/from ['"]\.\.\/\.\.\/helpers\/persistentPlayback['"]/g, `from '${helperUrl}'`)
  .replace(/import \{ showToast \} from [^\n]+/, 'const showToast = () => {}')
  .replace(/from ['"]vue['"]/g, `from '${import.meta.resolve('vue')}'`)
  .replace(/from ['"]vue-router['"]/g, `from '${import.meta.resolve('vue-router')}'`)

function makeNode(tag) {
  return {
    tag, children: [], props: {}, parent: null, paused: false, ended: false, readyState: 4,
    pause() { this.paused = true }, play() { this.paused = false; return Promise.resolve() },
    querySelector(selector) { return find(this, node => node.tag === selector) }
  }
}
function find(node, predicate) {
  if (predicate(node)) return node
  for (const child of node.children ?? []) {
    const match = find(child, predicate)
    if (match) return match
  }
}
const renderer = createRenderer({
  createElement: makeNode,
  createText: text => Object.assign(makeNode('#text'), { text }),
  createComment: text => Object.assign(makeNode('#comment'), { text }),
  setText: (node, text) => { node.text = text },
  setElementText: (node, text) => { node.text = text; node.children = [] },
  patchProp: (node, key, before, after) => { node.props[key] = after },
  parentNode: node => node.parent,
  nextSibling: node => node.parent?.children[node.parent.children.indexOf(node) + 1] ?? null,
  insert(node, parent, anchor = null) {
    if (node.parent) node.parent.children.splice(node.parent.children.indexOf(node), 1)
    const index = anchor ? parent.children.indexOf(anchor) : -1
    if (index < 0) parent.children.push(node)
    else parent.children.splice(index, 0, node)
    node.parent = parent
  },
  remove(node) {
    if (node.parent) node.parent.children.splice(node.parent.children.indexOf(node), 1)
    node.parent = null
  }
})

test('minimizing, browsing, expanding and controls retain exactly one video element', async () => {
  let mounts = 0
  let unmounts = 0
  let stopped = 0
  let playbackRouter
  globalThis.document = { pictureInPictureEnabled: false }
  globalThis.window = { scrollY: 321, scrollTo() {} }
  globalThis.__dockTestWatch = defineComponent({
    props: ['routeOverride', 'navigationRouter', 'minimized'],
    setup(props, { expose, slots }) {
      mounts++
      playbackRouter = props.navigationRouter
      onBeforeUnmount(() => { unmounts++ })
      expose({ videoTitle: 'Current song', stopPersistentPlayback: async () => { stopped++ } })
      return () => h('div', { class: 'videoLayout' }, [h('video', { id: props.routeOverride.params.id }), slots['player-overlay']?.()])
    }
  })
  const Dock = (await import(dataModule(compiled))).default
  const minimized = ref(false)
  const playbackRoute = ref(route('song'))
  const open = ref(true)
  const navigations = []
  const router = { resolve: target => typeof target === 'string' ? { ...route(target.split('/').pop()), fullPath: target } : { ...route(target.path.split('/').pop()), ...target }, push: async target => { navigations.push(target) }, replace: async () => {} }
  const root = makeNode('root')
  const app = renderer.createApp({ render: () => open.value ? h(Dock, { playbackRoute: playbackRoute.value, minimized: minimized.value, onClose: () => { open.value = false }, onBrowse: () => { minimized.value = true }, onNavigate: value => { playbackRoute.value = value } }) : null })
  app.provide(routerKey, router)
  app.mount(root)
  await nextTick(); await nextTick()
  const video = find(root, node => node.tag === 'video')
  video.currentTime = 123
  const minimize = find(root, node => node.props['aria-label'] === 'Playback Dock.Explore')
  minimize.props.onClick({ stopPropagation() {} })
  await nextTick()
  assert.equal(find(root, node => node.tag === 'video'), video)
  assert.equal(mounts, 1)
  const pause = find(root, node => node.props['aria-label'] === 'Playback Dock.Pause')
  pause.props.onClick()
  assert.equal(video.paused, true)
  const expand = find(root, node => node.props.class === 'miniVideoHitTarget')
  assert.ok(expand, 'the mini video itself is an expand target')
  await expand.props.onClick({ stopPropagation() {} })
  assert.deepEqual(navigations, ['/watch/song'])
  minimized.value = false
  await nextTick()
  assert.equal(find(root, node => node.tag === 'video'), video)
  assert.equal(video.currentTime, 123)
  minimized.value = true
  await nextTick()
  await playbackRouter.push({ path: '/watch/next-song' })
  await nextTick(); await nextTick()
  assert.equal(playbackRoute.value.params.id, 'next-song')
  assert.deepEqual(navigations, ['/watch/song'])
  assert.equal(mounts, 1)
  const close = find(root, node => node.props['aria-label'] === 'Playback Dock.Close')
  await close.props.onClick()
  await nextTick()
  assert.equal(stopped, 1)
  assert.equal(unmounts, 1)
  assert.equal(find(root, node => node.tag === 'video'), undefined)
  app.unmount()
})
