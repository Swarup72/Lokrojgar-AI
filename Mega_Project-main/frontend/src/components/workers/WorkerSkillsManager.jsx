import { useState } from "react";
import { X, Plus } from "lucide-react";
import { useLanguage } from "../../hooks/useLanguage";
import { pickLocalizedText } from "../../utils/localizedText";
import { WORKER_SKILL_PROFICIENCY } from "../../utils/enums";
import "./WorkerSkillsManager.css";

/**
 * @param {{skills: object[], catalogSkills: object[], onAdd: (payload:object) => Promise<any>, onRemove: (id:string) => Promise<any>}} props
 */
export function WorkerSkillsManager({ skills, catalogSkills, onAdd, onRemove }) {
  const { language } = useLanguage();
  const [selectedSkillId, setSelectedSkillId] = useState("");
  const [proficiency, setProficiency] = useState("intermediate");
  const [saving, setSaving] = useState(false);

  const alreadyAddedIds = new Set(skills.map((s) => (typeof s.skillId === "object" ? s.skillId._id : s.skillId)));
  const availableCatalogSkills = catalogSkills.filter((skill) => !alreadyAddedIds.has(skill._id));

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
        {skills.length === 0 && <p className="worker-skills-empty">No skills added yet.</p>}
        {skills.map((skill) => {
          const skillDoc = typeof skill.skillId === "object" ? skill.skillId : null;
          const name = skillDoc ? pickLocalizedText(skillDoc.name, language) : "Skill";
          return (
            <span className="worker-skill-tag" key={skill._id}>
              {name} <em>({skill.proficiency})</em>
              <button type="button" onClick={() => onRemove(skill._id)} aria-label={`Remove ${name}`}>
                <X size={13} aria-hidden="true" />
              </button>
            </span>
          );
        })}
      </div>

      {availableCatalogSkills.length > 0 && (
        <form className="worker-skills-add" onSubmit={handleAdd}>
          <select value={selectedSkillId} onChange={(event) => setSelectedSkillId(event.target.value)}>
            <option value="">Add a skill...</option>
            {availableCatalogSkills.map((skill) => (
              <option key={skill._id} value={skill._id}>
                {pickLocalizedText(skill.nameMultilingual, language) || skill.name}
              </option>
            ))}
          </select>
          <select value={proficiency} onChange={(event) => setProficiency(event.target.value)}>
            {WORKER_SKILL_PROFICIENCY.map((level) => (
              <option key={level} value={level}>
                {level}
              </option>
            ))}
          </select>
          <button type="submit" className="worker-skills-add-btn" disabled={!selectedSkillId || saving}>
            <Plus size={15} aria-hidden="true" /> Add
          </button>
        </form>
      )}
    </div>
  );
}
