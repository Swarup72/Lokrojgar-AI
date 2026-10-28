
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Briefcase,
  Search,
  Mic,
  MicOff,
  Volume2,
  MapPin,
  Zap,
  Wrench,
  CarFront,
  Hammer,
  Paintbrush,
  ChefHat,
  Sprout,
  HardHat,
  Package,
  ArrowRight,
  X,
} from "lucide-react";

import * as jobsApi from "../api/jobs";
import * as catalogApi from "../api/catalog";
import { normalizeError } from "../api/client";
import { useGeolocation } from "../hooks/useGeolocation";
import { useLanguage } from "../hooks/useLanguage";
import { JobCard } from "../components/jobs/JobCard";
import { JobFilters } from "../components/jobs/JobFilters";
import { Pagination } from "../components/common/Pagination";
import { Spinner } from "../components/common/Spinner";
import { EmptyState } from "../components/common/EmptyState";
import { ErrorBanner } from "../components/common/ErrorBanner";
import "./JobsPage.css";

const OCCUPATIONS = [
  { key: "electrician", icon: Zap, color: "yellow" },
  { key: "plumber", icon: Wrench, color: "blue" },
  { key: "driver", icon: CarFront, color: "green" },
  { key: "carpenter", icon: Hammer, color: "orange" },
  { key: "painter", icon: Paintbrush, color: "purple" },
  { key: "cook", icon: ChefHat, color: "red" },
  { key: "farmer", icon: Sprout, color: "green" },
  { key: "construction", icon: HardHat, color: "yellow" },
  { key: "delivery", icon: Package, color: "blue" },
];

const WORDS = {
  en: {
    searchPlaceholder: "What work are you looking for?",
    voiceSearch: "Search by speaking",
    stopListening: "Stop listening",
    voiceUnavailable: "Voice search is not supported in this browser.",
    voiceFailed: "Could not understand your voice. Please try again.",
    popularJobs: "Choose the work you do",
    allJobs: "All jobs",
    nearby: "Jobs near me",
    listen: "Listen to instructions",
    results: "Available jobs",
    searchButton: "Find Jobs",
    helper: "Tap a picture or speak to find work.",
    locationHint: "Use the location option to find work near you.",
    electrician: "Electrician",
    plumber: "Plumber",
    driver: "Driver",
    carpenter: "Carpenter",
    painter: "Painter",
    cook: "Cook",
    farmer: "Farmer",
    construction: "Construction",
    delivery: "Delivery",
  },
  hi: {
    searchPlaceholder: "आप कौन सा काम ढूंढ रहे हैं?",
    voiceSearch: "बोलकर नौकरी खोजें",
    stopListening: "सुनना बंद करें",
    voiceUnavailable: "इस ब्राउज़र में वॉइस सर्च उपलब्ध नहीं है।",
    voiceFailed: "आपकी आवाज़ समझ नहीं आई। फिर से कोशिश करें।",
    popularJobs: "अपना काम चुनें",
    allJobs: "सभी नौकरियाँ",
    nearby: "मेरे पास नौकरियाँ",
    listen: "निर्देश सुनें",
    results: "उपलब्ध नौकरियाँ",
    searchButton: "नौकरी खोजें",
    helper: "काम खोजने के लिए चित्र चुनें या बोलें।",
    locationHint: "पास की नौकरी खोजने के लिए स्थान विकल्प चुनें।",
    electrician: "इलेक्ट्रीशियन",
    plumber: "प्लंबर",
    driver: "ड्राइवर",
    carpenter: "बढ़ई",
    painter: "पेंटर",
    cook: "रसोइया",
    farmer: "किसान",
    construction: "निर्माण कार्य",
    delivery: "डिलीवरी",
  },
  mr: {
    searchPlaceholder: "तुम्ही कोणते काम शोधत आहात?",
    voiceSearch: "बोलून नोकरी शोधा",
    stopListening: "ऐकणे थांबवा",
    voiceUnavailable: "या ब्राउझरमध्ये व्हॉइस सर्च उपलब्ध नाही.",
    voiceFailed: "तुमचा आवाज समजला नाही. पुन्हा प्रयत्न करा.",
    popularJobs: "तुमचे काम निवडा",
    allJobs: "सर्व नोकऱ्या",
    nearby: "माझ्या जवळच्या नोकऱ्या",
    listen: "सूचना ऐका",
    results: "उपलब्ध नोकऱ्या",
    searchButton: "नोकरी शोधा",
    helper: "काम शोधण्यासाठी चित्र निवडा किंवा बोला.",
    locationHint: "जवळच्या नोकऱ्या शोधण्यासाठी स्थान पर्याय निवडा.",
    electrician: "इलेक्ट्रिशियन",
    plumber: "प्लंबर",
    driver: "वाहनचालक",
    carpenter: "सुतार",
    painter: "रंगारी",
    cook: "स्वयंपाकी",
    farmer: "शेतकरी",
    construction: "बांधकाम",
    delivery: "डिलिव्हरी",
  },
};

