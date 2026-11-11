import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const read = path => readFile(new URL(`../src/renderer/${path}`, import.meta.url), 'utf8')

// La compilación solo avisa (no falla) cuando una vista importa algo que el módulo ya no exporta,
// y el error aparece después en el teléfono. Esta prueba lo detiene antes de publicar.
test('home and Shorts only import API helpers that the Invidious module really exports', async () => {
  const api = await read('helpers/api/invidious.js')
  for (const view of ['views/Popular/Popular.vue', 'views/Shorts/Shorts.vue']) {
    const source = await read(view)
    const match = source.match(/import \{([^}]+)\} from '\.\.\/\.\.\/helpers\/api\/invidious'/)
    assert.ok(match, `${view} importa del módulo de Invidious`)
    for (const name of match[1].split(',').map(item => item.trim()).filter(Boolean)) {
      assert.match(api, new RegExp(`export (async function|function|const) ${name}\\b`), `${name} (usado en ${view}) debe existir`)
    }
  }
})
