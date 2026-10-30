# Handoff — Fases 1 y 2 (núcleo ciudadano y contratos compartidos)

Estado: **funcional, verificado**. Este documento es la referencia de integración para las
sesiones 2–6 y para la ingesta oficial (Ismael). No modifica el trabajo de otras sesiones.

---

## 1. Archivo canónico de contratos

| Qué | Ruta |
| --- | --- |
| Contrato compartido (fuente única de verdad) | `src/shared/votavia-contract.ts` |
| Esquema de base de datos | `supabase/migrations/0001…0004` |
| Servicio de casos (implementación) | `src/server/services/case-service.ts` |
| Interfaz de persistencia | `src/server/repositories/repository.ts` |
| Adaptador de ingesta oficial | `src/server/services/official-record-adapter.ts` |
| Contrato de ingesta 0311 | `SESSION6_INGESTION_CONTRACT.md` |
| Contrato del modelo cívico | `INTEGRATION_SHARED_MODEL.md` |

**Regla:** ninguna sesión debe mantener una copia divergente de `votavia-contract.ts`.
Al integrar, toma este archivo y recompila.

---

## 2. Identificadores (no negociables)

| Identificador | Significado | Dónde vive |
| --- | --- | --- |
| `case_id` | Reporte ciudadano individual (**también es `report_id`**) | `cases.id` |
| `issue_id` | Caso compartido; agrupa reportes y registros oficiales | `issues.id` |
| `organization_id` | Organización de gobierno con permisos acotados | `organizations.id` |
| `official_record_id` | Registro importado de gobierno | `official_records.id` |
| `display_id` | Folio legible (`VOT-0001`, `ISS-0001`). **No es identidad** | columnas `display_id` |

`report_id === case_id`. No existe una segunda identidad para reportes.

---

## 3. Los tres dominios de estado (nunca se mezclan)

| Dominio | Campo | Valores |
| --- | --- | --- |
| A. Operativo VotaVía | `issues.operational_status` | `new`, `triaged`, `assigned`, `in_progress`, `completed`, `cancelled` |
| B. Oficial externo | `issues.external_status` | Texto crudo del sistema de origen (o `null`) |
| C. Verificación comunitaria | `issues.community_verification_status` | `unreviewed`, `confirmed`, `disputed`, `verified_resolved` |

**Regla dura:** un “resuelto” de gobierno (`operational_status = completed`) abre la verificación
comunitaria (`unreviewed`). **Solo un veredicto ciudadano** puede llevarla a `verified_resolved`.
Implementado en `CaseService.recordOperationalUpdate` y verificado por pruebas.

`cases.status` (enum legado) se conserva por compatibilidad; no lo uses para lógica nueva.

---

## 4. Endpoints internos

### Ciudadanía (público autenticado o anónimo)

| Método | Ruta | Notas |
| --- | --- | --- |
| `GET` | `/api/cases` | Filtros `category`, `status`, `colonia`, `q`, `sort`, `mine`, `supported` |
| `POST` | `/api/cases` | Multipart: `payload` JSON + `photos[]`. Responde `{ case, analysis }` |
| `GET` | `/api/cases/[id]` | `{ case, timeline, observations, analysis }` |
| `PATCH` | `/api/cases/[id]` | **Nuevo.** Edición por el autor (solo `reported`/`under_review`) |
| `POST` | `/api/cases/[id]/withdraw` | **Nuevo.** Retira (cierra) el reporte conservando el registro |
| `POST` | `/api/cases/[id]/support` | Apoyo al reporte individual |
| `GET`/`POST` | `/api/cases/[id]/observations` | Observaciones y seguimiento |
| `GET` | `/api/cases/nearby` | Duplicados deterministas por distancia/categoría |
| `POST` | `/api/cases/duplicates` | **Nuevo.** Sugerencias IA para el asistente de reporte |

### Caso compartido / comunidad

| Método | Ruta |
| --- | --- |
| `GET` | `/api/issues` |
| `GET` | `/api/issues/[id]` |
| `POST`/`DELETE` | `/api/issues/[id]/support` |
| `POST` | `/api/issues/[id]/verification` |
| `GET`/`POST` | `/api/issues/[id]/evidence` |
| `POST` | `/api/issues/[id]/operational` (requiere membresía verificada) |
| `GET` | `/api/official-records/[id]/history` |
| `GET` | `/api/organizations/me` |

### Autenticación

| Método | Ruta |
| --- | --- |
| `POST` | `/api/auth/magic-link` |
| `POST` | `/api/auth/claim` |
| `POST` | `/api/auth/demo` |
| `POST` | `/api/auth/signout` |
| `GET` | `/auth/confirm` |

---

