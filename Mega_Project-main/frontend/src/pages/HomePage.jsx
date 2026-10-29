
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import {
  Wrench,
  Droplets,
  Car,
  Package,
  HardHat,
  ShieldCheck,
  ArrowRight,
  Sparkles,
  Volume2,
  VolumeX,
  AlertCircle,
  RotateCcw,
} from "lucide-react";

import { useLanguage } from "../hooks/useLanguage";
import { speakText, stopSpeech } from "../utils/speech";
import "./HomePage.css";

const FEATURE_KEYS = [
  "voice",
  "languages",
  "ai",
  "location",
  "ratings",
  "local",
];

const FEATURE_EMOJI = {
  voice: "🎤",
  languages: "🌐",
  ai: "🤖",
  location: "📍",
  ratings: "⭐",
  local: "🏢",
};

const LANGUAGE_CODES = {
  en: "en-IN",
  hi: "hi-IN",
  mr: "mr-IN",
};

export function HomePage() {
  const { t, language } = useLanguage();
  const navigate = useNavigate();

  const [speaking, setSpeaking] = useState(false);
  const [audioMessage, setAudioMessage] = useState("");
  const [fallbackVisible, setFallbackVisible] = useState(false);

  const lang = String(language || "en")
    .toLowerCase()
    .slice(0, 2);

  const isMarathi = lang === "mr";
  const isHindi = lang === "hi";

  const labels = {
    slogan: isMarathi
      ? "तुमचं काम, तुमची ओळख!"
      : isHindi
      ? "आपका काम, आपकी पहचान!"
      : "Your Work, Your Identity!",

    audioHelp: isMarathi
      ? "आवाजात मदत"
      : isHindi
      ? "आवाज़ में मदद"
      : "Listen to instructions",

    stopAudio: isMarathi
      ? "आवाज बंद करा"
      : isHindi
      ? "आवाज़ बंद करें"
      : "Stop audio",

    chooseWork: isMarathi
      ? "तुम्हाला कोणते काम पाहिजे?"
      : isHindi
      ? "आपको कौन सा काम चाहिए?"
      : "What type of work do you want?",

    tapCategory: isMarathi
      ? "खालील चित्रावर क्लिक करा"
      : isHindi
      ? "नीचे दिए गए चित्र पर क्लिक करें"
      : "Tap a job category below",

    audioUnavailable: isMarathi
      ? "या ब्राउझरमध्ये आवाजाची सुविधा उपलब्ध नाही."
      : isHindi
      ? "इस ब्राउज़र में ऑडियो सुविधा उपलब्ध नहीं है।"
      : "Audio instructions are not supported in this browser.",
  };

  const categories = [
    {
      key: "electrician",
      name: t("electrician"),
      query: "electrician",
      icon: Wrench,
      emoji: "⚡",
      description: t("electricianDesc"),
      className: "stagger-1",
    },
    {
      key: "plumber",
      name: t("plumber"),
      query: "plumber",
      icon: Droplets,
      emoji: "🚰",
      description: t("plumberDesc"),
      className: "stagger-2",
    },
    {
      key: "driver",
      name: t("driver"),
      query: "driver",
      icon: Car,
      emoji: "🚗",
      description: t("driverDesc"),
      className: "stagger-3",
    },
    {
      key: "delivery",
      name: t("deliveryPartner"),
      query: "delivery",
      icon: Package,
      emoji: "📦",
      description: t("deliveryDesc"),
      className: "stagger-4",
    },
    {
      key: "construction",
      name: t("constructionWorker"),
      query: "construction",
      icon: HardHat,
      emoji: "👷",
      description: t("constructionDesc"),
      className: "stagger-5",
    },
    {
      key: "security",
      name: t("securityGuard"),
      query: "security",
      icon: ShieldCheck,
      emoji: "🛡️",
      description: t("securityDesc"),
      className: "stagger-6",
    },
  ];

  useEffect(() => {
    return () => {
      stopSpeech();
    };
  }, []);

  useEffect(() => {
    stopSpeech();
    setSpeaking(false);
    setAudioMessage("");
    setFallbackVisible(false);
  }, [language]);

  const handleCategoryClick = (category) => {
    const params = new URLSearchParams();
    params.set("query", category.query);

    navigate(`/jobs?${params.toString()}`);
  };

  const instructions = isMarathi
    ? "लोक रोजगार ए आय मध्ये आपले स्वागत आहे. तुमचं काम, तुमची ओळख! नोकरी शोधण्यासाठी नोकरी शोधा या पानावर जा. तुम्ही खाली दिलेल्या कामाच्या चित्रावर क्लिक करून नोकऱ्या शोधू शकता. तुमच्या प्रोफाइलमध्ये तुमची माहिती आणि कौशल्ये भरू शकता."
    : isHindi
    ? "लोक रोजगार ए आई में आपका स्वागत है। आपका काम, आपकी पहचान! नौकरी खोजने के लिए नौकरी खोजें पेज पर जाएं। आप नीचे दिए गए काम के चित्र पर क्लिक करके नौकरी खोज सकते हैं। अपनी प्रोफ़ाइल में जानकारी और कौशल जोड़ सकते हैं।"
    : "Welcome to Lokrozgar AI. Your Work, Your Identity! To find a job, open the Find Jobs page. You can also select a job category below. Complete your profile to show employers your skills and experience.";

  const handleAudioHelp = () => {
    if (speaking) {
      stopSpeech();
      setSpeaking(false);
      return;
    }

    setAudioMessage("");
    setFallbackVisible(false);

    const started = speakText({
      text: instructions,
      lang,
      rate: 0.88,
      onStart: () => {
        setSpeaking(true);
        setFallbackVisible(false);
        setAudioMessage("");
      },
      onEnd: () => {
        setSpeaking(false);
      },
      onError: () => {
        setSpeaking(false);
        setAudioMessage(labels.audioUnavailable);
        setFallbackVisible(true);
      },
      onNoVoice: () => {
        setSpeaking(false);
        setAudioMessage(labels.audioUnavailable);
        setFallbackVisible(true);
      },
    });

    if (!started) {
      setSpeaking(false);
    }
  };

  return (
    <div className="home-page page-animate">
      {/* HERO SECTION */}
      <section className="hero visual-hero">
        <div className="hero-content">
          <div className="hero-text-content">
            <div className="hero-badge fade-in">
              <Sparkles size={17} aria-hidden="true" />
              <span>{t("aiPoweredMatching")}</span>
            </div>

            {/* NEW MULTILINGUAL SLOGAN */}
            <h1 className="hero-title slide-up">
              {labels.slogan}
            </h1>

            <p className="hero-description fade-in">
              {t("homeDescription")}
            </p>

            {/* AUDIO GUIDANCE */}
            <button
              type="button"
              className={`home-audio-help ${speaking ? "speaking" : ""}`}
              onClick={handleAudioHelp}
              aria-label={
                speaking
                  ? labels.stopAudio
                  : labels.audioHelp
              }
            >
              {speaking ? (
                <VolumeX size={21} aria-hidden="true" />
              ) : (
                <Volume2 size={21} aria-hidden="true" />
              )}

              <span>
                {speaking
                  ? labels.stopAudio
                  : labels.audioHelp}
              </span>
            </button>

            {fallbackVisible && (
              <div className="home-voice-fallback-card" role="region" aria-label="Audio Guidance Fallback">
                <div className="home-voice-fallback-header">
                  <AlertCircle size={18} aria-hidden="true" />
                  <span>{audioMessage || labels.audioUnavailable}</span>
                </div>
                <div className="home-voice-fallback-text">
                  <p>{instructions}</p>
                </div>
                <div className="home-voice-fallback-actions">
                  <button
                    type="button"
                    className="home-voice-retry-btn"
                    onClick={handleAudioHelp}
                  >
                    <RotateCcw size={15} aria-hidden="true" />
                    <span>{t("common.retry")}</span>
                  </button>
                  <button
                    type="button"
                    className="home-voice-dismiss-btn"
                    onClick={() => {
                      setFallbackVisible(false);
                      setAudioMessage("");
                    }}
                  >
                    <span>{t("common.close")}</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* LARGE PICTURE-BASED CATEGORIES */}
      <section className="categories visual-categories">
        <div className="section-heading">
          <div>
            <span className="section-eyebrow">
              {t("exploreOpportunities")}
            </span>

            <h2>{labels.chooseWork}</h2>
            <p>{labels.tapCategory}</p>
          </div>

          <Link to="/jobs" className="view-all-link">
            <span>{t("viewAllJobs")}</span>
            <ArrowRight size={18} aria-hidden="true" />
          </Link>
        </div>

        <div className="category-grid visual-category-grid">
          {categories.map((category) => {
            const Icon = category.icon;

            return (
              <button
                type="button"
                key={category.key}
                className={`category-card visual-category-card home-picture-category animated-card fade-in ${category.className}`}
                onClick={() => handleCategoryClick(category)}
              >
                <div
                  className="home-category-picture"
                  aria-hidden="true"
                >
                  <span>{category.emoji}</span>
                  <Icon size={31} />
                </div>

                <div className="category-card-content">
                  <h3>{category.name}</h3>
                  <p>{category.description}</p>
                </div>

                <div className="category-arrow">
                  <ArrowRight
                    size={23}
                    aria-hidden="true"
                  />
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* TRUST SECTION */}
      <section className="container home-trust-section">
        <div className="trust-card">
          <div className="trust-icon">👷</div>
          <div>
            <h3>{t("builtForWorkers")}</h3>
            <p>{t("builtForWorkersDesc")}</p>
          </div>
        </div>

        <div className="trust-card">
          <div className="trust-icon">🤝</div>
          <div>
            <h3>{t("connectDirectly")}</h3>
            <p>{t("connectDirectlyDesc")}</p>
          </div>
        </div>

        <div className="trust-card">
          <div className="trust-icon">⚡</div>
          <div>
            <h3>{t("findFaster")}</h3>
            <p>{t("findFasterDesc")}</p>
          </div>
        </div>
      </section>

      {/* FEATURES SECTION */}
      <section className="home-section">
        <div className="container">
          <h2 className="home-section-title">
            {t("home.features.title")}
          </h2>

          <div className="home-features-grid">
            {FEATURE_KEYS.map((key) => (
              <div
                className="home-feature-card animated-card"
                key={key}
              >
                <div className="home-feature-icon">
                  {FEATURE_EMOJI[key]}
                </div>

                <h3>{t(`home.features.${key}.title`)}</h3>
                <p>{t(`home.features.${key}.desc`)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="home-section home-section-alt">
        <div className="container">
          <h2 className="home-section-title">
            {t("home.howItWorks.title")}
          </h2>

          <div className="home-how-grid">
            <div className="home-how-column">
              <h3>
                {t("home.howItWorks.workers.title")}
              </h3>

              <ol>
                <li>{t("home.howItWorks.workers.step1")}</li>
                <li>{t("home.howItWorks.workers.step2")}</li>
                <li>{t("home.howItWorks.workers.step3")}</li>
                <li>{t("home.howItWorks.workers.step4")}</li>
              </ol>
            </div>

            <div className="home-how-column">
              <h3>
                {t("home.howItWorks.employers.title")}
              </h3>

              <ol>
                <li>{t("home.howItWorks.employers.step1")}</li>
                <li>{t("home.howItWorks.employers.step2")}</li>
                <li>{t("home.howItWorks.employers.step3")}</li>
                <li>{t("home.howItWorks.employers.step4")}</li>
              </ol>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
