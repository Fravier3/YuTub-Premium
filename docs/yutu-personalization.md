# Yutu 1.0.30

Mejoras tomadas de lo que ofrece Invidious, sin cambios de diseño (solo app web).

**Suscripciones sincronizadas con la cuenta.** Con sesión iniciada, las suscripciones del perfil principal se guardan en la columna nueva `yutu_user_state.subscriptions` (mismas políticas: cada usuario solo lee y escribe su fila). Cada canal lleva la hora de su último cambio y una marca de baja; al fusionar gana el cambio más reciente por canal (`helpers/subscriptionMerge.js`), así una baja llega a los demás dispositivos y una suscripción nunca se pierde por faltar en una copia. Se sincroniza al iniciar sesión, al suscribirse o darse de baja, al volver a la app y al recuperar conexión. Si la app aparece sin suscripciones pero el registro tenía tres o más, se asume que se borraron los datos del navegador y la nube las devuelve. Sin sesión todo sigue en el dispositivo. En un dispositivo compartido, las suscripciones locales se suman a la cuenta que inicie sesión. Las listas de reproducción y los perfiles secundarios no se sincronizan.

**Suscripciones al instante.** Si hay copia guardada de todos los canales, la pantalla la muestra de inmediato y la actualización ocurre detrás.

Corrige además que suscribirse desde un Short sin foto de canal cargada no hacía nada.

No incluido, porque necesita un servidor propio: instancia de Invidious propia, feed armado por el servidor y notificaciones de videos nuevos con la app cerrada.

# Yutu 1.0.29

Miniaturas más rápidas en la app web: cada tarjeta muestra primero `mqdefault` (ligera y siempre disponible) y, cuando ya está en pantalla, descarga la HD (`hq720`, luego `maxresdefault`) y la sustituye. Antes se pedía la HD directamente y, si no existía, se probaban calidades una tras otra antes de mostrar nada. Además se abre la conexión con el servidor al arrancar y las seis primeras miniaturas de la portada se piden antes de dibujar la lista. Las miniaturas siguen pasando por el servidor de Yutu, no por YouTube.

# Yutu 1.0.28

- Corrige "TypeError: i is not a function" en la portada: al reescribir la reproducción de Shorts (1.0.27) se había eliminado `relatedHomeVideos`. `tests/web-api-exports.test.mjs` comprueba ahora que la portada y Shorts solo importen funciones que existen, porque la compilación solo avisa.
- Shorts más rápidos: Shaka precarga el manifiesto y el comienzo de los dos Shorts siguientes; se arranca con medio segundo en memoria y una primera calidad ligera que sube sola; y al entrar se muestran al instante los Shorts que quedaron sin ver en la visita anterior mientras la tanda nueva se pide detrás.
- La interfaz de la app web sale en español aunque el dispositivo esté en otro idioma (se puede cambiar a mano en Configuración).

# Yutu 1.0.26

## Solo español, "Para ti" por búsquedas, Shorts y Suscripciones (app web)

Nada de esto toca la versión de Android TV: todo queda detrás de `!process.env.YUTU_TV && !process.env.IS_ELECTRON`.

**Solo español.** `helpers/spanishFilter.js` decide el idioma por el texto (letras propias del español y palabras frecuentes de cada idioma; la descripción solo desempata). Lo que la app sugiere por su cuenta —portada, Shorts y relacionados de un video— pasa por ese filtro. Un título sin pistas ("Bad Bunny - DtMF") solo se acepta si su canal ya publicó títulos en español o es un canal musical oficial. No se filtra lo que el usuario busca a propósito, ni los relacionados de un video que ya está en otro idioma, ni sus suscripciones. Es una heurística: puede colarse algún título ambiguo o descartarse uno válido.

**Para ti.** La señal principal son las búsquedas del usuario (`identity.searches`, hasta 30, guardadas por usuario en el dispositivo; no se suben a la nube). Se eligen al azar hasta tres de las últimas ocho; a una búsqueda sin idioma claro se le añade "español" y una búsqueda escrita en inglés se respeta sin filtrar. Los relacionados de lo último visto completan la sección. Borrar el historial de búsqueda también borra estas señales.

**Portada distinta cada vez.** `loadHomeRecommendations` devuelve reservas más grandes que lo que cabe en pantalla y `pickHomeSections` saca una selección al azar que evita lo mostrado en aperturas anteriores (se recuerdan 300 ids por usuario). Con reserva válida la portada aparece al instante y la reserva se renueva detrás; si cambian las búsquedas o ya salió casi todo, se pide una nueva. Volver a la app tras más de dos minutos cuenta como entrar otra vez.

