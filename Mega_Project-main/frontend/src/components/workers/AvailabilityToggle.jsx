import { useState } from "react";
import { AVAILABILITY_OPTIONS } from "../../utils/enums";
import { useLanguage } from "../../hooks/useLanguage";
import { AVAILABILITY_KEYS } from "../../utils/enumLabels";
import "./AvailabilityToggle.css";

/** @param {{availability: string, onChange: (value:string) => Promise<any>}} props */
export function AvailabilityToggle({ availability, onChange }) {
  const { t } = useLanguage();
  const [updating, setUpdating] = useState(false);

  const handleClick = async (value) => {
    if (value === availability || updating) return;
    setUpdating(true);
    try {
      await onChange(value);
    } finally {
      setUpdating(false);
    }
  };

  return (
    <div className="availability-toggle">
      {AVAILABILITY_OPTIONS.map((option) => (
        <button
          key={option}
          type="button"
          className={`availability-option availability-${option} ${option === availability ? "active" : ""}`}
          onClick={() => handleClick(option)}
          disabled={updating}
        >
          {t(AVAILABILITY_KEYS[option])}
        </button>
      ))}
    </div>
  );
}
