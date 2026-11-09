import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'

const template = readFileSync('src/index.ejs', 'utf8')
const bootstrap = [...template.matchAll(/<script>([\s\S]*?)<\/script>/g)]
  .map(match => match[1]).find(source => source.includes('iosStandalone'))

function launch ({ installed = true, measured = 0, height = 956, viewport = 956 } = {}) {
  const classes = new Set()
  const variables = {}
  const root = {
    classList: { add: name => classes.add(name) },
    style: { setProperty: (name, value) => { variables[name] = value } },
    appendChild () {},
    removeChild () {}
  }
  runInNewContext(bootstrap, {
    navigator: { userAgent: 'iPhone', standalone: installed },
    screen: { height, width: 440 },
    window: { innerHeight: viewport, matchMedia: () => ({ matches: installed }) },
    document: {
      documentElement: root,
      createElement: () => ({ style: {}, getBoundingClientRect: () => ({ height: measured }) })
    }
  })
  return { classes, variables }
}

test('Safari tabs keep their existing layout', () => {
  const result = launch({ installed: false })
  assert.equal(result.classes.has('iosStandalone'), false)
  assert.deepEqual(result.variables, {})
})

test('installed iOS with system-reserved status bar does not double its notch inset', () => {
  const result = launch({ viewport: 894 })
  assert.equal(result.classes.has('iosStandalone'), true)
  assert.deepEqual(result.variables, {})
})

test('existing edge-to-edge installation retains safe-area fallback when env is missing', () => {
  assert.equal(launch().variables['--yt-safe-top'], '59px')
  assert.equal(launch().variables['--yt-safe-bottom'], '34px')
})

test('reported safe areas are preserved instead of being overwritten', () => {
  assert.deepEqual(launch({ measured: 62 }).variables, {})
})
