import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
const source = await readFile(new URL('../src/renderer/helpers/webManifest.js', import.meta.url), 'utf8')
const { startWebManifest } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)

test('selected video manifest starts immediately, keeps its original segment base and quality', async () => {
  let requested = false
  const request = startWebManifest('https://example.com/api/manifest/dash/id/song?local=true', async () => {
    requested = true
    return { ok: true, text: async () => '<MPD><Period><Representation height="1080" /></Period></MPD>' }
  })
  assert.equal(requested, true)
  const manifest = decodeURIComponent((await request.ready).split(',')[1])
  assert.match(manifest, /<BaseURL>https:\/\/example.com\/api\/manifest\/dash\/id\/<\/BaseURL>/)
  assert.match(manifest, /height="1080"/)
})
test('HTML service errors are not passed to the video parser and cancelled loads settle', async () => {
  assert.equal(await startWebManifest('https://example.com/song', async () => ({ ok: true, text: async () => '<html>Unavailable</html>' })).ready, null)
  const request = startWebManifest('https://example.com/song', (_url, { signal }) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('cancelled')))))
  request.cancel()
  assert.equal(await request.ready, null)
})
