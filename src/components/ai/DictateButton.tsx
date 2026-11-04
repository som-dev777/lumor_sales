"use client";

import { Mic, Square } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { dictate } from "@/server/actions/ai";
import styles from "./ai.module.scss";

/** Longest recording, in seconds (matches the server's limit). */
const MAX_SECONDS = 180;
/** Formats the browser can record in, best first (Safari on iPhone records audio/mp4). */
const TYPES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];

type State = "idle" | "recording" | "working";

const canRecord = () =>
  typeof MediaRecorder !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia);
const noop = () => () => {};

/**
 * Voice typing (D-055): click the mic, speak, click Stop. The recording is turned into text by the
 * AI on the server and added to the text box, like the mic in other AI apps. Hidden in browsers
 * that can't record.
 */
export function DictateButton({
  onText,
  disabled = false,
  label = "Speak instead of typing",
  unavailable,
  children,
}: {
  onText: (text: string) => void;
  disabled?: boolean;
  label?: string;
  /** Shown when the browser can't record or the mic is blocked; the button then stays visible. */
  unavailable?: string;
  /** A visible label next to the mic (e.g. "Dictate"). */
  children?: React.ReactNode;
}) {
  const notify = useToast();
  const [state, setState] = useState<State>("idle");
  const [seconds, setSeconds] = useState(0);
  // Known only in the browser; the server renders without the button.
  const supported = useSyncExternalStore(noop, canRecord, () => false);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const cancelled = useRef(false);
  const elapsed = useRef(0);

  const stopAll = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    if (recorder.current?.state === "recording") recorder.current.stop();
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
  };

  // Leaving the page (or Next.js hiding it) stops the mic and drops the recording.
  useEffect(
    () => () => {
      cancelled.current = true;
      if (timer.current) clearInterval(timer.current);
      if (recorder.current?.state === "recording") recorder.current.stop();
      stream.current?.getTracks().forEach((t) => t.stop());
    },
    [],
  );

  async function start() {
    cancelled.current = false;
    let media: MediaStream;
    try {
      media = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      notify(
        "error",
        unavailable ??
          "Couldn't use the microphone. Allow it for this site in your browser settings, then try again.",
      );
      return;
    }
    stream.current = media;
    const type = TYPES.find((t) => MediaRecorder.isTypeSupported?.(t));
    const rec = new MediaRecorder(media, type ? { mimeType: type } : undefined);
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    rec.onstop = async () => {
      stopAll();
      if (cancelled.current) {
        setState("idle");
        return;
      }
      setState("working");
      const blob = new Blob(chunks, { type: rec.mimeType || type || "audio/webm" });
      const form = new FormData();
      form.append("audio", blob, "recording");
      const r = await dictate(form);
      setState("idle");
      if (r.ok) onText(r.data);
      else notify("error", r.error);
    };
    recorder.current = rec;
    rec.start();
    elapsed.current = 0;
    setSeconds(0);
    setState("recording");
    timer.current = setInterval(() => {
      elapsed.current += 1;
      setSeconds(elapsed.current);
      if (elapsed.current >= MAX_SECONDS) stop();
    }, 1000);
  }

  function stop() {
    if (recorder.current?.state === "recording") recorder.current.stop();
  }

  if (!supported) {
    if (!unavailable) return null;
    return (
      <Button variant="secondary" onClick={() => notify("error", unavailable)} aria-label={label}>
        <Mic size={16} aria-hidden />
        {children ?? <span className={styles.srOnly}>{label}</span>}
      </Button>
    );
  }
  const clock = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  return state === "recording" ? (
    <Button variant="danger" onClick={stop} aria-label="Stop recording and add what I said">
      <Square size={14} aria-hidden /> Stop · {clock}
      <span className={styles.recDot} aria-hidden />
    </Button>
  ) : (
    <Button
      variant="secondary"
      onClick={start}
      loading={state === "working"}
      disabled={disabled}
      aria-label={label}
      title={label}
    >
      <Mic size={16} aria-hidden />
      {state === "working"
        ? "Writing it down…"
        : (children ?? <span className={styles.srOnly}>{label}</span>)}
    </Button>
  );
}
