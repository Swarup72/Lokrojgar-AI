import test from "node:test";
import assert from "node:assert";

let speechModule;
let vite;

test.before(async () => {
  const { createServer } = await import("vite");
  vite = await createServer({
    server: { middlewareMode: true, hmr: false, ws: false },
    appType: "custom",
    logLevel: "silent",
  });

  speechModule = await vite.ssrLoadModule("/src/utils/speech.js");
});

test.after(async () => {
  await vite?.close();
});

test("normalizeLang correctly maps language codes", () => {
  assert.strictEqual(speechModule.normalizeLang("mr"), "mr-IN");
  assert.strictEqual(speechModule.normalizeLang("mr-IN"), "mr-IN");
  assert.strictEqual(speechModule.normalizeLang("hi"), "hi-IN");
  assert.strictEqual(speechModule.normalizeLang("hi-IN"), "hi-IN");
  assert.strictEqual(speechModule.normalizeLang("en"), "en-IN");
  assert.strictEqual(speechModule.normalizeLang("unknown"), "en-IN");
  assert.strictEqual(speechModule.normalizeLang(null), "en-IN");
});

test("speakText invokes onNoVoice when speech synthesis is unsupported in the environment", () => {
  // In Node environment without window.speechSynthesis
  let noVoiceCalled = false;
  let receivedReason = "";

  const started = speechModule.speakText({
    text: "Test job announcement",
    lang: "en",
    onNoVoice: ({ reason }) => {
      noVoiceCalled = true;
      receivedReason = reason;
    },
  });

  assert.strictEqual(started, false);
  assert.strictEqual(noVoiceCalled, true);
  assert.ok(receivedReason.includes("not supported"));
});

test("mocked browser speech synthesis lifecycle: start, pause, resume, cancel", () => {
  // Mock window.speechSynthesis
  const mockCalls = [];
  const mockSynth = {
    speaking: false,
    paused: false,
    cancel() {
      mockCalls.push("cancel");
      this.speaking = false;
      this.paused = false;
    },
    pause() {
      mockCalls.push("pause");
      this.paused = true;
    },
    resume() {
      mockCalls.push("resume");
      this.paused = false;
    },
    speak(utterance) {
      mockCalls.push("speak");
      this.speaking = true;
      // Trigger onstart
      utterance.onstart?.();
    },
    getVoices() {
      return [
        { name: "Google Marathi", lang: "mr-IN" },
        { name: "Google Hindi", lang: "hi-IN" },
        { name: "Google English India", lang: "en-IN" },
      ];
    },
  };

  class MockUtterance {
    constructor(text) {
      this.text = text;
      this.lang = "en-IN";
      this.voice = null;
      this.rate = 1.0;
      this.pitch = 1.0;
    }
  }

  globalThis.window = {
    speechSynthesis: mockSynth,
  };
  globalThis.SpeechSynthesisUtterance = MockUtterance;

  let startedCallbackCalled = false;

  // 1. Initial speak
  const started = speechModule.speakText({
    text: "Job Title: Plumber. Location: Pune. Salary: 800 daily.",
    lang: "en",
    onStart: () => {
      startedCallbackCalled = true;
    },
  });

  assert.strictEqual(started, true);
  assert.strictEqual(startedCallbackCalled, true);
  assert.ok(mockCalls.includes("cancel"), "Must cancel previous speech before speaking");
  assert.ok(mockCalls.includes("speak"), "Must invoke speak()");

  // 2. Pause
  speechModule.pauseSpeech();
  assert.ok(mockCalls.includes("pause"), "Must call pause on active speech");
  assert.strictEqual(speechModule.isSpeechPaused(), true);

  // 3. Resume
  speechModule.resumeSpeech();
  assert.ok(mockCalls.includes("resume"), "Must call resume on paused speech");
  assert.strictEqual(speechModule.isSpeechPaused(), false);

  // 4. Repeated click cancels ongoing speech and starts fresh (no audio overlap)
  mockCalls.length = 0;
  speechModule.speakText({
    text: "Second job details",
    lang: "en",
  });
  assert.strictEqual(mockCalls[0], "cancel", "Repeated click must cancel first before speaking");
  assert.strictEqual(mockCalls[1], "speak");

  // 5. Stop speech
  speechModule.stopSpeech();
  assert.strictEqual(speechModule.isSpeaking(), false);

  // Clean up globals
  delete globalThis.window;
  delete globalThis.SpeechSynthesisUtterance;
});

