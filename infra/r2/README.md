# infra/r2 — Almacenamiento de archivos e imágenes

## Buckets

| Bucket          | Uso                                  | Acceso                          |
| --------------- | ------------------------------------ | ------------------------------- |
| `starter-media` | Imágenes de publicaciones / galería  | Lectura pública vía Worker o CDN |

Crear el bucket:

```bash
wrangler r2 bucket create starter-media
```

## Convención de keys (claves)

Las keys se generan SIEMPRE con los helpers de `@starter/config` (`src/r2.ts`),
nunca a mano:

```
publications/<publicationId>/<fileId>.<ext>   # imágenes de una publicación
uploads/<yyyy>/<mm>/<fileId>.<ext>            # subidas genéricas
```

## Cómo se sirven las imágenes

React **nunca** accede a R2 directamente. Dos modos soportados:

1. **Proxy por Worker (por defecto, ideal en local):** el Public API expone
   `GET /media/<key>` y hace stream desde el binding R2. La URL pública es
   `<PUBLIC_API_URL>/media/<key>`.
2. **CDN / dominio público (producción):** conecta un dominio personalizado al
   bucket y define `MEDIA_BASE_URL` en el Public API. Las URLs pasan a ser
   `<MEDIA_BASE_URL>/<key>` y R2 las sirve con su CDN.

## Subida de imágenes (admin)

El navegador del admin envía el archivo al **Admin API** (multipart), que valida
tipo/tamaño, escribe en R2 y registra el `FileAsset` en D1. No hay subida directa
navegador→R2, por lo que **no se requiere CORS** en el bucket para este flujo.

## CORS (solo si algún día subes directo desde el navegador)

Ver `cors.example.json`. Aplicar con:

```bash
wrangler r2 bucket cors put starter-media --rules ./infra/r2/cors.example.json
```
