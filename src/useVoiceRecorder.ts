import { useCallback, useRef, useState } from "react";

// Records mic audio via MediaRecorder and hands back an ArrayBuffer on stop.
// Shared by the Fan Guide chat and the Show Console voice cascade.
export function useVoiceRecorder() {
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  const start = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : MediaRecorder.isTypeSupported("audio/mp4")
          ? "audio/mp4"
          : "";
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.start();
      recorderRef.current = recorder;
      setRecording(true);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Couldn't access the microphone."
      );
    }
  }, []);

  const stop = useCallback((): Promise<ArrayBuffer | null> => {
    return new Promise((resolve) => {
      const recorder = recorderRef.current;
      if (!recorder) {
        resolve(null);
        return;
      }
      recorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType });
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        recorderRef.current = null;
        setRecording(false);
        if (blob.size === 0) {
          resolve(null);
          return;
        }
        resolve(await blob.arrayBuffer());
      };
      recorder.stop();
    });
  }, []);

  return { recording, start, stop, error };
}

export function playBase64Audio(base64: string) {
  const audio = new Audio(`data:audio/mp3;base64,${base64}`);
  void audio.play().catch(() => {
    // Autoplay can be blocked before any user gesture — silently ignore,
    // the text answer is already visible either way.
  });
}