test("Marathi speech synthesis falls back to compatible Devanagari voice when dedicated Marathi voice is missing", () => {
  // Simulates macOS / Chrome environment where Lekha (hi-IN) is present but no mr-IN voice exists
  let spokenUtterance = null;
  const mockSynth = {
    speaking: false,
    cancel() {},
    speak(utterance) {
      spokenUtterance = utterance;
      utterance.onstart?.();
    },
    getVoices() {
      return [
        { name: "Lekha", lang: "hi-IN" },
        { name: "Rishi", lang: "en-IN" },
        { name: "Samantha", lang: "en-US" },
      ];
    },
  };

  class MockUtterance {
    constructor(text) {
      this.text = text;
      this.lang = "en-IN";
      this.voice = null;
    }
  }

  globalThis.window = { speechSynthesis: mockSynth };
  globalThis.SpeechSynthesisUtterance = MockUtterance;

  let started = false;
  let noVoiceCalled = false;

  const result = speechModule.speakText({
    text: "लोक रोजगार ए आय मध्ये आपले स्वागत आहे.",
    lang: "mr",
    onStart: () => { started = true; },
    onNoVoice: () => { noVoiceCalled = true; },
  });

  assert.strictEqual(result, true, "speakText must return true when compatible Devanagari voice exists");
  assert.strictEqual(started, true, "onStart must be called");
  assert.strictEqual(noVoiceCalled, false, "onNoVoice must NOT be called when Devanagari voice is available");
  assert.strictEqual(spokenUtterance?.lang, "mr-IN", "Must set utterance.lang = 'mr-IN'");
  assert.strictEqual(spokenUtterance?.voice?.name, "Lekha", "Must assign compatible Devanagari voice");

  delete globalThis.window;
  delete globalThis.SpeechSynthesisUtterance;
});

test("Empty voice list on initial load attempts browser synthesis with mr-IN locale without premature rejection", () => {
  // Simulates Chromium startup before voices finish loading
  let spokenUtterance = null;
  const mockSynth = {
    speaking: false,
    cancel() {},
    speak(utterance) {
      spokenUtterance = utterance;
      utterance.onstart?.();
    },
    getVoices() {
      return []; // Empty list initially
    },
  };

  class MockUtterance {
    constructor(text) {
      this.text = text;
      this.lang = "en-IN";
      this.voice = null;
    }
  }

  globalThis.window = { speechSynthesis: mockSynth };
  globalThis.SpeechSynthesisUtterance = MockUtterance;

  let started = false;
  let noVoiceCalled = false;

  const result = speechModule.speakText({
    text: "लोक रोजगार ए आय मध्ये आपले स्वागत आहे.",
    lang: "mr",
    onStart: () => { started = true; },
    onNoVoice: () => { noVoiceCalled = true; },
  });

  assert.strictEqual(result, true, "Must attempt browser synthesis even if voice list is empty initially");
  assert.strictEqual(started, true, "onStart must fire on successful speak");
  assert.strictEqual(noVoiceCalled, false, "Must not prematurely reject when voice list is not yet populated");
  assert.strictEqual(spokenUtterance?.lang, "mr-IN", "Must set utterance.lang = 'mr-IN'");

  delete globalThis.window;
  delete globalThis.SpeechSynthesisUtterance;
});

test("Synthesis error triggers onError callback and cleans up speaking state", () => {
  let errorEventReceived = null;
  let ended = false;

  const mockSynth = {
    speaking: false,
    cancel() {},
    speak(utterance) {
      // Simulate synthesis error
      setTimeout(() => {
        utterance.onerror?.({ error: "audio-busy" });
      }, 5);
    },
    getVoices() {
      return [{ name: "Google Marathi", lang: "mr-IN" }];
    },
  };

  class MockUtterance {
    constructor(text) {
      this.text = text;
      this.lang = "en-IN";
    }
  }

  globalThis.window = { speechSynthesis: mockSynth };
  globalThis.SpeechSynthesisUtterance = MockUtterance;

  return new Promise((resolve) => {
    speechModule.speakText({
      text: "नमस्कार",
      lang: "mr",
      onError: (err) => {
        errorEventReceived = err;
      },
      onEnd: () => {
        ended = true;
        assert.strictEqual(errorEventReceived?.error, "audio-busy");
        assert.strictEqual(ended, true);
        delete globalThis.window;
        delete globalThis.SpeechSynthesisUtterance;
        resolve();
      },
    });
  });
});


