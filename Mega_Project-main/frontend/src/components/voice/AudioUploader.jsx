import { useRef, useState } from "react";
import { Upload, FileAudio, RefreshCw } from "lucide-react";
import { AUDIO_MIME_TYPES, MAX_AUDIO_BYTES } from "../../utils/enums";
import { useLanguage } from "../../hooks/useLanguage";
import "./AudioUploader.css";

function formatBytes(bytes) {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * File-upload alternative to VoiceRecorder. Validates the exact same
 * constraints the backend enforces (MIME allowlist, 15MB cap, non-empty)
 * BEFORE ever calling `onFileReady` - so a doomed upload never reaches the
 * network in the first place.
 * @param {{onFileReady: (file: File) => void}} props
 */
export function AudioUploader({ onFileReady }) {
  const { t } = useLanguage();
  const inputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [validationError, setValidationError] = useState(null);

  const validate = (candidate) => {
    if (!candidate) return t("audio.noFile");
    if (candidate.size === 0) return t("audio.empty");
    if (candidate.size > MAX_AUDIO_BYTES) {
      return t("audio.tooLarge", { size: formatBytes(candidate.size) });
    }
    if (candidate.type && !AUDIO_MIME_TYPES.includes(candidate.type)) {
      return t("audio.badType");
    }
    return null;
  };

  const handleChange = (event) => {
    const candidate = event.target.files?.[0];
    const error = validate(candidate);
    if (error) {
      setValidationError(error);
      setFile(null);
      return;
    }
    setValidationError(null);
    setFile(candidate);
    onFileReady(candidate);
  };

  const reset = () => {
    setFile(null);
    setValidationError(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  if (file) {
    return (
      <div className="audio-uploader-preview">
        <FileAudio size={20} aria-hidden="true" />
        <span className="audio-uploader-filename">{file.name}</span>
        <span className="audio-uploader-size">{formatBytes(file.size)}</span>
        <button type="button" onClick={reset}>
          <RefreshCw size={14} aria-hidden="true" /> {t("audio.chooseDifferent")}
        </button>
      </div>
    );
  }

  return (
    <div className="audio-uploader">
      <label className="audio-uploader-dropzone">
        <Upload size={24} aria-hidden="true" />
        <span>{t("uploadAudio")}</span>
        <input
          ref={inputRef}
          type="file"
          accept="audio/*"
          onChange={handleChange}
          className="visually-hidden"
        />
      </label>
      {validationError && <p className="audio-uploader-error">{validationError}</p>}
    </div>
  );
}
