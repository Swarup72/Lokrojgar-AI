import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Search, X, Sparkles, Check } from "lucide-react";
import { useLanguage } from "../../hooks/useLanguage";
import { pickLocalizedText } from "../../utils/localizedText";
import * as catalogApi from "../../api/catalog";
import "./SkillPicker.css";

/**
 * Choosing the skills a job needs.
 *
 * This replaces a grid of every skill in the category, which on a real
 * catalog meant dozens of chips an employer had to read before posting a
 * job. Instead: a short list of skills actually mentioned in the title and
 * description, a search box for everything else, and the current selection
 * shown separately so it is always clear what the job will carry.
 *
 * Suggestions are labelled as suggestions and are NOT pre-selected. An AI or
 * keyword guess is not the employer's confirmation, and a job advertises the
 * skills they chose - so a suggestion only becomes a requirement when it is
 * tapped.
 *
 * Nothing here can invent a skill: every option comes from the catalog the
 * backend returned, and the value handed back is a list of catalog ids.
 */
export function SkillPicker({ categoryId, title, description, value = [], onChange }) {
  const { t, language } = useLanguage();

  const [catalog, setCatalog] = useState([]);
  const [suggested, setSuggested] = useState([]);
  const [suggesting, setSuggesting] = useState(false);
  const [suggestFailed, setSuggestFailed] = useState(false);
  const [query, setQuery] = useState("");
  const lastProbe = useRef("");

  const label = useCallback(
    (skill) =>
      pickLocalizedText(skill?.nameMultilingual || skill?.name, language) ||
      skill?.name?.en ||
      skill?.canonicalName ||
      "",
    [language]
  );

  useEffect(() => {
    let cancelled = false;
    if (!categoryId) {
      setCatalog([]);
      return undefined;
    }
    catalogApi
      .getSkills(categoryId)
      .then((rows) => !cancelled && setCatalog(rows || []))
      .catch(() => !cancelled && setCatalog([]));
    return () => {
      cancelled = true;
    };
  }, [categoryId]);

  // Suggestions are refreshed when the employer pauses, not per keystroke.
  useEffect(() => {
    const text = `${title || ""} ${description || ""}`.trim();
    if (!text) {
      setSuggested([]);
      setSuggestFailed(false);
      return undefined;
    }
    const probe = `${categoryId || ""}|${text}`;
    if (probe === lastProbe.current) return undefined;

    const timer = setTimeout(async () => {
      lastProbe.current = probe;
      setSuggesting(true);
      setSuggestFailed(false);
      try {
        setSuggested(await catalogApi.suggestSkills({ title, description, categoryId }));
      } catch {
        // Extraction failing must never block posting a job - the employer
        // still has the full catalog through search below.
        setSuggested([]);
        setSuggestFailed(true);
      } finally {
        setSuggesting(false);
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [title, description, categoryId]);

  const byId = useMemo(() => new Map(catalog.map((s) => [String(s._id), s])), [catalog]);
  const selected = value.map((id) => byId.get(String(id)) || { _id: id, name: { en: "" } });

  const toggle = (id) => {
    const key = String(id);
    onChange(value.some((v) => String(v) === key) ? value.filter((v) => String(v) !== key) : [...value, key]);
  };

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return catalog
      .filter((s) => !value.some((v) => String(v) === String(s._id)))
      .filter((s) => ["en", "hi", "mr"].some((l) => (s.nameMultilingual?.[l] || "").toLowerCase().includes(q)) || label(s).toLowerCase().includes(q))
      .slice(0, 10);
  }, [query, catalog, value, label]);

  const unselectedSuggestions = suggested.filter((s) => !value.some((v) => String(v) === String(s.id)));

  return (
    <div className="skill-picker">
      {/* --- what the job will carry --------------------------------- */}
      <div className="skill-picker-selected" aria-live="polite">
        {selected.length === 0 ? (
          <p className="skill-picker-none">{t("skills.pickerNoneSelected")}</p>
        ) : (
          <>
            <div className="skill-picker-selected-list">
              {selected.map((s) => (
                <span className="skill-picker-tag" key={String(s._id)}>
                  {label(s) || t("skills.fallbackName")}
                  <button
                    type="button"
                    onClick={() => toggle(s._id)}
                    aria-label={t("skills.remove", { name: label(s) || t("skills.fallbackName") })}
                  >
                    <X size={13} aria-hidden="true" />
                  </button>
                </span>
              ))}
            </div>
            <button type="button" className="skill-picker-clear" onClick={() => onChange([])}>
              {t("skills.clearAll")}
            </button>
          </>
        )}
      </div>

      {/* --- suggestions from the title and description --------------- */}
      {(suggesting || unselectedSuggestions.length > 0 || suggestFailed) && (
        <div className="skill-picker-suggested">
          <p className="skill-picker-suggested-label">
            <Sparkles size={14} aria-hidden="true" /> {t("skills.suggestedLabel")}
          </p>
          {suggesting && <p className="skill-picker-hint">{t("skills.suggesting")}</p>}
          {suggestFailed && <p className="skill-picker-hint">{t("skills.suggestFailed")}</p>}
          {!suggesting && unselectedSuggestions.length > 0 && (
            <div className="skill-picker-options">
              {unselectedSuggestions.map((s) => (
                <button type="button" key={s.id} className="skill-picker-option" onClick={() => toggle(s.id)}>
                  <Check size={13} aria-hidden="true" /> {s.canonicalName}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* --- search the rest of the catalog --------------------------- */}
      <label className="skill-picker-search">
        <span className="visually-hidden">{t("skills.searchLabel")}</span>
        <Search size={15} aria-hidden="true" />
        <input
          type="search"
          value={query}
          placeholder={t("skills.searchPlaceholder")}
          onChange={(event) => setQuery(event.target.value)}
          disabled={!categoryId}
        />
      </label>

      {!categoryId && <p className="skill-picker-hint">{t("skills.chooseCategoryFirst")}</p>}

      {query.trim() && (
        <div className="skill-picker-options">
          {results.length === 0 ? (
            <p className="skill-picker-hint">{t("skills.noMatches", { query: query.trim() })}</p>
          ) : (
            results.map((s) => (
              <button type="button" key={String(s._id)} className="skill-picker-option" onClick={() => toggle(s._id)}>
                {label(s)}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
