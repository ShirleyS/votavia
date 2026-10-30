# VotaVía · API pública y portal para desarrolladores

Módulo de Session 4, rama `feature/public-api`. API de **solo lectura** para casos
urbanos publicados, estadísticas agregadas y señales preventivas aprobadas, más el portal
en español disponible en `/desarrolladores`.

No crea una base de datos ni modifica el esquema o las APIs internas de Session 1.

## Rutas

- `GET /api/v1/public/cases`
- `GET /api/v1/public/cases/:id`
- `GET /api/v1/public/cases.geojson`
- `GET /api/v1/public/categories`
- `GET /api/v1/public/official-reports`
- `GET /api/v1/public/statistics`
- `GET /api/v1/public/risk-signals`
- `GET /api/v1/public/health`
- `GET /api/v1/public/openapi.json`
- `GET /desarrolladores` (la raíz `/` redirige aquí)

`/cases` es la ruta canónica; `issues` y `reports` se documentan como equivalentes, sin
duplicar endpoints. Todos los listados aceptan filtros combinables por alcaldía, colonia,
categoría, fecha de creación, estado operativo, verificación comunitaria, origen,
soporte mínimo y bbox, con paginación acotada y orden estable.

## Desarrollo

```bash
npm install
npm run dev
```

Sin configuración adicional, la API usa datos ficticios deterministas
(`meta.dataset: "demo"`). Copia `.env.example` si vas a conectar la plataforma real.

El feed de registros gubernamentales importados está **desactivado por omisión**. Solo se
habilita con `VOTAVIA_OFFICIAL_FEED_ENABLED=true` y una licencia de fuente declarada. La
ingesta no vive en este módulo; la construye Ismael. VotaVía no ofrece ni representa una
API oficial del Gobierno de la Ciudad de México.

## Verificación

```bash
npm run typecheck
npm run test
npm run build
```

En entornos restringidos, el build verificable es `npx next build --webpack`.

## Integración

Consulta [`INTEGRATION.md`](./INTEGRATION.md) para:

- campos y métodos requeridos de Session 1;
- sustitución del adaptador en `src/public-api/adapters/resolve.ts`;
- contrato del feed aprobado de Session 3;
- extensión local de metadatos públicos y su mapeo al contrato de Session 1;
- variables de entorno, política del feed oficial, privacidad, límites y lista de
  verificación;
- reutilización municipal y aclaración sobre CDMX.

## Privacidad

Solo se publican casos con `is_published: true`. La proyección elimina correos,
teléfonos, direcciones exactas, notas internas, datos de especialistas, eventos no
públicos, enlaces mágicos, tokens, asignaciones internas y evidencia interna de IA.
También se elimina PII de registros importados. Las coordenadas se redondean a unos 110
metros; los casos con preocupación de seguridad se publican sin geometría.

Los registros importados solo aparecen con licencia redistribuible y permiso verificado.
Cada uno declara fuente, folio, URL, fecha de la fuente, última sincronización, licencia,
atribución y frescura. Un cierre gubernamental nunca se presenta como resolución
verificada.

La rama **no se fusiona automáticamente**.
