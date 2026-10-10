import { useMemo, useState } from "react";
import { X, Plus } from "lucide-react";
import { useLanguage } from "../../hooks/useLanguage";
import { pickLocalizedText } from "../../utils/localizedText";
import { WORKER_SKILL_PROFICIENCY } from "../../utils/enums";
import { PROFICIENCY_KEYS } from "../../utils/enumLabels";
import "./WorkerSkillsManager.css";

/**
 * @param {{skills: object[], catalogSkills: object[], onAdd: (payload:object) => Promise<any>, onRemove: (id:string) => Promise<any>}} props
 */
export function WorkerSkillsManager({ skills, catalogSkills, onAdd, onRemove }) {
  const { language, t } = useLanguage();
  const [selectedSkillId, setSelectedSkillId] = useState("");
  const [proficiency, setProficiency] = useState("intermediate");
  const [saving, setSaving] = useState(false);

  const alreadyAddedIds = new Set(skills.map((s) => (typeof s.skillId === "object" ? s.skillId._id : s.skillId)));
  const availableCatalogSkills = catalogSkills.filter((skill) => !alreadyAddedIds.has(skill._id));

  const label = (skill) => pickLocalizedText(skill.nameMultilingual, language) || skill.name;

  /**
   * The catalog is one flat list where `parentSkillId` marks a sub-skill, so it
   * is grouped here into <optgroup> per trade. Adding a sub-skill also records
   * its trade server-side ("Wire Connection" implies "Electrician"), which is
   * what lets a sub-skill improve matching without the ranking having to know
   * about the hierarchy.
   */
  const grouped = useMemo(() => {
    const trades = catalogSkills.filter((skill) => !skill.parentSkillId);
    const tradesById = new Map(trades.map((trade) => [String(trade._id), trade]));
    const available = new Set(availableCatalogSkills.map((skill) => String(skill._id)));

    const groups = trades
      .map((trade) => ({
        trade,
        tradeAvailable: available.has(String(trade._id)),
        subSkills: catalogSkills.filter(
          (skill) => String(skill.parentSkillId || "") === String(trade._id) && available.has(String(skill._id))
        ),
      }))
      .filter((group) => group.tradeAvailable || group.subSkills.length > 0);

    // A sub-skill whose trade is not in this (possibly category-filtered) list
    // must still be selectable rather than silently disappearing.
    const orphans = availableCatalogSkills.filter(
      (skill) => skill.parentSkillId && !tradesById.has(String(skill.parentSkillId))
    );

    return { groups, orphans };
  }, [catalogSkills, availableCatalogSkills, language]);

  const handleAdd = async (event) => {
    event.preventDefault();
    if (!selectedSkillId) return;
    setSaving(true);
    try {
      await onAdd({ skillId: selectedSkillId, proficiency });
      setSelectedSkillId("");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="worker-skills-manager">
      <div className="worker-skills-list">
        {skills.length === 0 && <p className="worker-skills-empty">{t("skills.noneAdded")}</p>}
        {skills.map((skill) => {
          const skillDoc = typeof skill.skillId === "object" ? skill.skillId : null;
          const name = skillDoc ? pickLocalizedText(skillDoc.name, language) : t("skills.fallbackName");
          return (
            <span className="worker-skill-tag" key={skill._id}>
              {name} <em>({t(PROFICIENCY_KEYS[skill.proficiency] ?? "skills.fallbackName")})</em>
              <button type="button" onClick={() => onRemove(skill._id)} aria-label={t("skills.remove", { name })}>
                <X size={13} aria-hidden="true" />
              </button>
            </span>
          );
        })}
      </div>

      {availableCatalogSkills.length > 0 && (
        <form className="worker-skills-add" onSubmit={handleAdd}>
          <select value={selectedSkillId} onChange={(event) => setSelectedSkillId(event.target.value)}>
            <option value="">{t("skills.addPrompt")}</option>
            {grouped.groups.map(({ trade, tradeAvailable, subSkills }) => (
              <optgroup key={trade._id} label={label(trade)}>
                {tradeAvailable && <option value={trade._id}>{t("skills.wholeTrade", { trade: label(trade) })}</option>}
                {subSkills.map((sub) => (
                  <option key={sub._id} value={sub._id}>
                    {label(sub)}
                  </option>
                ))}
              </optgroup>
            ))}
            {grouped.orphans.length > 0 && (
              <optgroup label={t("skills.other")}>
                {grouped.orphans.map((skill) => (
                  <option key={skill._id} value={skill._id}>
                    {label(skill)}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
          <select value={proficiency} onChange={(event) => setProficiency(event.target.value)}>
            {WORKER_SKILL_PROFICIENCY.map((level) => (
              <option key={level} value={level}>
                {t(PROFICIENCY_KEYS[level])}
              </option>
            ))}
          </select>
          <button type="submit" className="worker-skills-add-btn" disabled={!selectedSkillId || saving}>
            <Plus size={15} aria-hidden="true" /> {t("skills.add")}
          </button>
        </form>
      )}
    </div>
  );
}