## 5. Integración de IA (Sesión 2)

El motor existe en `src/lib/ai` y **no fue modificado**. Se consume por su interfaz pública:

```ts
import { classifyReport, findDuplicateReports, toAIAnalysisResultV2 } from "@/lib/ai";
```

Punto de conexión único: `src/server/services/case-analysis.ts`

- `analyzePersistedCase(repo, case)` → clasifica + detecta duplicados + **persiste** y devuelve
  `CaseAnalysisPayload`. **Nunca lanza.**
- `analyzeDraft(repo, input)` → sugerencias antes de crear el reporte. **Nunca lanza.**
- `storedAnalysisToPayload(row)` → lectura para la UI.

Garantías:
- Sin `DEEPSEEK_API_KEY`, el motor devuelve un análisis determinista marcado `is_fallback = true`.
- Presupuesto interactivo de 8 s (`INTERACTIVE_AI_TIMEOUT_MS`) para no retrasar el envío.
- El reporte se crea **antes** del análisis; si el análisis falla, la respuesta sigue siendo 201.
- La IA **no** cambia `status`, `operational_status` ni `community_verification_status`.
- Eventos ciudadanos nuevos: `report_updated` y `report_withdrawn` (no se etiquetan como
  actualización de gobierno).

Persistencia: `supabase/migrations/0004_case_analyses.sql` (`case_analyses`, 1 fila por caso).
Lectura: `CaseService.getCaseAnalysis(case_id)`.

Tipos públicos nuevos en el contrato: `CaseAnalysis`, `CaseAnalysisExtras`,
`DraftAnalysisRequest`, `DraftAnalysisResponse`, `DraftDuplicateCandidate`.

---

## 6. Autorización

| Operación | Requisito |
| --- | --- |
| Crear reporte | Público (anónimo o autenticado) |
| Apoyar caso / observar | Público; 1 apoyo activo por usuario/caso |
| Verificar resolución | Sesión iniciada (`user_id`) |
| Editar / retirar reporte | **Autor del reporte** o rol `admin` |
| Actualización operativa | Membresía de organización **verificada** (`organization_members.verified_at`) |
| Evidencia de gobierno | Membresía verificada en la organización indicada |
| Historial oficial no redistribuible | Membresía verificada |

Un correo con dominio de gobierno **no** otorga permisos. El alta es
`npm run grant:org -- --email … --org … --role responder`.

Editar exige que el reporte siga en `reported`/`under_review` (si no: 409). Retirar cierra el
reporte y deja rastro en `case_events`; **no borra** datos.

---

## 7. Datos oficiales importados (Sesión 6 / Ismael)

- Identidad idempotente: `(source_system, source_record_id)`; para 0311,
  `source_system = "cdmx_0311"` y `source_record_id` puede ser el `dedupe_key`.
- Escritura única: `select * from public.upsert_official_record($1::jsonb)` → `(id, created)`.
- Historial de estado: `official_record_status_history` (solo agregado, una fila vigente).
- Redistribución: `allowed` / `restricted` / `unknown`; vista pública `official_records_public`.
- Un registro importado **nunca** se convierte en `cases` ni sobrescribe el texto ciudadano.
  Se vincula con `issue_official_records`; el issue pasa a `mixed`.
- Prueba que lo garantiza: `tests/case-analysis.test.ts` →
  “imported records never overwrite citizen submissions”.

---

## 8. Migraciones (orden estricto)

1. `0001_votavia_phase1.sql`
2. `0002_case_sequence.sql`
3. `0003_shared_civic_model.sql`
4. `0004_case_analyses.sql` ← nueva

---

## 9. Verificación

```
npx tsc --noEmit                     # limpio
npx vitest run                       # 198 pruebas OK (1 skip intencional)
npm run build                        # compila (37 rutas)
npx eslint <archivos tocados>        # limpio
```

Cobertura nueva en `tests/case-analysis.test.ts`: análisis sin modelo, IA no altera estado,
edición/retiro por autor, 403 para extraños y anónimos, 409 fuera de ventana, admin, y
separación de registros oficiales.

---

## 10. Bloqueos conocidos

- **No se pudo hacer smoke test HTTP real:** el sandbox bloquea `listen` en cualquier puerto
  (`EPERM`). La verificación es por pruebas de servicio, typecheck y build.
- **Lint global rojo:** existen ~1.2k errores previos en módulos de otras sesiones
  (`src/app/gobierno`, `src/components/government`, `src/public-api`). Los archivos de esta
  sesión están limpios; no se tocaron los ajenos.
- **Sin modelo configurado** el análisis es determinista (marcado en UI y en datos). Basta con
  definir `DEEPSEEK_API_KEY` para activar el modelo.
