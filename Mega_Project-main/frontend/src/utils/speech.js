/**
 * LokRozgar AI - Speech Synthesis Utility
 *
 * Provides safe, robust text-to-speech across Marathi (mr-IN), Hindi (hi-IN),
 * and English (en-IN / en-US).
 *
 * Key guarantees:
 * 1. Cancels active speech before starting new speech (prevents overlapping/stuck audio).
 * 2. Selects an authentic Marathi / Hindi / Indian English voice.
 * 3. Never attempts to read Devanagari text through an incompatible English voice.
 * 4. Listens to asynchronous voice loading (speechSynthesis.onvoiceschanged).
 * 5. Provides pause, resume, and stop controls.
 * 6. Graceful fallback and user-facing notifications when a voice is unavailable.
 */

let cachedVoices = [];
let voicesLoaded = false;

function initVoices() {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    return;
  }

  const update = () => {
    try {
      cachedVoices = window.speechSynthesis.getVoices() || [];
      if (cachedVoices.length > 0) {
        voicesLoaded = true;
      }
    } catch {
      // Ignore voice query errors
    }
  };

  update();
  if (window.speechSynthesis.onvoiceschanged !== undefined) {
    window.speechSynthesis.onvoiceschanged = update;
  }
  if (typeof window.speechSynthesis.addEventListener === "function") {
    window.speechSynthesis.addEventListener("voiceschanged", update);
  }
}

initVoices();

/**
 * Normalizes language codes to base pairs.
 * @param {string} lang - 'mr', 'hi', 'en', 'mr-IN', etc.
 */
export function normalizeLang(lang) {
  const code = String(lang || "en").toLowerCase().slice(0, 2);
  if (code === "mr") return "mr-IN";
  if (code === "hi") return "hi-IN";
  return "en-IN";
}

/**
 * Finds the best matching voice for the given language.
 * Prefers an authentic voice for the language; for Marathi (mr-IN),
 * falls back to a compatible Devanagari script voice (hi-IN / Lekha)
 * if no dedicated Marathi voice is installed on the host system.
 *
 * @param {string} lang
 * @returns {SpeechSynthesisVoice|null}
 */
export function getBestVoice(lang) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    return null;
  }

  const liveVoices = window.speechSynthesis.getVoices() || [];
  if (liveVoices.length > 0) {
    cachedVoices = liveVoices;
  }

  const targetLang = normalizeLang(lang);
  const langPrefix = targetLang.slice(0, 2); // 'mr', 'hi', 'en'

  // 1. Exact match by lang code (e.g. 'mr-IN', 'hi-IN')
  let match = cachedVoices.find(
    (v) => v.lang.toLowerCase().replace(/_/g, "-") === targetLang.toLowerCase()
  );
  if (match) return match;

  // 2. Prefix match by lang code (e.g. 'mr', 'hi', 'en')
  match = cachedVoices.find((v) =>
    v.lang.toLowerCase().startsWith(langPrefix)
  );
  if (match) return match;

  // 3. Name match for languages like Marathi / Hindi / Indian English
  const langNames = {
    mr: ["marathi", "मराठी"],
    hi: ["hindi", "हिन्दी", "हिंदी", "lekha"],
    en: ["indian english", "rishi", "english", "india"],
  };

  const keywords = langNames[langPrefix] || [];
  for (const keyword of keywords) {
    match = cachedVoices.find((v) =>
      v.name.toLowerCase().includes(keyword)
    );
    if (match) return match;
  }

  // 4. Compatible Devanagari script voice fallback for Marathi:
  // When no dedicated Marathi voice is pre-installed on the operating system
  // (e.g. default macOS / iOS which bundles Lekha for Devanagari but no mr-IN voice),
  // a Devanagari voice correctly renders the shared Devanagari orthography.
  if (langPrefix === "mr") {
    const devanagariVoice = cachedVoices.find(
      (v) =>
        v.lang.toLowerCase().startsWith("hi") ||
        v.name.toLowerCase().includes("hindi") ||
        v.name.toLowerCase().includes("हिन्दी") ||
        v.name.toLowerCase().includes("हिंदी") ||
        v.name.toLowerCase().includes("lekha")
    );
    if (devanagariVoice) return devanagariVoice;
  }

  return null;
}

/**
 * Checks if a compatible voice is available for the given language.
 * @param {string} lang
 * @returns {boolean}
 */
