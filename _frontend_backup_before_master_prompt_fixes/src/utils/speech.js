/**
 * LokRozgar AI - Speech Synthesis Utility
 *
 * Provides safe, robust text-to-speech across Marathi (mr-IN), Hindi (hi-IN),
 * and English (en-IN / en-US).
 *
 * Key guarantees:
 * 1. Cancels active speech before starting new speech (prevents overlapping/stuck audio).
 * 2. Selects an authentic Marathi voice (lang mr-IN / mr or voice name contains "marathi").
 * 3. Never attempts to read Devanagari text through an incompatible English voice.
 * 4. Listens to asynchronous voice loading (speechSynthesis.onvoiceschanged).
 * 5. Provides graceful fallback / notification when a voice is unavailable.
 */

let cachedVoices = [];
let voicesLoaded = false;

function initVoices() {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    return;
  }

  const update = () => {
    cachedVoices = window.speechSynthesis.getVoices() || [];
    if (cachedVoices.length > 0) {
      voicesLoaded = true;
    }
  };

  update();
  if (window.speechSynthesis.onvoiceschanged !== undefined) {
    window.speechSynthesis.onvoiceschanged = update;
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
 * @param {string} lang
 * @returns {SpeechSynthesisVoice|null}
 */
export function getBestVoice(lang) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    return null;
  }

  if (cachedVoices.length === 0) {
    cachedVoices = window.speechSynthesis.getVoices() || [];
  }

  const targetLang = normalizeLang(lang);
  const langPrefix = targetLang.slice(0, 2); // 'mr', 'hi', 'en'

  // Exact match by lang code
  let match = cachedVoices.find(
    (v) => v.lang.toLowerCase() === targetLang.toLowerCase()
  );
  if (match) return match;

  // Prefix match by lang code (e.g. 'mr', 'mr_IN')
  match = cachedVoices.find((v) =>
    v.lang.toLowerCase().startsWith(langPrefix)
  );
  if (match) return match;

  // Name match for languages like Marathi / Hindi
  const langNames = {
    mr: ["marathi", "मराठी"],
    hi: ["hindi", "हिन्दी", "हिंदी"],
    en: ["indian english", "english", "india"],
  };

  const keywords = langNames[langPrefix] || [];
  for (const keyword of keywords) {
    match = cachedVoices.find((v) =>
      v.name.toLowerCase().includes(keyword)
    );
    if (match) return match;
  }

  return null;
}

/**
 * Checks if a compatible voice is available for the given language.
 * @param {string} lang
 * @returns {boolean}
 */
export function isVoiceAvailable(lang) {
  return getBestVoice(lang) !== null;
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
 * Speaks text using the best matching voice.
 * If no compatible voice exists for Marathi/Hindi, does NOT speak gibberish
 * and instead invokes onNoVoice callback.
 *
 * @param {object} options
 * @param {string} options.text
 * @param {string} options.lang - 'mr', 'hi', 'en'
 * @param {number} [options.rate=0.88]
 * @param {number} [options.pitch=1.0]
 * @param {() => void} [options.onStart]
 * @param {() => void} [options.onEnd]
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

  const voice = getBestVoice(lang);
  const targetCode = normalizeLang(lang);
  const langPrefix = targetCode.slice(0, 2);

  // If language is Marathi or Hindi, and no compatible Indian/Devanagari voice is found,
  // do NOT let Chrome use an English voice to read Marathi/Hindi words.
  if ((langPrefix === "mr" || langPrefix === "hi") && !voice) {
    onNoVoice?.({
      lang: targetCode,
      reason: `No compatible ${langPrefix === "mr" ? "Marathi" : "Hindi"} voice found in your browser or device.`,
    });
    return false;
  }

  try {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = voice?.lang || targetCode;
    if (voice) {
      utterance.voice = voice;
    }
    utterance.rate = rate;
    utterance.pitch = pitch;

    utterance.onstart = () => {
      onStart?.();
    };

    utterance.onend = () => {
      onEnd?.();
    };

    utterance.onerror = (event) => {
      // 'canceled' or 'interrupted' is expected when user stops or switches
      if (event.error !== "canceled" && event.error !== "interrupted") {
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

