import { useRef, useState } from "react";
import { Upload, FileAudio, RefreshCw } from "lucide-react";
import { AUDIO_MIME_TYPES, MAX_AUDIO_BYTES } from "../../utils/enums";
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
  const inputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [validationError, setValidationError] = useState(null);

  const validate = (candidate) => {
    if (!candidate) return "No file selected.";
    if (candidate.size === 0) return "That file appears to be empty. Please choose a different file.";
    if (candidate.size > MAX_AUDIO_BYTES) {
      return `That file is ${formatBytes(candidate.size)} - the maximum supported size is 15 MB.`;
    }
    if (candidate.type && !AUDIO_MIME_TYPES.includes(candidate.type)) {
      return "That file type isn't supported. Please choose an MP3, WAV, OGG, M4A, or WEBM audio file.";
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
          <RefreshCw size={14} aria-hidden="true" /> Choose different file
        </button>
      </div>
    );
  }

  return (
    <div className="audio-uploader">
      <label className="audio-uploader-dropzone">
        <Upload size={24} aria-hidden="true" />
        <span>Upload Audio</span>
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
