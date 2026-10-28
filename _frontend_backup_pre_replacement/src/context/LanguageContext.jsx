import { createContext, useCallback, useEffect, useMemo, useState } from "react";
import en from "./translations/en";
import hi from "./translations/hi";
import mr from "./translations/mr";
import { getStoredLanguage, setStoredLanguage } from "../utils/storage";
import { updateLanguage as updateLanguageOnServer } from "../api/users";

const DICTIONARIES = { en, hi, mr };

export const LanguageContext = createContext(null);

export function LanguageProvider({ children, isAuthenticated, userPreferredLanguage }) {
  const [language, setLanguageState] = useState(() => getStoredLanguage() || "en");

  // Once the user's own preferredLanguage becomes known (after AuthContext
  // bootstraps) and no explicit choice was ever stored locally, adopt it.
  useEffect(() => {
    if (!getStoredLanguage() && userPreferredLanguage) {
      setLanguageState(userPreferredLanguage);
      setStoredLanguage(userPreferredLanguage);
    }
  }, [userPreferredLanguage]);

  const setLanguage = useCallback(
    (lang) => {
      setLanguageState(lang);
      setStoredLanguage(lang);
      if (isAuthenticated) {
        // Best-effort - never block the UI switch on this network call.
        updateLanguageOnServer(lang).catch(() => {});
      }
    },
    [isAuthenticated]
  );

  const t = useCallback(
    (key, vars) => {
      const dict = DICTIONARIES[language] || DICTIONARIES.en;
      let text = dict[key] ?? DICTIONARIES.en[key] ?? key;
      if (vars) {
        for (const [name, value] of Object.entries(vars)) {
          text = text.replaceAll(`{{${name}}}`, value);
        }
      }
      return text;
    },
    [language]
  );

  const value = useMemo(() => ({ language, setLanguage, t }), [language, setLanguage, t]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}
