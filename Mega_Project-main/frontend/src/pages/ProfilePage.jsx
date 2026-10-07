import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Mic, Star, Briefcase, HardHat } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
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
    // Adding a sub-skill also records its parent trade server-side ("Wire
    // Connection" implies "Electrician"), so the response is
    // {workerSkill, impliedParentSkill} rather than one row - and the list has
    // to be re-read rather than appended to, or the implied trade would be
    // missing from the UI until the next reload.
    await workerSkillsApi.add(payload);
    setWorkerSkills(await workerSkillsApi.getMine());
  };

  const handleRemoveSkill = async (id) => {
    await workerSkillsApi.remove(id);
    setWorkerSkills((prev) => prev.filter((skill) => skill._id !== id));
  };

  /**
   * Adds the other role to THIS account - no second account, no second phone
   * number, no re-login. The server creates the matching profile in the same
   * request, so the new capability works straight away; refreshBootstrap()
   * then pulls the updated roles so the navigation and guards catch up.
   * Authorization stays server-side: this only changes what the UI offers.
   */
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

      {/* One account, both capabilities. A worker who wants to hire - or an
          employer who wants to work - adds the role here instead of
          registering again with another phone number. Nothing is permanent and
          nothing is lost: both profiles coexist, and the tabs above appear
          once the account has both. */}
      {!hasBothRoles && (roles.includes(USER_ROLES.WORKER) || roles.includes(USER_ROLES.EMPLOYER)) && (
        <Card className="profile-role-cta">
          <div>
            <h2>
              {roles.includes(USER_ROLES.WORKER) ? (
                <>
                  <Briefcase size={20} aria-hidden="true" /> Want to hire someone?
                </>
              ) : (
                <>
                  <HardHat size={20} aria-hidden="true" /> Looking for work yourself?
                </>
              )}
            </h2>
            <p>
              {roles.includes(USER_ROLES.WORKER)
                ? "Add employer access to this same account - you can post jobs and hire workers without a second login."
                : "Add worker access to this same account - you can apply for jobs while still posting your own."}
            </p>
          </div>
          <Button
            onClick={() =>
              handleAddRole(roles.includes(USER_ROLES.WORKER) ? USER_ROLES.EMPLOYER : USER_ROLES.WORKER)
            }
            disabled={addingRole !== null}
          >
            {addingRole
              ? "Setting up..."
              : roles.includes(USER_ROLES.WORKER)
                ? "Become an employer"
                : "Become a worker"}
          </Button>
        </Card>
      )}

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
            {/* `key` is what fixes the voice flow losing its data.
                WorkerProfileForm copies `profile` into useState, which runs ONLY
                at mount - so once the voice wizard saved new values and
                refreshBootstrap() updated `workerProfile`, this form still held
                the values from before. It then DISPLAYED the stale values and,
                on Save, wrote them back: measured on a real server, a stale save
                reverted languages ["mr","hi"] -> ["mr"] and fullName
                "Swarup Pal" -> the pre-voice name. (expectedPay/experienceYears/
                city survived only because the form sends them as undefined when
                blank, which the controller skips.)
                Keying on updatedAt remounts the form whenever the profile it
                mirrors actually changes, so it always starts from the truth. */}
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
          <Card className="profile-section">
            <h2>Business details</h2>
            {/* Same stale-state fix as the worker form above - it copies
                `profile` into useState at mount and never re-syncs either. */}
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
                <Star size={18} aria-hidden="true" /> Reviews
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
