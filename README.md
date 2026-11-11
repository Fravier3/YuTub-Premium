# Yutu Premium

App de video sin anuncios ni rastreo, con interfaz estilo YouTube, para **iPhone y PC**.

Está construida sobre el código de [FreeTube](https://github.com/FreeTubeApp/FreeTube) (build web), con:

- Marca nueva (logo Y + P en el triángulo de play) y nombre *Yutu Premium*
- Tema claro/oscuro con los colores de YouTube, buscador en píldora, tarjetas de video con esquinas redondeadas
- Móvil: miniaturas a todo el ancho, barra inferior de navegación, zonas seguras del iPhone (notch y barra inferior)
- PWA instalable con auto-actualización (revisa al abrir, al volver a la app y cada 45 min)
- Página inicial personalizada: *Para ti* según lo que buscas y ves, solo en español y distinta cada vez que entras
- Shorts a pantalla completa y Suscripciones con tira de canales y fichas (Todos, Hoy, Videos, Shorts, En tiempo real)
- Idioma de la interfaz automático según el dispositivo (incluye español)

## Desarrollo

```
pnpm install --frozen-lockfile
pnpm run dev:web      # servidor local
pnpm run pack:web     # build de producción en dist/web
```

## Publicar (GitHub Pages)

1. Fusiona esta rama a `main`.
2. Settings → Pages → Source: **GitHub Actions**.
3. El workflow `.github/workflows/deploy-pages.yml` compila y publica en `https://fravier3.github.io/YuTub-Premium/`.

Para que la actualización llegue sola a los teléfonos, sube `VERSION` en `static/pwabuilder-sw.js` en cada publicación.

## Instalar

- iPhone: Safari → Compartir → Añadir a pantalla de inicio.
- PC/Android: icono de instalar en Chrome/Edge.

## Licencia

AGPL-3.0-or-later, igual que FreeTube. Ver `LICENSE`.
