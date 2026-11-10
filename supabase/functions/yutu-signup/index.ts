import { createClient } from 'npm:@supabase/supabase-js@2.119.0'
import { createSignupHandler } from './handler.js'
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const client = createClient(Deno.env.get('SUPABASE_URL')!, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
const hashKey = crypto.subtle.importKey('raw', new TextEncoder().encode(serviceKey), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
const handler = createSignupHandler({
  admin: client.auth.admin,
  publicKey: 'sb_publishable_t_BJFV9l8tQvcPhZlTnLlg_5fYZJCwB',
  hash: async (value: string) => {
    const signature = await crypto.subtle.sign('HMAC', await hashKey, new TextEncoder().encode(`yutu-signup:${value}`))
    return Array.from(new Uint8Array(signature), byte => byte.toString(16).padStart(2, '0')).join('')
  },
  reserve: async (network: string, email: string) => {
    const { data, error } = await client.rpc('yutu_reserve_signup', { p_network: network, p_email: email })
    if (error) throw error
    return data === true
  }
})
Deno.serve(handler)
