# Integración — modelo cívico compartido (Fases 1 y 2)

Actualización de arquitectura: VotaVía deja de ser solo un mapa de quejas y pasa a ser
infraestructura cívica compartida entre ciudadanía, gobierno, desarrolladores y organizaciones.

Este documento es el contrato operativo para las sesiones 2–5 y para la ingesta de datos oficiales.

## 1. Qué se preservó

- `public.cases` sigue siendo **la tabla de reportes ciudadanos**.
- `case_id` sigue siendo la identidad canónica de un reporte.
- `report_id` **es** `case_id`. No existe una segunda identidad para reportes.
- Los enums existentes (`case_status`, `case_event_type`, `case_category`, …) no se renombraron.
  Solo se añadieron valores y tipos nuevos.
- Los reportes **no se eliminan** al agruparse en un caso compartido.

## 2. Entidades nuevas

| Entidad | Tabla | Identidad | Quién la crea |
| --- | --- | --- | --- |
| Organización | `organizations` | `organization_id` | Administración de plataforma |
| Membresía | `organization_members` | — | Administración (verificado) |
| Caso compartido (issue) | `issues` | `issue_id` | VotaVía al recibir un reporte |
| Registro oficial | `official_records` | `official_record_id` (clave natural `source_system` + `source_record_id`) | Ingesta oficial (Ismael) |
| Vínculo issue ↔ registro | `issue_official_records` | — | Ingesta / operación |
| Evidencia | `evidence` | `evidence_id` | Ciudadanía o gobierno |
| Apoyo a issue | `issue_supports` | — | Ciudadanía |
| Verificación comunitaria | `community_verifications` | — | Ciudadanía autenticada |

Relaciones:

```
organization 1 ── n organization_members
organization 1 ── n issues
issue        1 ── n cases            (cases.issue_id)
issue        n ── n official_records (issue_official_records)
issue        1 ── n evidence
issue        1 ── n issue_supports
issue        1 ── n community_verifications
```

Un `issue` puede agrupar varios reportes y enlazar varios registros oficiales. Su `origin` es:

- `citizen`: solo reportes ciudadanos.
- `official`: solo registros importados (sin reportes).
- `mixed`: reportes ciudadanos **y** registros oficiales vinculados.

## 3. Tres dominios de estado (nunca se mezclan)

| Dominio | Campo de `issues` | Valores |
| --- | --- | --- |
| A. Flujo operativo VotaVía | `operational_status` | `new`, `triaged`, `assigned`, `in_progress`, `completed`, `cancelled` |
| B. Estado del sistema oficial | `external_status` | Texto crudo de SUAC / 0311 / otra fuente. `null` = sin dato |
| C. Verificación comunitaria | `community_verification_status` | `unreviewed`, `confirmed`, `disputed`, `verified_resolved` |

Regla de oro: **un aviso de gobierno de “completado” no marca `verified_resolved`**. Abre la
verificación (`unreviewed`) y solo un veredicto ciudadano puede marcarla.

`cases.status` (enum legado) se conserva por compatibilidad y se deriva del estado operativo al
importar datos antiguos. No lo uses para lógica nueva.

## 4. Autorización por organización

El acceso de gobierno **no** se deriva del dominio del correo. Requiere una fila en
`organization_members` con:

- `verified_at` no nulo,
- `revoked_at` nulo,
- organización `is_active`.

Roles: `responder` < `supervisor` < `admin`. `scope` permite limitar colonias o códigos de
responsabilidad.

Alta de personal (solo servidor, con service role):

```bash
npm run grant:org -- --email funcionaria@cuauhtemoc.gob.mx \
  --org alcaldia-cuauhtemoc --org-name "Alcaldía Cuauhtémoc" --role responder
```

Funciones SQL disponibles para RLS: `is_org_member(org, min_role)`,
`current_organization_ids()`.

## 5. Contrato TypeScript

Archivo canónico: `src/shared/votavia-contract.ts`. Cambios **aditivos**:

```ts
issue_id, report_id (= case_id), organization_id, official_record_id
Issue, IssueDetail, OfficialRecord, EvidenceItem, Organization, OrganizationMembership
IssueOperationalStatus, CommunityVerificationStatus, VerificationVerdict, IssueOrigin
CivicPlatformService   // listIssues, getIssue, supportIssue, removeIssueSupport,
                       // recordVerification, listEvidence, addEvidence,
                       // recordOperationalUpdate
```

`Case` gana campos opcionales (`issue_id`, `issue_display_id`, `origin`, `operational_status`,
`external_status`, `community_verification_status`, `official_record_count`). Nada existente se
eliminó, así que las copias antiguas del contrato siguen compilando.

**Acción para cada sesión:** sustituye tu copia de `src/shared/votavia-contract.ts` por la de
`main` y vuelve a compilar. No mantengas una versión divergente.

## 6. API interna nueva