export function isVoiceAvailable(lang) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    return false;
  }
  if (getBestVoice(lang) !== null) {
    return true;
  }
  const live = window.speechSynthesis.getVoices() || [];
  return live.length === 0;
}

/**
 * Stops any active speech synthesis.
 */
export function stopSpeech() {
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
}

/**
 * Pauses currently playing speech.
 */
export function pauseSpeech() {
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    if (window.speechSynthesis.speaking && !window.speechSynthesis.paused) {
      window.speechSynthesis.pause();
    }
  }
}

/**
 * Resumes paused speech.
 */
export function resumeSpeech() {
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    if (window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
    }
  }
}

/**
 * Returns whether speech is currently paused.
 * @returns {boolean}
 */
export function isSpeechPaused() {
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    return window.speechSynthesis.paused;
  }
  return false;
}

/**
 * Returns whether speech is currently active (speaking or paused).
 * @returns {boolean}
 */
export function isSpeaking() {
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    return window.speechSynthesis.speaking;
  }
  return false;
}

/**
 * Speaks text using the best matching voice.
 * For Marathi (mr-IN), prefers a genuine Marathi voice; if none is pre-installed,
 * uses a Devanagari voice (hi-IN) or invokes the browser's mr-IN synthesizer.
 *
 * @param {object} options
 * @param {string} options.text
 * @param {string} options.lang - 'mr', 'hi', 'en'
 * @param {number} [options.rate=0.88]
 * @param {number} [options.pitch=1.0]
 * @param {() => void} [options.onStart]
 * @param {() => void} [options.onEnd]
 * @param {() => void} [options.onPause]
 * @param {() => void} [options.onResume]
 * @param {(err: any) => void} [options.onError]
 * @param {(info: { lang: string, reason: string }) => void} [options.onNoVoice]
 * @returns {boolean} Whether speech was initiated
 */
export function speakText({
  text,
  lang = "mr",
  rate = 0.88,
  pitch = 1.0,
  onStart,
  onEnd,
  onPause,
  onResume,
  onError,
  onNoVoice,
}) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    onNoVoice?.({ lang, reason: "Speech synthesis not supported in this browser" });
    return false;
  }

  // Cancel any ongoing speech first to prevent overlap
  stopSpeech();

  if (!text || !text.trim()) {
    return false;
  }

  const liveVoices = window.speechSynthesis.getVoices() || [];
  if (liveVoices.length > 0) {
    cachedVoices = liveVoices;
  }

  const targetCode = normalizeLang(lang);
  const langPrefix = targetCode.slice(0, 2);
  const voice = getBestVoice(lang);

  // If language is Marathi or Hindi, and voices are loaded but contain NO Indic / Devanagari voice at all,
  // do NOT let Chrome use a pure US/UK English voice to read Devanagari script.
  if (langPrefix === "mr" || langPrefix === "hi") {
    const hasIndicCapability =
      voice !== null ||
      cachedVoices.length === 0 || // Voices not loaded yet: allow browser to attempt synthesis
      cachedVoices.some(
        (v) =>
          v.lang.toLowerCase().startsWith("mr") ||
          v.lang.toLowerCase().startsWith("hi") ||
          v.name.toLowerCase().includes("marathi") ||
          v.name.toLowerCase().includes("hindi") ||
          v.name.toLowerCase().includes("lekha")
      );

    if (!hasIndicCapability) {
      onNoVoice?.({
        lang: targetCode,
        reason: `No compatible ${langPrefix === "mr" ? "Marathi" : "Hindi"} voice found in your browser or device.`,
      });
      return false;
    }
  }

  try {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = targetCode; // ALWAYS explicitly set mr-IN, hi-IN, or en-IN
    if (voice) {
      utterance.voice = voice;
    }
    utterance.rate = rate;
    utterance.pitch = pitch;

    utterance.onstart = () => {
      onStart?.();
    };

    utterance.onpause = () => {
      onPause?.();
    };

    utterance.onresume = () => {
      onResume?.();
    };

    utterance.onend = () => {
      onEnd?.();
    };

    utterance.onerror = (event) => {
      // 'canceled' or 'interrupted' is expected when user stops or switches
      if (event?.error !== "canceled" && event?.error !== "interrupted") {
        onError?.(event);
      }
      onEnd?.();
    };

    window.speechSynthesis.speak(utterance);
    return true;
  } catch (err) {
    onError?.(err);
    onEnd?.();
    return false;
  }
}
