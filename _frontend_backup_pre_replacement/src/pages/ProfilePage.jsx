import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Mic, Star, Briefcase, HardHat } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { useLanguage } from "../hooks/useLanguage";
import * as workerProfileApi from "../api/workerProfile";
import * as employerProfileApi from "../api/employerProfile";
import * as workerSkillsApi from "../api/workerSkills";
import * as catalogApi from "../api/catalog";
import * as authApi from "../api/auth";
import { normalizeError } from "../api/client";
import { USER_ROLES } from "../utils/enums";
import { Card } from "../components/common/Card";
import { Button } from "../components/common/Button";
import { ErrorBanner } from "../components/common/ErrorBanner";
import { WorkerProfileForm } from "../components/workers/WorkerProfileForm";
import { AvailabilityToggle } from "../components/workers/AvailabilityToggle";
import { WorkerSkillsManager } from "../components/workers/WorkerSkillsManager";
import { EmployerProfileForm } from "../components/employers/EmployerProfileForm";
import { RatingList } from "../components/reviews/RatingList";
import "./ProfilePage.css";

export function ProfilePage() {
  const { user, workerProfile, employerProfile, refreshBootstrap } = useAuth();
  const { t } = useLanguage();
  const roles = user?.roles || [];
  const hasBothRoles = roles.includes(USER_ROLES.WORKER) && roles.includes(USER_ROLES.EMPLOYER);

  const [activeTab, setActiveTab] = useState(roles.includes(USER_ROLES.WORKER) ? "worker" : "employer");
  const [categories, setCategories] = useState([]);
  const [workerSkills, setWorkerSkills] = useState([]);
  const [catalogSkills, setCatalogSkills] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [addingRole, setAddingRole] = useState(null);

  useEffect(() => {
    catalogApi.getCategories().then(setCategories).catch(() => {});
    catalogApi.getSkills().then(setCatalogSkills).catch(() => {});
  }, []);

  useEffect(() => {
    if (activeTab === "worker" && roles.includes(USER_ROLES.WORKER)) {
      workerSkillsApi.getMine().then(setWorkerSkills).catch(() => {});
    }
  }, [activeTab, roles]);

  const handleSaveWorkerProfile = async (payload) => {
    setSaving(true);
    setError(null);
    try {
      await workerProfileApi.upsert(payload);
      await refreshBootstrap();
    } catch (err) {
      setError(normalizeError(err));
    } finally {
      setSaving(false);
    }
  };

  const handleSaveEmployerProfile = async (payload) => {
    setSaving(true);
    setError(null);
    try {
      await employerProfileApi.upsert(payload);
      await refreshBootstrap();
    } catch (err) {
      setError(normalizeError(err));
    } finally {
      setSaving(false);
    }
  };

  const handleAvailabilityChange = async (value) => {
    try {
      await workerProfileApi.updateAvailability(value);
      await refreshBootstrap();
    } catch (err) {
      setError(normalizeError(err));
    }
  };

  const handleAddSkill = async (payload) => {
    await workerSkillsApi.add(payload);
    setWorkerSkills(await workerSkillsApi.getMine());
  };

  const handleRemoveSkill = async (id) => {
    await workerSkillsApi.remove(id);
    setWorkerSkills((prev) => prev.filter((skill) => skill._id !== id));
  };

  const handleAddRole = async (role) => {
    setAddingRole(role);
    setError(null);
    try {
      await authApi.addRole({ role, fullName: user?.fullName || undefined });
      await refreshBootstrap();
      setActiveTab(role);
    } catch (err) {
      setError(normalizeError(err));
    } finally {
      setAddingRole(null);
    }
  };

  return (
    <div className="container profile-page page-animate">
      <h1 className="profile-page-title">{t("profile")}</h1>

      {hasBothRoles && (
        <div className="profile-tabs">
          <button type="button" className={activeTab === "worker" ? "active" : ""} onClick={() => setActiveTab("worker")}>
            {t("profile.title")}
          </button>
          <button type="button" className={activeTab === "employer" ? "active" : ""} onClick={() => setActiveTab("employer")}>
            {t("employerProfile")}
          </button>
        </div>
      )}

      {error && <ErrorBanner error={error} />}

      {!hasBothRoles && (roles.includes(USER_ROLES.WORKER) || roles.includes(USER_ROLES.EMPLOYER)) && (
        <Card className="profile-role-cta animated-card">
          <div>
            <h2>
              {roles.includes(USER_ROLES.WORKER) ? (
                <>
                  <Briefcase size={20} aria-hidden="true" /> {t("wantToHire")}
                </>
              ) : (
                <>
                  <HardHat size={20} aria-hidden="true" /> {t("lookingForWork")}
                </>
              )}
            </h2>
            <p>
              {roles.includes(USER_ROLES.WORKER)
                ? t("addEmployerAccessDesc")
                : t("addWorkerAccessDesc")}
            </p>
          </div>
          <Button
            onClick={() =>
              handleAddRole(roles.includes(USER_ROLES.WORKER) ? USER_ROLES.EMPLOYER : USER_ROLES.WORKER)
            }
            disabled={addingRole !== null}
            className="animated-button"
          >
            {addingRole
              ? t("common.loading")
              : roles.includes(USER_ROLES.WORKER)
                ? t("becomeEmployer")
                : t("becomeWorker")}
          </Button>
        </Card>
      )}

      {activeTab === "worker" && roles.includes(USER_ROLES.WORKER) && (
        <>
          <Card className="profile-voice-cta animated-card">
            <div>
              <h2>
                <Mic size={20} aria-hidden="true" /> {t("voiceProfile")}
              </h2>
              <p>{t("voiceProfileDesc")}</p>
            </div>
            <Link to="/voice-profile" className="btn btn-primary btn-lg animated-button">
              <Mic size={18} aria-hidden="true" />
              <span>{workerProfile ? t("updateWithVoice") : t("createWithVoice")}</span>
            </Link>
          </Card>

          {workerProfile && (
            <Card className="profile-section">
              <h2>{t("voice.guided.availability.label")}</h2>
              <AvailabilityToggle availability={workerProfile.availability} onChange={handleAvailabilityChange} />
            </Card>
          )}

          <Card className="profile-section">
            <h2>{t("personalDetails")}</h2>
            <WorkerProfileForm
              key={workerProfile?.updatedAt || workerProfile?._id || "new-worker-profile"}
              profile={workerProfile}
              categories={categories}
              saving={saving}
              onSave={handleSaveWorkerProfile}
            />
          </Card>

          {workerProfile && (
            <Card className="profile-section">
              <h2>{t("common.skills")}</h2>
              <WorkerSkillsManager
                skills={workerSkills}
                catalogSkills={catalogSkills}
                onAdd={handleAddSkill}
                onRemove={handleRemoveSkill}
              />
            </Card>
          )}

          {user && (
            <Card className="profile-section">
              <h2>
                <Star size={18} aria-hidden="true" /> {t("reviews")}
              </h2>
              <RatingList
                userId={user._id}
                ratingAvg={workerProfile?.ratingAvg}
                ratingCount={workerProfile?.ratingCount}
              />
            </Card>
          )}
        </>
      )}

      {activeTab === "employer" && roles.includes(USER_ROLES.EMPLOYER) && (
        <>
          <Card className="profile-voice-cta animated-card">
            <div>
              <h2>
                <Mic size={20} aria-hidden="true" /> {t("profile.employer.voiceBanner.title")}
              </h2>
              <p>{t("profile.employer.voiceBanner.desc")}</p>
            </div>
            <Link to="/voice-profile?role=employer" className="btn btn-primary btn-lg animated-button">
              <Mic size={18} aria-hidden="true" />
              <span>{employerProfile ? t("updateWithVoice") : t("profile.employer.voiceBanner.action")}</span>
            </Link>
          </Card>

          <Card className="profile-section">
            <h2>{t("businessDetails")}</h2>
            <EmployerProfileForm
              key={employerProfile?.updatedAt || employerProfile?._id || "new-employer-profile"}
              profile={employerProfile}
              saving={saving}
              onSave={handleSaveEmployerProfile}
            />
          </Card>

          {user && (
            <Card className="profile-section">
              <h2>
                <Star size={18} aria-hidden="true" /> {t("reviews")}
              </h2>
              <RatingList
                userId={user._id}
                ratingAvg={employerProfile?.ratingAvg}
                ratingCount={employerProfile?.ratingCount}
              />
            </Card>
          )}
        </>
      )}
    </div>
  );
}
