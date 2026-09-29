import { useLanguage } from "../../hooks/useLanguage";
import { APP_LANGUAGES, LANGUAGE_LABELS } from "../../utils/enums";
import "./LanguageSwitcher.css";

export function LanguageSwitcher() {
  const { language, setLanguage } = useLanguage();

  return (
    <div className="language-switcher" role="group" aria-label="Choose language">
      {APP_LANGUAGES.map((lang) => (
        <button
          key={lang}
          type="button"
          className={`language-option ${lang === language ? "active" : ""}`}
          onClick={() => setLanguage(lang)}
          aria-pressed={lang === language}
        >
          {LANGUAGE_LABELS[lang]}
        </button>
      ))}
    </div>
  );
}
