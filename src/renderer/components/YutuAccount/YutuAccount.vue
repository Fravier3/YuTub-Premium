<!-- eslint-disable @intlify/vue-i18n/no-raw-text -->
<template>
  <Teleport to="body">
    <div
      v-if="identity.open"
      class="accountBackdrop"
      @click.self="identity.open = false"
      @keydown.esc="identity.open = false"
    >
      <section
        class="yutuAccount"
        role="dialog"
        aria-modal="true"
        aria-labelledby="yutuAccountTitle"
        @keydown.esc="identity.open = false"
      >
        <header>
          <h2 id="yutuAccountTitle">
            Tu perfil
          </h2><button
            type="button"
            aria-label="Cerrar perfil"
            @click="identity.open = false"
          >
            ×
          </button>
        </header>
        <img
          class="accountPortrait"
          :src="preview"
          alt="Foto del perfil"
        >
        <form @submit.prevent="save">
          <label>Nombre de usuario<input
            v-model="draft.name"
            maxlength="50"
            required
            autocomplete="nickname"
          ></label>
          <div
            class="avatarChoices"
            role="group"
            aria-label="Escoge tu imagen"
          >
            <button
              v-for="avatar in avatarOptions"
              :key="avatar.key"
              type="button"
              :aria-label="avatar.name"
              :aria-pressed="draft.avatar === avatar.key"
              @click="draft.avatar = avatar.key"
            >
              <img
                :src="avatar.image"
                :alt="avatar.name"
              >
            </button>
          </div>
          <label class="uploadAvatar">Cargar mi foto<input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic"
            @change="upload"
          ></label>
          <p
            v-if="imageError"
            role="alert"
          >
            {{ imageError }}
          </p>
          <button
            class="accountPrimary"
            type="submit"
          >
            Guardar perfil
          </button>
        </form>
        <p
          class="accountStatus"
          role="status"
        >
          {{ identity.status || 'Sin cuenta: tu perfil y recomendaciones se guardan en este dispositivo.' }}
        </p>
        <p
          v-if="identity.error"
          role="alert"
        >
          {{ identity.error }}
        </p>
        <div
          v-if="identity.user"
          class="cloudAccount"
        >
          <p>{{ identity.user.email }}</p><button
            type="button"
            @click="syncAccount"
          >
            Sincronizar ahora
          </button><button
            type="button"
            @click="signOutAccount"
          >
            Cerrar sesión
          </button>
        </div>
        <details
          v-else
          class="cloudAccount"
        >
          <summary>Iniciar sesión o crear cuenta · opcional</summary>
          <p>Guarda tu perfil y tus últimos 100 videos para llevar tus recomendaciones a otro dispositivo.</p>
          <form @submit.prevent="login">
            <label>Correo electrónico<input
              v-model="email"
              type="email"
              required
              autocomplete="email"
            ></label>
            <label>Contraseña<input
              v-model="password"
              type="password"
              minlength="8"
              required
              :autocomplete="creating ? 'new-password' : 'current-password'"
            ></label>
            <label class="createAccountChoice"><input
              v-model="creating"
              type="checkbox"
            >Crear una cuenta nueva</label>
            <button
              class="accountPrimary"
              type="submit"
              :disabled="identity.busy"
            >
              {{ identity.busy ? 'Conectando…' : creating ? 'Crear cuenta' : 'Iniciar sesión' }}
            </button>
          </form>
        </details>
      </section>
    </div>
  </Teleport>
</template>
<script setup>

import { computed, reactive, ref, watch } from 'vue'
import { avatarOptions, identity, saveProfile, authenticate, syncAccount, signOutAccount } from '../../helpers/yutuIdentity'
const draft = reactive({ ...identity.profile })
const email = ref('')
const password = ref('')
const creating = ref(false)
const imageError = ref('')
const preview = computed(() => draft.avatar === 'custom' && draft.custom ? draft.custom : avatarOptions.find(a => a.key === draft.avatar)?.image || avatarOptions[0].image)
watch(() => identity.open, open => { if (open) Object.assign(draft, identity.profile); else password.value = '' })
watch(() => identity.profile, value => Object.assign(draft, value))
function save() { saveProfile(draft) }
async function login() { await authenticate(email.value.trim(), password.value, creating.value); password.value = '' }
async function upload(event) {
  const file = event.target.files?.[0]
  if (!file) return
  imageError.value = ''
  if (file.size > 20 * 1024 * 1024) { imageError.value = 'Escoge una imagen de menos de 20 MB.'; return }
  const url = URL.createObjectURL(file)
  try {
    const image = new Image()
    image.src = url
    await image.decode()
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 256
    const size = Math.min(image.naturalWidth, image.naturalHeight)
    canvas.getContext('2d').drawImage(image, (image.naturalWidth - size) / 2, (image.naturalHeight - size) / 2, size, size, 0, 0, 256, 256)
    draft.custom = canvas.toDataURL('image/jpeg', 0.88)
    draft.avatar = 'custom'
  } catch { imageError.value = 'No pudimos abrir esa imagen. Intenta con una foto JPG, PNG o WebP.' } finally { URL.revokeObjectURL(url); event.target.value = '' }
}
</script>
<style scoped src="./YutuAccount.css" />
