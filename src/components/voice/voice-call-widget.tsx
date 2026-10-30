"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, Phone, PhoneOff, Send, Square, Volume2, VolumeX } from "lucide-react";
import { cn } from "@/lib/utils";

type CallPhase = "idle" | "listening" | "thinking" | "speaking";

interface TurnMessage {
  id: string;
  role: "bot" | "user";
  text: string;
  href?: string;
}

interface SimulatorMessage {
  id: string;
  type: "text" | "buttons" | "category_list" | "location_request";
  body: string;
  buttons?: Array<{ id: string; title: string }>;
  options?: Array<{ id: string; title: string; description: string }>;
}

interface SimulatorResponse {
  messages?: SimulatorMessage[];
  caseId?: string;
  transcriptionUnavailable?: boolean;
  error?: { message?: string };
}

const GREETING =
  "Hola, soy VotaVía. Cuéntame qué problema hay en tu calle y lo registro como reporte. Puedes hablar o escribir.";

const MAX_RECORDING_MS = 45_000;

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type));
}

export function VoiceCallWidget() {
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<CallPhase>("idle");
  const [muted, setMuted] = useState(false);
  const [messages, setMessages] = useState<TurnMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [voiceReady, setVoiceReady] = useState<boolean | null>(null);

  const sessionId = useRef<string>("");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const stopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const mutedRef = useRef(false);

  useEffect(() => {
    mutedRef.current = muted;
  }, [muted]);

  useEffect(() => {
    if (!sessionId.current) {
      sessionId.current =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `voice-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    }
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, phase]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    fetch("/api/whatsapp/simulate", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { enabled?: boolean; transcription_configured?: boolean } | null) => {
        if (cancelled) return;
        setVoiceReady(Boolean(data?.transcription_configured));
        if (data && data.enabled === false) {
          setNotice("El canal de voz está desactivado en este entorno. Puedes escribir tu reporte.");
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [open]);

  const stopPlayback = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
    if (audio.src) URL.revokeObjectURL(audio.src);
    audioRef.current = null;
  }, []);

  const playSpeech = useCallback(
    async (text: string) => {
      if (mutedRef.current || !text.trim()) return;
      stopPlayback();
      setPhase("speaking");
      try {
        const response = await fetch("/api/voice/speak", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        });
        if (!response.ok) {
          setPhase("idle");
          return;
        }
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audioRef.current = audio;
        audio.onended = () => {
          URL.revokeObjectURL(url);
          audioRef.current = null;
          setPhase("idle");
        };
        await audio.play();
      } catch {
        setPhase("idle");
      }
    },
    [stopPlayback],
  );

  const appendBotMessages = useCallback(
    (data: SimulatorResponse) => {
      const incoming = data.messages ?? [];
      if (incoming.length === 0) {
        setNotice("No recibimos respuesta del asistente. Intenta de nuevo.");
        return;
      }
      const botMessages: TurnMessage[] = incoming.map((message) => ({
        id: message.id,
        role: "bot",
        text: message.body,
      }));
      setMessages((current) => [...current, ...botMessages]);

      if (data.transcriptionUnavailable) {
        setNotice("No pudimos entender el audio. Revisa la clave de voz o escribe tu reporte.");
      } else {
        setNotice(null);
      }

      const lastText = incoming[incoming.length - 1]?.body ?? "";
      if (data.caseId) {
        setMessages((current) => [
          ...current,
          {
            id: `case-${data.caseId}`,
            role: "bot",
            text: "Tu reporte quedó registrado. Toca aquí para verlo.",
            href: `/reportes/${data.caseId}`,
          },
        ]);
      }
      void playSpeech(lastText);
    },
    [playSpeech],
  );

  const sendVoice = useCallback(
    async (blob: Blob) => {
      setPhase("thinking");
      setNotice("Procesando tu audio…");
      try {
        const form = new FormData();
        form.append("payload", JSON.stringify({ sessionId: sessionId.current }));
        const extension = blob.type.includes("mp4") ? "m4a" : "webm";
        form.append("audio", blob, `nota.${extension}`);

        const response = await fetch("/api/whatsapp/simulate", { method: "POST", body: form });
        const data = (await response.json().catch(() => ({}))) as SimulatorResponse;
        if (!response.ok) {
          setNotice(data.error?.message || "No pudimos procesar el audio. Intenta de nuevo.");
          setPhase("idle");
          return;
        }
        appendBotMessages(data);
      } catch {
        setNotice("Hubo un problema de conexión. Intenta de nuevo.");
        setPhase("idle");
      }
    },
    [appendBotMessages],
  );

  const sendText = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      setMessages((current) => [
        ...current,
        { id: `user-${Date.now()}`, role: "user", text: trimmed },
      ]);
      setDraft("");
      setPhase("thinking");
      try {
        const response = await fetch("/api/whatsapp/simulate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId: sessionId.current, kind: "text", text: trimmed }),
        });
        const data = (await response.json().catch(() => ({}))) as SimulatorResponse;
        if (!response.ok) {
          setNotice(data.error?.message || "El asistente no respondió. Intenta de nuevo.");
          setPhase("idle");
          return;
        }
        appendBotMessages(data);
      } catch {
        setNotice("Hubo un problema de conexión. Intenta de nuevo.");
        setPhase("idle");
      }
    },
    [appendBotMessages],
  );

  const stopRecording = useCallback(() => {
    if (stopTimer.current) {
      clearTimeout(stopTimer.current);
      stopTimer.current = null;
    }
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive") return;
    recorder.stop();
  }, []);

  const startRecording = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setNotice("Este navegador no permite grabar audio. Escribe tu reporte abajo.");
      return;
    }
    stopPlayback();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = pickMimeType();
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      chunksRef.current = [];
      recorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        recorderRef.current = null;
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        chunksRef.current = [];
        if (blob.size < 1200) {
          setPhase("idle");
          setNotice("No alcancé a escuchar nada. Mantén presionado un poco más.");
          return;
        }
        void sendVoice(blob);
      };

      recorder.start();
      setNotice(null);
      setPhase("listening");
      stopTimer.current = setTimeout(() => stopRecording(), MAX_RECORDING_MS);
    } catch {
      setNotice("Necesito permiso del micrófono. Actívalo en el navegador o escribe tu reporte.");
    }
  }, [sendVoice, stopPlayback, stopRecording]);

  useEffect(() => {
    return () => {
      if (stopTimer.current) clearTimeout(stopTimer.current);
      const recorder = recorderRef.current;
      if (recorder && recorder.state !== "inactive") recorder.stop();
      stopPlayback();
    };
  }, [stopPlayback]);

  function closeCall() {
    stopRecording();
    stopPlayback();
    setPhase("idle");
    setOpen(false);
  }

  const listening = phase === "listening";
  const busy = phase === "thinking";

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col items-end gap-3">
      {open ? (
        <section
          aria-label="Asistente de voz de VotaVía"
          className="flex h-[min(78vh,560px)] w-[min(100vw-2rem,380px)] flex-col overflow-hidden rounded-3xl bg-paper shadow-[0_28px_60px_-24px_rgba(20,18,15,.45)] ring-1 ring-line"
        >
          <header className="flex items-center justify-between gap-3 bg-navy-900 px-5 py-4 text-white">
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-royal-600">
                <Phone className="h-4 w-4" aria-hidden />
              </span>
              <div>
                <p className="text-sm font-semibold leading-tight">Asistente VotaVía</p>
                <p className="text-[11px] text-white/70">
                  {listening ? "Escuchando…" : busy ? "Pensando…" : phase === "speaking" ? "Hablando…" : "En línea"}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setMuted((value) => !value)}
              aria-pressed={muted}
              aria-label={muted ? "Activar voz del asistente" : "Silenciar voz del asistente"}
              className="rounded-full p-2 text-white/80 transition hover:bg-white/10 hover:text-white"
            >
              {muted ? <VolumeX className="h-4 w-4" aria-hidden /> : <Volume2 className="h-4 w-4" aria-hidden />}
            </button>
          </header>

          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4" aria-live="polite">
            <Bubble role="bot" text={GREETING} />
            {messages.map((message) => (
              <Bubble key={message.id} role={message.role} text={message.text} href={message.href} />
            ))}
            {busy ? (
              <div className="flex items-center gap-2 pl-1 text-xs font-medium text-navy-500">
                <span className="flex gap-1">
                  <Dot delay="0ms" />
                  <Dot delay="150ms" />
                  <Dot delay="300ms" />
                </span>
                Transcribiendo y armando tu reporte…
              </div>
            ) : null}
          </div>

          {voiceReady === false ? (
        <p className="mx-4 mb-2 rounded-xl bg-navy-50 px-3 py-2 text-[11px] leading-snug text-navy-600 ring-1 ring-inset ring-line">
          La transcripción de voz no está activa en este entorno. Escribe tu reporte y el asistente lo registra igual.
        </p>
      ) : null}

      {notice ? (
            <p className="mx-4 mb-2 rounded-xl bg-amber-50 px-3 py-2 text-[11px] leading-snug text-amber-900 ring-1 ring-inset ring-amber-200">
              {notice}
            </p>
          ) : null}

          <div className="border-t border-line px-4 pb-4 pt-3">
            <div className="flex items-center justify-center">
              <button
                type="button"
                onClick={listening ? stopRecording : startRecording}
                disabled={busy || phase === "speaking"}
                aria-label={listening ? "Terminar y enviar audio" : "Hablar con el asistente"}
                className={cn(
                  "relative flex h-16 w-16 items-center justify-center rounded-full text-white transition-transform disabled:opacity-50",
                  listening
                    ? "bg-rose-600 shadow-[0_0_0_8px_rgba(225,29,72,.14)]"
                    : "bg-royal-600 hover:scale-[1.03] shadow-[0_12px_24px_-12px_rgba(36,84,224,.9)]",
                )}
              >
                {listening ? <Square className="h-5 w-5" aria-hidden /> : <Mic className="h-6 w-6" aria-hidden />}
                {listening ? (
                  <span className="absolute inset-0 animate-ping rounded-full bg-rose-500/30" aria-hidden />
                ) : null}
              </button>
            </div>
            <p className="mt-2 text-center text-[11px] font-medium text-navy-500">
              {listening ? "Toca para enviar tu reporte" : "Toca el micrófono y habla"}
            </p>

            <form
              className="mt-3 flex items-center gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                void sendText(draft);
              }}
            >
              <input
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="…o escribe tu reporte"
                aria-label="Escribir tu reporte"
                className="h-10 min-w-0 flex-1 rounded-xl border border-line bg-white px-3 text-sm text-navy-900 placeholder:text-navy-400 focus:border-royal-400 focus:outline-none"
              />
              <button
                type="submit"
                disabled={!draft.trim() || busy}
                aria-label="Enviar texto"
                className="flex h-10 w-10 items-center justify-center rounded-xl bg-navy-900 text-white transition disabled:opacity-40"
              >
                <Send className="h-4 w-4" aria-hidden />
              </button>
            </form>
          </div>
        </section>
      ) : null}

      <button
        type="button"
        onClick={() => (open ? closeCall() : setOpen(true))}
        aria-expanded={open}
        className={cn(
          "inline-flex h-14 items-center gap-2 rounded-full px-5 text-sm font-bold text-white shadow-[0_18px_34px_-18px_rgba(20,18,15,.7)] transition",
          open ? "bg-navy-900" : "bg-royal-600 hover:bg-royal-700",
        )}
      >
        {open ? <PhoneOff className="h-4 w-4" aria-hidden /> : <Phone className="h-4 w-4" aria-hidden />}
        {open ? "Colgar" : "Llamar a VotaVía"}
      </button>
    </div>
  );
}

function Bubble({ role, text, href }: { role: "bot" | "user"; text: string; href?: string }) {
  const content = href ? (
    <a href={href} className="font-semibold text-royal-700 underline underline-offset-2">
      {text}
    </a>
  ) : (
    text
  );

  return (
    <div className={cn("flex", role === "user" ? "justify-end" : "justify-start")}>
      <p
        className={cn(
          "max-w-[86%] whitespace-pre-line rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed",
          role === "user"
            ? "rounded-br-md bg-royal-600 text-white"
            : "rounded-bl-md bg-white text-navy-800 ring-1 ring-inset ring-line",
        )}
      >
        {content}
      </p>
    </div>
  );
}

function Dot({ delay }: { delay: string }) {
  return (
    <span
      style={{ animationDelay: delay }}
      className="h-1.5 w-1.5 animate-bounce rounded-full bg-royal-400"
      aria-hidden
    />
  );
}
