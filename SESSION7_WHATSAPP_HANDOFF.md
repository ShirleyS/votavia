# Session 7 — WhatsApp text and voice handoff

Estado: **implementado y probado localmente**. No se probó con credenciales reales
de Meta ni con un número de producción.

## Aislamiento

- Worktree: `/Users/shirley/Documents/code/votavia-whatsapp`
- Rama: `feature/whatsapp-text-voice`
- Base: `main` en `d9b2bfd`
- No se modificó el checkout compartido ni los worktrees de las sesiones 1–6.

## Alcance entregado

1. Webhook `GET/POST /api/whatsapp/webhook` para WhatsApp Cloud API.
2. Verificación HMAC `X-Hub-Signature-256` sobre el cuerpo exacto y handshake
   `hub.verify_token` en tiempo constante.
3. Idempotencia por `provider_message_id`; un reintento de Meta no duplica casos.
4. Intake de texto y notas de voz:
   - descarga de audio por Graph API con allowlist de hosts y límite de 16 MB;
   - transcripción configurable compatible con `/audio/transcriptions`;
   - degradación explícita a texto cuando no hay transcriptor.
5. Extracción determinista sin credenciales + refinamiento opcional con DeepSeek.
6. Ubicación por pin de WhatsApp o, si solo hay colonia, centroide marcado como
   ubicación aproximada.
7. Confirmación explícita con botones antes de crear el caso.
8. Persistencia demo (`.data/whatsapp.json`) y Supabase
   (`supabase/migrations/0005_whatsapp_channel.sql`).
9. Documentación en [docs/WHATSAPP_CHANNEL.md](docs/WHATSAPP_CHANNEL.md).
10. Smoke script firmado: `scripts/whatsapp-webhook-smoke.mjs`.

## Contrato de salida

El caso se crea con el contrato existente de Session 1:

- `submission_channel`: `messaging` para texto, `voice` para nota de voz.
- `submission_metadata`: `provider`, `participant_key`, `message_ids`,
  `location_precision`, `used_voice`, `transcript`.
- `created_by_user_id`: `null`; el teléfono nunca es identidad del caso.
- `reporter_email`: `null`.

No se escribe `external_status` ni se envía nada a SUAC ni a una autoridad.

## Evidencia local

- `vitest run`: 205 pruebas aprobadas, 1 omitida.
- `tsc --noEmit`: sin errores.
- `next build --webpack`: compila; la ruta aparece como dinámica.
- `eslint` sobre los archivos nuevos: sin errores ni advertencias.
- El lint completo del repositorio conserva errores previos en componentes de
  gobierno y API pública, ajenos a esta sesión.

## Pendiente antes de producción

1. Configurar app de Meta, número, token, app secret y verificar el webhook.
2. Probar un mensaje real de texto y una nota de voz real con el transcriptor.
3. Definir retención de conversaciones abandonadas.
4. Si la transcripción puede superar el timeout de Meta, mover el procesamiento
   a una cola; la idempotencia ya está implementada.
5. Revisar el texto de consentimiento y privacidad con el equipo legal.

## Prueba local

```bash
WHATSAPP_VERIFY_TOKEN=dev-token WHATSAPP_APP_SECRET=dev-secret \
WHATSAPP_DRY_RUN=1 npm run dev

node scripts/whatsapp-webhook-smoke.mjs \
  --url http://localhost:3000/api/whatsapp/webhook \
  --secret dev-secret \
  --text "Hay un bache en Roma Norte"
```
