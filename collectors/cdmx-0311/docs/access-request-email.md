# Draft access and reuse clarification email

**Status: draft only. This message has not been sent. No permission has been
granted.** Replace every bracketed placeholder before sending. Keep the tone
factual and do not claim that VotaVía is an official government channel.

```text
Para: datosabiertos@cdmx.gob.mx
Asunto: Solicitud de acceso, diccionario y aclaración de reutilización — conjunto *0311

Buen día:

Mi nombre es [nombre] y formo parte de [organización/proyecto], una iniciativa
cívica que trabaja en la priorización comunitaria y la verificación independiente
de problemas de infraestructura y espacio público en la Ciudad de México. El
proyecto se llama VotaVía y no sustituye a *0311 Locatel ni a ningún canal
oficial; busca complementar la información pública y dirigir la atención
ciudadana hacia los reportes existentes.

Estamos construyendo un colector de datos para el conjunto "Solicitudes *0311"
publicado en el Portal de Datos Abiertos de la CDMX:
https://datos.cdmx.gob.mx/dataset/0311

Actualmente identificamos recursos históricos en CSV para 2019 a 2024 y el
tablero público https://tablero311.cdmx.gob.mx/. Antes de automatizar o publicar
datos derivados, agradeceríamos su orientación sobre los siguientes puntos:

1. ¿Cuál es el mecanismo recomendado para obtener el histórico completo y las
   actualizaciones del conjunto *0311: descarga directa de los recursos CKAN,
   API DataStore u otro endpoint de datos abiertos?
2. ¿El tablero de solicitudes expone un API público, exportación oficial o
   descarga masiva? Si existe, ¿cuáles son sus límites de paginación, frecuencia
   y uso?
3. ¿La licencia CC-BY-4.0-ESP del conjunto histórico aplica también a los datos
   mostrados en el tablero? ¿Hay alguna restricción adicional para acceso
   automatizado o para redistribuir un conjunto normalizado y derivado?
4. ¿Cuáles son los requisitos de atribución que debemos mostrar y qué texto
   recomiendan para citar a la ADIP y al Portal de Datos Abiertos?
5. ¿Podrían compartir el diccionario de datos completo, incluyendo el
   significado de los campos de categoría, subcategoría, estatus, dependencia
   responsable, fecha de conclusión y coordenadas? También nos interesa saber si
   los folios son estables entre años.
6. ¿Con qué frecuencia se actualizan los recursos y el tablero, y existe algún
   aviso o boletín para detectar cambios?
7. ¿Los textos de descripción pueden contener nombres, teléfonos, correos u otros
   datos personales? Nuestra intención es excluirlos o redactarlos antes de
   cualquier publicación, y agradeceríamos cualquier recomendación al respecto.
8. ¿Existe algún procedimiento o convenio para solicitar acceso a datos
   agregados o anonimizados con mayor nivel de detalle?

No hemos publicado ni redistribuido datos del tablero. Mientras no recibamos
confirmación, mantendremos la recolección del tablero desactivada y trabajaremos
únicamente con los recursos históricos cuya licencia esté publicada.

Quedo atento a su respuesta y con gusto comparto la documentación técnica de
nuestro colector, sus medidas de minimización de datos y los campos exactos que
usamos.

Saludos cordiales,

[nombre]
[organización/proyecto]
[correo de contacto]
[teléfono, opcional]
[URL pública del proyecto, si existe]
```

## Before sending

- Confirm the organization and contact details.
- Keep the statement that no dashboard data has been redistributed accurate.
- Do not attach personal data or a full raw scrape.
- Record the date sent and any reply in the project decision log.
- If permission is granted with conditions, update `source_license`,
  `license_status` and the dashboard config only after a human reviews the reply.
