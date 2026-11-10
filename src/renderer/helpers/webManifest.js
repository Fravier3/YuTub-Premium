/** One selected-video request, never speculative downloads of recommendations. */
export function startWebManifest(url, fetcher = fetch) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 12000)
  const ready = fetcher(url, { signal: controller.signal })
    .then(response => response.ok ? response.text() : null)
    .then(text => {
      if (!text || !/<MPD[\s>]/.test(text)) return null
      // data: manifests need the original resolution base for relative segments.
      const base = new URL('.', url).href.replaceAll('&', '&amp;')
      const manifest = /<MPD[^>]*>\s*<BaseURL/.test(text)
        ? text
        : text.replace(/(<MPD[^>]*>)/, `$1<BaseURL>${base}</BaseURL>`)
      return `data:application/dash+xml;charset=UTF-8,${encodeURIComponent(manifest)}`
    })
    .catch(() => null)
    .finally(() => clearTimeout(timer))
  return { ready, cancel: () => { clearTimeout(timer); controller.abort() } }
}
