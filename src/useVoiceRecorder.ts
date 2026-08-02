import { useCallback, useRef, useState } from "react";

// Records mic audio via MediaRecorder and hands back an ArrayBuffer on stop.
// Shared by the Fan Guide chat, the Show Console voice cascade, and the
// floating global voice widget.
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

  const teardown = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    recorderRef.current = null;
    setRecording(false);
  }, []);

  // Stop and return the recorded audio — the normal "done talking" path.
  const stop = useCallback((): Promise<ArrayBuffer | null> => {
    return new Promise((resolve) => {
      const recorder = recorderRef.current;
      if (!recorder) {
        resolve(null);
        return;
      }
      recorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType });
        teardown();
        if (blob.size === 0) {
          resolve(null);
          return;
        }
        resolve(await blob.arrayBuffer());
      };
      recorder.stop();
    });
  }, [teardown]);

  // Stop and discard — the "stop" control, not "send".
  const cancel = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder) return;
    recorder.onstop = null;
    recorder.stop();
    teardown();
  }, [teardown]);

  return { recording, start, stop, cancel, error };
}

// Manages a single <audio> element for Arlo's spoken replies: mute, stop,
// and an isSpeaking flag so the UI can show "Arlo is speaking…" like a real
// call rather than a chat bubble that happens to also make sound.
export function useSpeaker() {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [muted, setMuted] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const mutedRef = useRef(false);
  mutedRef.current = muted;

  const stop = useCallback(() => {
    audioRef.current?.pause();
    audioRef.current = null;
    setIsSpeaking(false);
  }, []);

  const speak = useCallback(
    (base64: string) => {
      if (mutedRef.current) return;
      stop();
      const audio = new Audio(`data:audio/mp3;base64,${base64}`);
      audioRef.current = audio;
      audio.onended = () => setIsSpeaking(false);
      audio.onpause = () => setIsSpeaking(false);
      setIsSpeaking(true);
      void audio.play().catch(() => setIsSpeaking(false));
    },
    [stop]
  );

  return { speak, stop, isSpeaking, muted, setMuted };
}
