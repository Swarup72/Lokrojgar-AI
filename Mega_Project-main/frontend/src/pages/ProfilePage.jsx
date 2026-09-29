import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Mic, Star } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import * as workerProfileApi from "../api/workerProfile";
import * as employerProfileApi from "../api/employerProfile";
import * as workerSkillsApi from "../api/workerSkills";
import * as catalogApi from "../api/catalog";
import { normalizeError } from "../api/client";
import { USER_ROLES } from "../utils/enums";
import { Card } from "../components/common/Card";
import { ErrorBanner } from "../components/common/ErrorBanner";
import { WorkerProfileForm } from "../components/workers/WorkerProfileForm";
import { AvailabilityToggle } from "../components/workers/AvailabilityToggle";
import { WorkerSkillsManager } from "../components/workers/WorkerSkillsManager";
import { EmployerProfileForm } from "../components/employers/EmployerProfileForm";
import { RatingList } from "../components/reviews/RatingList";
import "./ProfilePage.css";

export function ProfilePage() {
  const { user, workerProfile, employerProfile, refreshBootstrap } = useAuth();
  const roles = user?.roles || [];
  const hasBothRoles = roles.includes(USER_ROLES.WORKER) && roles.includes(USER_ROLES.EMPLOYER);

  const [activeTab, setActiveTab] = useState(roles.includes(USER_ROLES.WORKER) ? "worker" : "employer");
  const [categories, setCategories] = useState([]);
  const [workerSkills, setWorkerSkills] = useState([]);
  const [catalogSkills, setCatalogSkills] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

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
    const added = await workerSkillsApi.add(payload);
    setWorkerSkills((prev) => [...prev, added]);
  };

  const handleRemoveSkill = async (id) => {
    await workerSkillsApi.remove(id);
    setWorkerSkills((prev) => prev.filter((skill) => skill._id !== id));
  };

  return (
    <div className="container profile-page">
      <h1 className="profile-page-title">Profile</h1>

      {hasBothRoles && (
        <div className="profile-tabs">
          <button type="button" className={activeTab === "worker" ? "active" : ""} onClick={() => setActiveTab("worker")}>
            Worker profile
          </button>
          <button type="button" className={activeTab === "employer" ? "active" : ""} onClick={() => setActiveTab("employer")}>
            Employer profile
          </button>
        </div>
      )}

      {error && <ErrorBanner error={error} />}

      {activeTab === "worker" && roles.includes(USER_ROLES.WORKER) && (
        <>
          <Card className="profile-voice-cta">
            <div>
              <h2>
                <Mic size={20} aria-hidden="true" /> Voice profile
              </h2>
              <p>Create or update your profile just by speaking.</p>
            </div>
            <Link to="/voice-profile" className="btn btn-primary btn-lg">
              <Mic size={18} aria-hidden="true" />
              <span>{workerProfile ? "Update with voice" : "Create with voice"}</span>
            </Link>
          </Card>

          {workerProfile && (
            <Card className="profile-section">
              <h2>Availability</h2>
              <AvailabilityToggle availability={workerProfile.availability} onChange={handleAvailabilityChange} />
            </Card>
          )}

          <Card className="profile-section">
            <h2>Personal & professional details</h2>
            <WorkerProfileForm
              profile={workerProfile}
              categories={categories}
              saving={saving}
              onSave={handleSaveWorkerProfile}
            />
          </Card>

          {workerProfile && (
            <Card className="profile-section">
              <h2>Skills</h2>
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
                <Star size={18} aria-hidden="true" /> Reviews
              </h2>
              <RatingList userId={user._id} />
            </Card>
          )}
        </>
      )}

      {activeTab === "employer" && roles.includes(USER_ROLES.EMPLOYER) && (
        <>
          <Card className="profile-section">
            <h2>Business details</h2>
            <EmployerProfileForm profile={employerProfile} saving={saving} onSave={handleSaveEmployerProfile} />
          </Card>

          {user && (
            <Card className="profile-section">
              <h2>
                <Star size={18} aria-hidden="true" /> Reviews
              </h2>
              <RatingList userId={user._id} />
            </Card>
          )}
        </>
      )}
    </div>
  );
}