const SPEECH_CODES = {
  en: "en-IN",
  hi: "hi-IN",
  mr: "mr-IN",
};

export function JobsPage() {
  const { t, language } = useLanguage();
  const [searchParams] = useSearchParams();

  const lang = String(language || "en").toLowerCase().slice(0, 2);
  const ui = WORDS[lang] || WORDS.en;
  const speechLang = SPEECH_CODES[lang] || "en-IN";

  const initialQuery = searchParams.get("query") || "";
  const initialLocation = searchParams.get("location") || "";

  const [mode, setMode] = useState("search");
  const [filters, setFilters] = useState({
    page: 1,
    ...(initialQuery ? { query: initialQuery } : {}),
    ...(initialLocation ? { city: initialLocation } : {}),
  });

  const [searchText, setSearchText] = useState(initialQuery);
  const [categories, setCategories] = useState([]);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isListening, setIsListening] = useState(false);
  const [voiceError, setVoiceError] = useState("");

  const recognitionRef = useRef(null);
  const { requestLocation, status: geoStatus } = useGeolocation();

  useEffect(() => {
    catalogApi.getCategories().then(setCategories).catch(() => {});
  }, []);

  useEffect(() => {
    const query = searchParams.get("query") || "";
    const city = searchParams.get("location") || "";

    setSearchText(query);
    setMode("search");
    setFilters((prev) => ({
      ...prev,
      page: 1,
      query,
      city,
    }));
  }, [searchParams]);

  useEffect(() => {
    return () => {
      recognitionRef.current?.abort();
      window.speechSynthesis?.cancel();
    };
  }, []);

  const categoriesById = useMemo(
    () =>
      Object.fromEntries(
        categories.map((category) => [category._id, category])
      ),
    [categories]
  );

  const loadSearch = async (nextFilters) => {
    setLoading(true);
    setError(null);

    try {
      const data = await jobsApi.search(nextFilters);
      setResult(data);
    } catch (err) {
      setError(normalizeError(err));
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  const loadNearby = async () => {
    setLoading(true);
    setError(null);

    try {
      const { longitude, latitude } = await requestLocation();
      const jobs = await jobsApi.nearby({
        longitude,
        latitude,
        radiusKm: 20,
      });
      setResult(jobs);
    } catch (err) {
      setError(
        err.isNetworkError !== undefined ? err : normalizeError(err)
      );
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (mode === "search") {
      loadSearch(filters);
    } else {
      loadNearby();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, filters]);

  const handleModeChange = (nextMode) => {
    setMode(nextMode);
    setResult(null);
  };

  const searchJobs = (query) => {
    const cleanQuery = query.trim();

    setSearchText(cleanQuery);
    setMode("search");
    setFilters((prev) => ({
      ...prev,
      query: cleanQuery,
      page: 1,
    }));

    document.getElementById("job-results")?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  };

  const startVoiceSearch = () => {
    setVoiceError("");

    if (isListening) {
      recognitionRef.current?.stop();
      return;
    }

    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setVoiceError(ui.voiceUnavailable);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = speechLang;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => setIsListening(true);

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      searchJobs(transcript);
    };

    recognition.onerror = (event) => {
      if (event.error !== "aborted") {
        setVoiceError(ui.voiceFailed);
      }
      setIsListening(false);
    };

    recognition.onend = () => setIsListening(false);

    recognitionRef.current = recognition;

    try {
      recognition.start();
    } catch {
      setVoiceError(ui.voiceFailed);
      setIsListening(false);
    }
  };

  const speakInstructions = () => {
    if (!("speechSynthesis" in window)) {
      setVoiceError(ui.voiceUnavailable);
      return;
    }

    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(
      `${ui.popularJobs}. ${ui.helper} ${ui.locationHint}`
    );

    utterance.lang = speechLang;
    utterance.rate = 0.88;

    window.speechSynthesis.speak(utterance);
  };

  const jobs =
    mode === "search" ? result?.docs || [] : result || [];

  return (
    <div className="container jobs-page page-animate">
      <header className="jobs-header">
        <div className="jobs-header-symbol">
          <Briefcase size={31} aria-hidden="true" />
        </div>

        <h1 className="jobs-page-title">{t("findJobs")}</h1>

        <p className="jobs-header-desc">{ui.helper}</p>

        <button
          type="button"
          className="jobs-listen-btn"
          onClick={speakInstructions}
        >
          <Volume2 size={20} aria-hidden="true" />
          <span>{ui.listen}</span>
        </button>
      </header>

      <section className="jobs-visual-search" aria-label={ui.searchButton}>
        <form
          className="jobs-search-form"
          onSubmit={(event) => {
            event.preventDefault();
            searchJobs(searchText);
          }}
        >
          <div className="jobs-search-field">
            <Search size={23} aria-hidden="true" />

            <input
              type="search"
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              placeholder={ui.searchPlaceholder}
              aria-label={ui.searchPlaceholder}
            />

            {searchText && (
              <button
                type="button"
                className="jobs-clear-btn"
                onClick={() => searchJobs("")}
                aria-label={ui.allJobs}
              >
                <X size={19} />
              </button>
            )}
          </div>

          <button
            type="button"
            className={`jobs-mic-btn ${isListening ? "listening" : ""}`}
            onClick={startVoiceSearch}
            aria-label={
              isListening ? ui.stopListening : ui.voiceSearch
            }
            title={ui.voiceSearch}
          >
            {isListening ? <MicOff size={25} /> : <Mic size={25} />}
          </button>

          <button type="submit" className="jobs-search-submit">
            <Search size={20} aria-hidden="true" />
            <span>{ui.searchButton}</span>
          </button>
        </form>

        {voiceError && (
          <p className="jobs-voice-error" role="alert">
            {voiceError}
          </p>
        )}
      </section>

      <section className="jobs-occupations">
        <div className="jobs-section-heading">
          <h2>{ui.popularJobs}</h2>
          <p>{ui.helper}</p>
        </div>

        <div className="jobs-occupation-grid">
          {OCCUPATIONS.map(({ key, icon: Icon, color }) => (
            <button
              type="button"
              key={key}
              className={`jobs-occupation-card color-${color} ${
                mode === "search" &&
                filters.query?.toLowerCase() === key
                  ? "selected"
                  : ""
              }`}
              onClick={() => searchJobs(key)}
            >
              <span className="jobs-occupation-icon">
                <Icon size={34} strokeWidth={1.9} aria-hidden="true" />
              </span>

              <span className="jobs-occupation-name">{ui[key]}</span>

              <ArrowRight
                className="jobs-occupation-arrow"
                size={16}
                aria-hidden="true"
              />
            </button>
          ))}
        </div>
      </section>

      <section className="jobs-filter-section">
        <div className="jobs-section-heading">
          <h2>
            <MapPin size={22} aria-hidden="true" />
            {ui.nearby}
          </h2>
        </div>

        <JobFilters
          mode={mode}
          onModeChange={handleModeChange}
          filters={filters}
          onFilterChange={(next) => {
            setFilters({ ...next, page: 1 });
            setSearchText(next.query || "");
          }}
          categories={categories}
        />
      </section>

      <section id="job-results" className="jobs-results-section">
        <div className="jobs-results-heading">
          <h2>
            <Briefcase size={23} aria-hidden="true" />
            {ui.results}
          </h2>

          {!loading && !error && (
            <span className="jobs-result-count">{jobs.length}</span>
          )}
        </div>

        {loading && (
          <div className="jobs-page-loading">
            <Spinner
              label={
                mode === "nearby" && geoStatus === "requesting"
                  ? t("jobs.gettingLocation")
                  : t("jobs.loading")
              }
            />
          </div>
        )}

        {!loading && error && (
          <ErrorBanner
            error={error}
            onRetry={() =>
              mode === "search"
                ? loadSearch(filters)
                : loadNearby()
            }
          />
        )}

        {!loading && !error && jobs.length === 0 && (
          <EmptyState
            icon={Briefcase}
            title={t("jobs.search.noResults")}
            description={t("jobs.search.noResultsDesc")}
          />
        )}

        {!loading && !error && jobs.length > 0 && (
          <div className="jobs-list">
            {jobs.map((job) => (
              <JobCard
                key={job._id}
                job={job}
                categoriesById={categoriesById}
              />
            ))}
          </div>
        )}

        {mode === "search" && result && !loading && !error && (
          <Pagination
            page={result.page}
            totalPages={result.totalPages}
            hasPrevPage={result.hasPrevPage}
            hasNextPage={result.hasNextPage}
            onPageChange={(page) => {
              setFilters((prev) => ({ ...prev, page }));
              document
                .getElementById("job-results")
                ?.scrollIntoView({ behavior: "smooth" });
            }}
          />
        )}
      </section>
    </div>
  );
}