**Shorts** (`/shorts`, botón de la barra inferior y del menú lateral). Feed vertical a pantalla completa con ajuste por tarjeta, un único `<video>` que se muda a la tarjeta activa (así iOS conserva el sonido ya permitido), fondo desenfocado, acciones a la derecha y canal + Suscribirse + título abajo. Los videos salen de búsquedas `#shorts` en español mezcladas con las del usuario, con duración máxima de 3 minutos. Desde 1.0.27 se reproducen como el reproductor principal: manifiesto DASH del servidor con Shaka (calidad adaptativa); el formato combinado de la API queda como respaldo, porque el servidor actual no lo ofrece y por eso en 1.0.26 ningún Short arrancaba. Las miniaturas que llegan como marcador gris de 120x90 se sustituyen por la siguiente calidad. "Me gusta" se guarda solo en el dispositivo; "Comentar" abre el video completo; no hay Remix.

**Suscripciones.** Cabecera estilo YouTube: tira de canales (punto azul si publicaron en 24 h) con enlace "Todos" a la lista de canales, y fichas Todos / Hoy / Videos / Shorts / En tiempo real / Publicaciones. "Todos" y "Hoy" suman a los videos los shorts y directos que ya estén cargados.

Validado con pruebas de Node y con un navegador automatizado (iPhone emulado y PC) contra una API simulada: el servidor de video real no es accesible desde el entorno de desarrollo, así que la reproducción real de Shorts y el autoplay con sonido en iPhone quedan por comprobar en el dispositivo.

# Yutu 1.0.23

## Mobile playback

The original video element remains mounted. The video grid cell sticks below the iOS safe area while the document below it scrolls. Vertical drags on the image are claimed after direction detection and suppress Shaka touchend/click handling. Sliders and control buttons are excluded, so actual seeking continues to work. Horizontal gestures are not interpreted as minimization.

The image scales with finger movement and settles into a 220px draggable dock with Motion mini (the animation engine used by Cult UI), rather than bringing React components into Vue. Reduced motion disables the settling animation. No separate audio element or mute switching is added.

## Personalized Home

Related videos from the last two watched items supply personal signals. Dedicated Spanish podcast, trailer, and rotating Latin artist searches supply variety. Already-watched and duplicate items are excluded. The music section requires an exact artist/VEVO channel allowlist plus verification/VEVO channel signal; title claims such as “official” on a compilation do not qualify. Provider metadata determines these signals; this is not YouTube's proprietary recommendation engine.

A per-user local cache shows the last successful Home while refreshing. Guest and signed-in caches use different keys. Guests migrate existing device history once. Deleting existing app history also removes the corresponding personal signals.

All standard video thumbnails request hq720 with bounded fallbacks through maxres, sd, hq and mq. Successful low-resolution placeholder responses also trigger fallback. User-selected hidden/start/middle/end modes remain respected. Images retain their aspect ratio.

## Optional accounts

Supabase project: Desarollos Fran (`syyealdlapxmpeccaary`). Only `public.yutu_user_state` was added, with owner-only SELECT/INSERT/UPDATE/DELETE policies, foreign key to Auth, explicit authenticated grants, no anon privileges, bounded JSON payload sizes, and RLS enabled. Existing app tables, policies and global Auth settings were not modified. The frontend uses the project's publishable key, not a privileged key.

Without login, profile and last 100 personal recommendation signals remain in localStorage. Uploaded photos are decoded, centered into a 256px JPEG, and saved only when the user saves the profile. Built-in avatar choices store an asset ID. Guest data is separate from each signed-in user's local data. On first account use, guest data seeds an empty account; existing accounts load their own profile/history. Cloud failures retain the device copy and offer retry; connectivity recovery retries sync.

Login and signup use the existing email/password provider. Email confirmation remains enabled. No automatic anonymous Supabase accounts, device fingerprinting, global email template changes, or project Auth redirects were introduced. Cloud history is for recommendations; full legacy history/playlists are not migrated to another service.

Avatars: built-in puppy retained; three new generated photorealistic studio images (astronaut with blue/pink smoke, adult queen in red evening gown, glossy sport motorcycle) optimized to 384px WebP. Generation used the built-in image tool. The images are illustrative, not photographs of identified real people.

## Validation limits

21 Node tests cover gesture ownership, progressive scale, unchanged video/currentTime, navigation, feed diversity/filtering, local persistence, account isolation and offline saves. Edited source lint, stylesheet lint and production webpack build are required. Live Supabase policies/grants were verified read-only; synthetic Auth-user tests were rejected by automatic approval review and were not executed. Live iPhone gesture behavior and real account email confirmation require device/user verification. The external video API is inaccessible from this cloud environment; no streaming-speed guarantee is made.
