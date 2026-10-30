import { describe, expect, it } from "vitest";
import { parseInboundMessages } from "@/server/whatsapp/payload";

describe("WhatsApp webhook payload parser", () => {
  it("extracts text, voice notes, location, buttons and list replies", () => {
    const payload = {
      entry: [
        {
          changes: [
            {
              value: {
                messages: [
                  { id: "wamid.1", from: "5215500000001", timestamp: "1", type: "text", text: { body: "Hay un bache" } },
                  {
                    id: "wamid.2",
                    from: "5215500000001",
                    timestamp: "2",
                    type: "audio",
                    audio: { id: "media-1", mime_type: "audio/ogg", voice: true },
                  },
                  {
                    id: "wamid.3",
                    from: "5215500000001",
                    timestamp: "3",
                    type: "location",
                    location: { latitude: 19.42, longitude: -99.16, name: "Roma Norte", address: "Calle 1" },
                  },
                  {
                    id: "wamid.4",
                    from: "5215500000001",
                    timestamp: "4",
                    type: "interactive",
                    interactive: { type: "button_reply", button_reply: { id: "confirm_report", title: "Sí, enviar" } },
                  },
                  {
                    id: "wamid.5",
                    from: "5215500000001",
                    timestamp: "5",
                    type: "interactive",
                    interactive: { type: "list_reply", list_reply: { id: "cat:road_damage", title: "Baches" } },
                  },
                  { id: "wamid.6", from: "5215500000001", timestamp: "6", type: "image", image: { id: "x" } },
                ],
              },
            },
          ],
        },
      ],
    };

    const messages = parseInboundMessages(payload);
    expect(messages).toHaveLength(6);
    expect(messages[0]).toMatchObject({ type: "text", text: "Hay un bache" });
    expect(messages[1]).toMatchObject({ type: "audio", media_id: "media-1", media_mime_type: "audio/ogg" });
    expect(messages[2]).toMatchObject({ type: "location", latitude: 19.42, longitude: -99.16 });
    expect(messages[3]).toMatchObject({ type: "interactive", interactive_id: "confirm_report" });
    expect(messages[4]).toMatchObject({ interactive_id: "cat:road_damage" });
    expect(messages[5]).toMatchObject({ type: "unsupported", unsupported_type: "image" });
  });

  it("ignores status callbacks and malformed entries", () => {
    const payload = {
      entry: [
        { changes: [{ value: { statuses: [{ id: "wamid.1", status: "delivered" }] } }] },
        { changes: [{ value: { messages: [{ from: "5215500000001", type: "text" }] } }] },
        null,
      ],
    };
    expect(parseInboundMessages(payload)).toEqual([]);
    expect(parseInboundMessages(null)).toEqual([]);
  });
});
