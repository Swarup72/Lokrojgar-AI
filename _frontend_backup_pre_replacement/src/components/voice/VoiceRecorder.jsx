import { useEffect, useRef, useState } from "react";
import { Mic, Square, RefreshCw, Play, Pause } from "lucide-react";
import { useLanguage } from "../../hooks/useLanguage";
import "./VoiceRecorder.css";

function formatTime(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

/**
 * Records microphone audio via the native MediaRecorder API - no external
 * recording library was already present in this project, and adding one
 * just for this would be unnecessary weight.
 *
 * Only produces a Blob via `onRecordingComplete` when the user explicitly
 * stops recording - it never uploads anything itself. The parent
 * (VoiceProfilePage) decides when to actually send it.
 * @param {{onRecordingComplete: (blob: Blob) => void}} props
 */
export function VoiceRecorder({ onRecordingComplete }) {
  const { t } = useLanguage();
  const [permissionState, setPermissionState] = useState("idle"); // idle | requesting | denied
  const [recordingState, setRecordingState] = useState("idle"); // idle | recording | stopped
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [audioUrl, setAudioUrl] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);

  const mediaRecorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);
  const audioRef = useRef(null);

  useEffect(() => {
    return () => {
      clearInterval(timerRef.current);
      streamRef.current?.getTracks().forEach((track) => track.stop());
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startRecording = async () => {
    setPermissionState("requesting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      setPermissionState("granted");

      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        setAudioUrl(URL.createObjectURL(blob));
        onRecordingComplete(blob);
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setRecordingState("recording");
      setElapsedSeconds(0);
      timerRef.current = setInterval(() => setElapsedSeconds((prev) => prev + 1), 1000);
    } catch {
      setPermissionState("denied");
    }
  };

  const stopRecording = () => {
    clearInterval(timerRef.current);
    mediaRecorderRef.current?.stop();
    setRecordingState("stopped");
  };

  const reRecord = () => {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioUrl(null);
    setRecordingState("idle");
    setElapsedSeconds(0);
    setIsPlaying(false);
  };

  const togglePlayback = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
  };

  return (
    <div className="voice-recorder">
      {recordingState === "idle" && (
        <>
          <button type="button" className="voice-recorder-start" onClick={startRecording} disabled={permissionState === "requesting"}>
            <Mic size={28} aria-hidden="true" />
          </button>
          <p className="voice-recorder-hint">
            {permissionState === "denied"
              ? t("voice.micDenied")
              : t("voice.tapToRecord")}
          </p>
        </>
      )}

      {recordingState === "recording" && (
        <>
          <div className="voice-recorder-pulse" aria-hidden="true">
            <Mic size={28} />
          </div>
          <p className="voice-recorder-time" aria-live="polite">
            {formatTime(elapsedSeconds)}
          </p>
          <button type="button" className="voice-recorder-stop" onClick={stopRecording}>
            <Square size={16} aria-hidden="true" /> {t("voice.stopRecording")}
          </button>
        </>
      )}

      {recordingState === "stopped" && audioUrl && (
        <div className="voice-recorder-preview">
          <audio
            ref={audioRef}
            src={audioUrl}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            onEnded={() => setIsPlaying(false)}
          />
          <button type="button" className="voice-recorder-play" onClick={togglePlayback}>
            {isPlaying ? <Pause size={16} aria-hidden="true" /> : <Play size={16} aria-hidden="true" />}
            <span>{isPlaying ? "Pause" : "Play"}</span>
          </button>
          <span className="voice-recorder-duration">{formatTime(elapsedSeconds)}</span>
          <button type="button" className="voice-recorder-rerecord" onClick={reRecord}>
            <RefreshCw size={15} aria-hidden="true" /> {t("voice.review.reRecord")}
          </button>
        </div>
      )}
    </div>
  );
}
