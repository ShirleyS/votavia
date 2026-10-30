function read(value: string | undefined): string {
  return value?.trim() ?? "";
}

export interface WhatsAppConfig {
  accessToken: string;
  phoneNumberId: string;
  verifyToken: string;
  appSecret: string;
  graphVersion: string;
  dryRun: boolean;
  transcription: {
    apiKey: string;
    baseUrl: string;
    model: string;
  };
}

export function whatsappConfig(): WhatsAppConfig {
  const accessToken = read(process.env.WHATSAPP_ACCESS_TOKEN);
  const phoneNumberId = read(process.env.WHATSAPP_PHONE_NUMBER_ID);
  return {
    accessToken,
    phoneNumberId,
    verifyToken: read(process.env.WHATSAPP_VERIFY_TOKEN),
    appSecret: read(process.env.WHATSAPP_APP_SECRET),
    graphVersion: read(process.env.WHATSAPP_GRAPH_VERSION) || "v23.0",
    // Never send real messages by accident in local/demo runs.
    dryRun: !accessToken || !phoneNumberId || read(process.env.WHATSAPP_DRY_RUN) === "1",
    transcription: {
      apiKey: read(process.env.WHATSAPP_TRANSCRIBE_API_KEY) || read(process.env.OPENAI_API_KEY),
      baseUrl: read(process.env.WHATSAPP_TRANSCRIBE_BASE_URL) || "https://api.openai.com/v1",
      model: read(process.env.WHATSAPP_TRANSCRIBE_MODEL) || "whisper-1",
    },
  };
}

export function whatsappGraphBase(config: WhatsAppConfig): string {
  return `https://graph.facebook.com/${config.graphVersion}`;
}
