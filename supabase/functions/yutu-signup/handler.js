export function createSignupHandler({ admin, reserve, hash, publicKey }) {
  return async request => {
    const origin = request.headers.get('origin')
    const allowed = origin === 'https://fravier3.github.io'
    const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Vary': 'Origin', ...(allowed ? { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' } : {}) }
    const reply = (status, value) => new Response(JSON.stringify(value), { status, headers })
    if (!allowed) return reply(403, { error: 'Origen no permitido.' })
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers })
    if (request.method !== 'POST') return reply(405, { error: 'Método no permitido.' })
    if (request.headers.get('apikey') !== publicKey) return reply(401, { error: 'Solicitud no válida.' })
    if (!request.headers.get('content-type')?.startsWith('application/json')) return reply(415, { error: 'Formato no válido.' })
    try {
      const reader = request.body?.getReader()
      if (!reader) return reply(400, { error: 'Faltan los datos de registro.' })
      let length = 0
      let text = ''
      const decoder = new TextDecoder()
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        length += value.byteLength
        if (length > 8192) { await reader.cancel(); return reply(413, { error: 'Solicitud demasiado grande.' }) }
        text += decoder.decode(value, { stream: true })
      }
      text += decoder.decode()
      let body
      try { body = JSON.parse(text) } catch { return reply(400, { error: 'Datos de registro no válidos.' }) }
      const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''
      const password = body?.password
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || typeof password !== 'string' || password.length < 8 || password.length > 128) return reply(400, { error: 'Escribe un correo válido y una contraseña de 8 a 128 caracteres.' })
      const network = (request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown').split(',')[0].trim()
      if (!await reserve(await hash(network), await hash(email))) return reply(429, { error: 'Demasiados intentos. Intenta más tarde.' })
      // Create only new Yutu users. Never confirm, reset or modify an existing account.
      const { error } = await admin.createUser({ email, password, email_confirm: true, app_metadata: { signup_app: 'yutu' } })
      if (error) return reply(409, { error: 'No se pudo crear la cuenta. Si ya existe, inicia sesión con tu contraseña.' })
      return reply(201, { created: true })
    } catch { return reply(503, { error: 'No se pudo crear la cuenta ahora. Intenta nuevamente.' }) }
  }
}