| Método | Ruta | Notas |
| --- | --- | --- |
| `GET` | `/api/issues` | Filtros `category`, `operational`, `verification`, `origin`, `colonia`, `q`, `sort` |
| `GET` | `/api/issues/[id]` | `IssueDetail`: reportes, registros oficiales, evidencia, verificación |
| `POST` | `/api/issues/[id]/support` | Apoyo idempotente por usuario/participante |
| `DELETE` | `/api/issues/[id]/support` | Retira el apoyo (requiere sesión) |
| `POST` | `/api/issues/[id]/verification` | `{ verdict }`; requiere sesión |
| `GET` | `/api/issues/[id]/evidence` | Evidencia pública del issue |
| `POST` | `/api/issues/[id]/evidence` | Multipart: `payload` + `photo`; gobierno requiere membresía |
| `POST` | `/api/issues/[id]/operational` | `{ operational_status, organization_id, note? }`; membresía verificada |
| `GET` | `/api/official-records/[id]/history` | Historial de estado de la fuente; público solo si es redistribuible |
| `GET` | `/api/organizations/me` | Membresías del usuario actual |

Subida de evidencia:

```
payload = {"kind":"citizen_followup","caption":"...","case_id":"<uuid opcional>"}
photo   = <archivo JPG/PNG/WEBP ≤ 5 MB>
organization_id = <uuid, obligatorio para government_intervention y resolution_proof>
```

## 7. Migraciones

Orden estricto:

1. `0001_votavia_phase1.sql`
2. `0002_case_sequence.sql`
3. `0003_shared_civic_model.sql` ← nuevo

`0003` es aditiva e idempotente: crea enums/tablas/índices/RLS, añade columnas y genera un `issue`
para cada reporte existente que no tenga uno. No borra ni renombra nada.

## 8. Indicaciones por sesión

**Sesión 2 — panel de gobierno.** Usa `organization_id` + `is_org_member`. Toda acción operativa
debe pasar por `POST /api/issues/[id]/operational` para conservar auditoría y atribución. Nunca
escribas `external_status` como si fuera una actualización de SUAC: solo una integración
autorizada puede hacerlo.

**Sesión 3 — IA y duplicados.** Agrupa reportes asignando `cases.issue_id` a un `issue` existente
en lugar de crear otro. Conserva el reporte original. Recalcula `origin` si enlazas registros
oficiales. Los candidatos a duplicado deben compararse por `issue`, no solo por `case`.

**Sesión 4 — API pública.** Expón `issue_id` como identidad pública del caso compartido y
`case_id` como reporte. Conserva los tres estados por separado. Lee registros oficiales de
`official_records_public` (o replica su filtro: `is_active` y `redistribution = 'allowed'`),
nunca de la tabla base. Incluye `source_system`, `external_folio`, `source_url`, `license`,
`license_url` y `attribution`. No publiques `raw_payload`, `reporter_email`, `created_by_user_id`
ni `participant_key`.

**Sesión 5 — QA.** Cubre: un apoyo activo por usuario e issue, revocación de apoyos, un veredicto
activo por usuario, `completed` → `unreviewed` (no `verified_resolved`), 403 sin membresía
verificada, y que la evidencia de gobierno requiera organización.

**Ingesta oficial (Sesión 6 / Ismael).** Contrato completo en
[SESSION6_INGESTION_CONTRACT.md](SESSION6_INGESTION_CONTRACT.md). Resumen:

- Identidad idempotente: `(source_system, source_record_id)`. Para 0311, `source_system` es
  `cdmx_0311` y, si el origen no trae id, se usa su `dedupe_key`. El folio (`external_folio`) no
  es clave y puede faltar o repetirse.
- Mapeo campo por campo desde `NormalizedOfficialRecord` en la sección 2 del contrato de ingesta;
  el adaptador canónico es `fromCollectorRecord()`.
- Escritura única recomendada: `select * from public.upsert_official_record($1::jsonb)`, que
  devuelve `(official_record_id, created)` y mantiene el historial de estado.
- Historial de estado en `official_record_status_history` (solo agregado, una fila vigente).
- Fechas: `source_created_at`, `source_updated_at`, `source_fetched_at`, `first_seen_at`,
  `last_synced_at`.
- Bajas: `retire_missing_official_records(source_system, sync_run_id)` solo tras corridas
  completas; nunca `DELETE`.
- Coordenadas opcionales; sin inventar centroides.
- Redistribución: `allowed` | `restricted` | `unknown`. La vista `official_records_public`
  filtra `is_active and redistribution = 'allowed'` y excluye `raw_payload`.
- Un registro oficial nunca se convierte en `cases`.

## 9. Verificación de esta rama

```
npm run typecheck   # limpio
npm run lint        # limpio
npm test            # 48 pruebas
npm run build       # compila
```

## 10. Seguridad aplicada

- Escrituras por service role; RLS solo para lectura pública.
- `issue_supports`: índice único parcial → un apoyo activo por usuario y issue.
- `community_verifications`: índice único parcial → un veredicto activo por usuario.
- `case_events`: trigger que impide `UPDATE`/`DELETE` (bitácora de solo agregado).
- `official_record_status_history`: solo agregado; índice único parcial para una fila vigente.
- `official_records_public`: vista con `security_invoker` que excluye `raw_payload` y lo no
  redistribuible.
- Privacidad: correo y propietario fuera de toda respuesta pública; `raw_payload` no se expone.
- Gobierno: membresía verificada, no dominio de correo.
