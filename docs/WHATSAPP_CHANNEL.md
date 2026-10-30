# Canal de WhatsApp: texto y voz

Este canal permite que una persona reporte un problema del espacio público en la
Alcaldía Cuauhtémoc por WhatsApp, con texto o nota de voz. El bot nunca publica
un reporte sin confirmación explícita y nunca promete que una autoridad ya lo
recibió.

## Qué hace

1. Recibe el webhook de WhatsApp Cloud API y valida `X-Hub-Signature-256` contra
   el cuerpo exacto de la petición.
2. Deduplica por `provider_message_id`: un reintento de Meta no crea dos casos.
3. Extrae un borrador estructurado (categoría, título, descripción, colonia,
   señales de riesgo y accesibilidad). La extracción determinista funciona sin
   credenciales; el modelo de IA solo la mejora cuando está configurado.
4. Para notas de voz descarga el audio por la Graph API, lo transcribe con un
   endpoint compatible con `/audio/transcriptions` y usa la transcripción como
   relato. Si la transcripción no está configurada, pide el reporte por escrito.
5. Pide la ubicación con el selector nativo de WhatsApp. Si la persona solo
   escribe su colonia, usa el centro de esa colonia y lo marca como ubicación
   aproximada, nunca como un pin exacto.
6. Muestra un resumen y dos botones: **Sí, enviar** y **Corregir**.
7. Al confirmar, crea el reporte en VotaVía con `submission_channel` `messaging`
   (texto) o `voice` (nota de voz) y responde con el folio y el enlace.

## Estados de la conversación

| Estado | Significado |
| --- | --- |
| `awaiting_report` | Falta el relato o más detalle |
| `awaiting_category` | Falta elegir categoría |
| `awaiting_location` | Falta pin o colonia |
| `awaiting_confirmation` | Hay resumen y se espera confirmación |
| `completed` | Caso creado; el siguiente mensaje inicia un reporte nuevo |

La persona puede escribir `cancelar` o `nuevo reporte` en cualquier momento.
Durante la confirmación, `corregir` descarta el borrador y `sí` lo envía.

## Configuración en Meta

1. Crea o abre una app de WhatsApp Business en Meta for Developers.
2. Agrega el número de WhatsApp Business y obtén su **Phone number ID**.
3. Genera un token de sistema con `whatsapp_business_messaging`.
4. Configura el webhook con la URL pública:

   ```text
   https://<tu-dominio>/api/whatsapp/webhook
   ```

5. Usa el mismo valor de `WHATSAPP_VERIFY_TOKEN` al suscribir el webhook.
6. Suscribe el campo `messages` (incluye texto, audio, ubicación e interactivos).
7. Copia el **App secret** en `WHATSAPP_APP_SECRET`.

Para desarrollo local, expón el puerto con un túnel HTTPS y usa
`WHATSAPP_DRY_RUN=1`. En dry-run el webhook valida firmas y conversa, pero no
envía mensajes reales ni descarga audio.

## Variables

| Variable | Obligatoria | Uso |
| --- | --- | --- |
| `WHATSAPP_ACCESS_TOKEN` | Producción | Enviar mensajes y descargar audio |
| `WHATSAPP_PHONE_NUMBER_ID` | Producción | Número emisor |
| `WHATSAPP_VERIFY_TOKEN` | Sí | Handshake `hub.verify_token` |
| `WHATSAPP_APP_SECRET` | Sí | Firma HMAC del webhook |
| `WHATSAPP_GRAPH_VERSION` | No | Default `v23.0` |
| `WHATSAPP_DRY_RUN` | No | `1` fuerza simulación |
| `WHATSAPP_TRANSCRIBE_API_KEY` | Solo voz | Clave del transcriptor |
| `WHATSAPP_TRANSCRIBE_BASE_URL` | No | Default `https://api.openai.com/v1` |
| `WHATSAPP_TRANSCRIBE_MODEL` | No | Default `whisper-1` |

## Persistencia

Sin Supabase, el estado vive en `.data/whatsapp.json` (ignorado por Git). Con
Supabase, aplica `supabase/migrations/0005_whatsapp_channel.sql`; las tablas
`whatsapp_threads` y `whatsapp_messages` tienen RLS activo y **ninguna policy**:
solo el service role del servidor puede leerlas o escribirlas.

La tabla de idempotencia guarda únicamente id de proveedor, dirección y tipo; no
guarda el cuerpo del mensaje. El borrador sí contiene el relato ciudadano y se
borra al completar el caso. Define una política de retención para conversaciones
abandonadas antes de operar en producción.

## Límites y decisiones de seguridad

- Solo se aceptan coordenadas dentro de los límites de Cuauhtémoc.
- El teléfono se convierte en una clave `sha256` para el participante; nunca se
  publica ni se usa como identidad del caso.
- El webhook exige firma; no hay modo "sin firma" en producción.
- El canal no envía el reporte a SUAC ni a ninguna autoridad. Solo crea el
  reporte en VotaVía.
- El canal no toca el panel de gobierno, la API pública ni el colector 0311.
- En producción, encola el procesamiento si la transcripción puede exceder el
  tiempo de espera de Meta; los reintentos ya son idempotentes.

## Pruebas

```bash
npm test -- tests/whatsapp
npm run typecheck
npm run build
```

Las pruebas cubren firma, parser de webhook, extracción determinista, idempotencia
y el flujo completo texto → ubicación → confirmación → caso.
