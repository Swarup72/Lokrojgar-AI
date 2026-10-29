
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  Mic,
  Star,
  Briefcase,
  HardHat,
  Camera,
  UserRound,
  Trash2,
  ImagePlus,
  MapPin,
  Wrench,
  Building2,
  ClipboardList,
  Languages,
  Pencil,
  CheckCircle,
  BriefcaseBusiness,
  ShieldCheck,
} from "lucide-react";

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
import "./ProfileRedesign.css";

const MAX_IMAGE_SIZE = 5 * 1024 * 1024;

const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
];

export function ProfilePage() {
  const {
    user,
    workerProfile,
    employerProfile,
    refreshBootstrap,
  } = useAuth();

  const { t, language } = useLanguage();

  const roles = user?.roles || [];
  const isWorker = roles.includes(USER_ROLES.WORKER);
  const isEmployer = roles.includes(USER_ROLES.EMPLOYER);
  const hasBothRoles = isWorker && isEmployer;

  const [activeTab, setActiveTab] = useState(
    isWorker ? "worker" : "employer"
  );

  const [categories, setCategories] = useState([]);
  const [workerSkills, setWorkerSkills] = useState([]);
  const [catalogSkills, setCatalogSkills] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [addingRole, setAddingRole] = useState(null);
  const [profileImage, setProfileImage] = useState("");
  const [imageError, setImageError] = useState("");

  const fileInputRef = useRef(null);

  const lang = String(language || "en")
    .toLowerCase()
    .slice(0, 2);

  const labels = {
    profilePicture:
      lang === "mr" ? "प्रोफाइल फोटो" :
      lang === "hi" ? "प्रोफ़ाइल फ़ोटो" :
      "Profile Picture",

    addPhoto:
      lang === "mr" ? "फोटो जोडा" :
      lang === "hi" ? "फ़ोटो जोड़ें" :
      "Add Photo",

    changePhoto:
      lang === "mr" ? "फोटो बदला" :
      lang === "hi" ? "फ़ोटो बदलें" :
      "Change Photo",

    removePhoto:
      lang === "mr" ? "फोटो काढा" :
      lang === "hi" ? "फ़ोटो हटाएं" :
      "Remove Photo",

    photoHelp:
      lang === "mr" ? "JPG, PNG किंवा WebP फोटो निवडा. कमाल 5 MB." :
      lang === "hi" ? "JPG, PNG या WebP फ़ोटो चुनें। अधिकतम 5 MB।" :
      "Choose a JPG, PNG or WebP photo. Maximum 5 MB.",

    invalidType:
      lang === "mr" ? "कृपया JPG, PNG किंवा WebP फोटो निवडा." :
      lang === "hi" ? "कृपया JPG, PNG या WebP फ़ोटो चुनें।" :
      "Please select a JPG, PNG or WebP image.",

    tooLarge:
      lang === "mr" ? "फोटो 5 MB पेक्षा लहान असावा." :
      lang === "hi" ? "फ़ोटो 5 MB से छोटा होना चाहिए।" :
      "Photo must be smaller than 5 MB.",

    saveFailed:
      lang === "mr" ? "फोटो सेव करता आला नाही." :
      lang === "hi" ? "फ़ोटो सेव नहीं हो सका।" :
      "Could not save the photo.",

    worker:
      lang === "mr" ? "कामगार" :
      lang === "hi" ? "कामगार" :
      "Worker",

    employer:
      lang === "mr" ? "नियोक्ता" :
      lang === "hi" ? "नियोक्ता" :
      "Employer",

    localNotice:
      lang === "mr" ? "फोटो सध्या फक्त या ब्राउझरमध्ये सेव होतो." :
      lang === "hi" ? "फ़ोटो अभी केवल इस ब्राउज़र में सेव होता है।" :
      "Photo is currently saved only in this browser.",
  };

  const userId = user?._id || user?.id;

  const storageKey = userId
    ? `lokrozgar-profile-photo-${userId}-${activeTab}`
    : null;

  useEffect(() => {
    setImageError("");

    if (!storageKey) {
      setProfileImage("");
      return;
    }

    try {
      setProfileImage(
        localStorage.getItem(storageKey) || ""
      );
    } catch {
      setProfileImage("");
    }
  }, [storageKey]);

  useEffect(() => {
    catalogApi.getCategories()
      .then(setCategories)
      .catch(() => {});

    catalogApi.getSkills()
      .then(setCatalogSkills)
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (activeTab === "worker" && isWorker) {
      workerSkillsApi.getMine()
        .then(setWorkerSkills)
        .catch(() => {});
    }
  }, [activeTab, isWorker]);

  const handlePhotoUpload = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setImageError("");

    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      setImageError(labels.invalidType);
      event.target.value = "";
      return;
    }

    if (file.size > MAX_IMAGE_SIZE) {
      setImageError(labels.tooLarge);
      event.target.value = "";
      return;
    }

    if (!storageKey) {
      setImageError(labels.saveFailed);
      event.target.value = "";
      return;
    }

    const reader = new FileReader();

    reader.onload = () => {
      if (typeof reader.result !== "string") {
        setImageError(labels.saveFailed);
        return;
      }

      try {
        localStorage.setItem(storageKey, reader.result);
        setProfileImage(reader.result);
        window.dispatchEvent(
          new Event("lokrozgar-profile-photo-updated")
        );
      } catch {
        setImageError(labels.saveFailed);
      }
    };

    reader.onerror = () => {
      setImageError(labels.saveFailed);
    };

    reader.readAsDataURL(file);
    event.target.value = "";
  };

  const handleRemovePhoto = () => {
    if (!storageKey) return;

    try {
      localStorage.removeItem(storageKey);
      setProfileImage("");
      setImageError("");
      window.dispatchEvent(
        new Event("lokrozgar-profile-photo-updated")
      );
    } catch {
      setImageError(labels.saveFailed);
    }
  };

  const openFilePicker = () => {
    fileInputRef.current?.click();
  };

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
    setWorkerSkills((prev) =>
      prev.filter((skill) => skill._id !== id)
    );
  };

  const handleAddRole = async (role) => {
    setAddingRole(role);
    setError(null);

    try {
      await authApi.addRole({
        role,
        fullName: user?.fullName || undefined,
      });

      await refreshBootstrap();
      setActiveTab(role);
    } catch (err) {
      setError(normalizeError(err));
    } finally {
      setAddingRole(null);
    }
  };

  const profileName =
    activeTab === "worker"
      ? workerProfile?.fullName || user?.fullName || labels.worker
      : employerProfile?.businessName ||
        employerProfile?.fullName ||
        user?.fullName ||
        labels.employer;

  const currentProfile =
    activeTab === "worker" ? workerProfile : employerProfile;

  const profileFields = currentProfile
    ? Object.values(currentProfile).filter(
        (value) =>
          value !== null &&
          value !== undefined &&
          value !== "" &&
          value !== false &&
          (!Array.isArray(value) || value.length > 0)
      ).length
    : 0;

  const profileCompletion = currentProfile
    ? Math.min(100, Math.max(20, Math.round(
        (profileFields / Math.max(Object.keys(currentProfile).length, 1)) * 100
      )))
    : 0;

  const scrollToSection = (id) => {
    document.getElementById(id)?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  };

  return (
    <div className="container profile-page page-animate profile-redesign">
      <h1 className="profile-page-title">{t("profile")}</h1>

      {hasBothRoles && (
        <div className="profile-tabs">
          <button
            type="button"
            className={activeTab === "worker" ? "active" : ""}
            onClick={() => setActiveTab("worker")}
          >
            {t("profile.title")}
          </button>
          <button
            type="button"
            className={activeTab === "employer" ? "active" : ""}
            onClick={() => setActiveTab("employer")}
          >
            {t("employerProfile")}
          </button>
        </div>
      )}

      {error && <ErrorBanner error={error} />}

      {/* PREMIUM PROFILE COVER */}
      <section className={`profile-cover ${activeTab}`}>
        <div className="profile-cover-content">
          <h2>
            {activeTab === "worker"
              ? lang === "mr"
                ? "तुमची कौशल्ये, तुमची ओळख!"
                : lang === "hi"
                ? "आपका हुनर, आपकी पहचान!"
                : "Your Skills. Your Identity."
              : lang === "mr"
              ? "तुमचा व्यवसाय, तुमची ओळख!"
              : lang === "hi"
              ? "आपका व्यवसाय, आपकी पहचान!"
              : "Your Business. Your Identity."}
          </h2>
          <p>
            {activeTab === "worker"
              ? "Showcase your skills and connect with opportunities."
              : "Build your business identity and connect with local talent."}
          </p>
        </div>
      </section>

      {/* PROFILE IDENTITY */}
      <section className="profile-identity">
        <div className="profile-identity-avatar">
          {profileImage ? (
            <img src={profileImage} alt={labels.profilePicture} />
          ) : (
            <UserRound size={54} aria-hidden="true" />
          )}
        </div>

        <div className="profile-identity-info">
          <h1>{profileName}</h1>
          <div className="profile-identity-subtitle">
            <span>
              {activeTab === "worker" ? (
                <HardHat size={16} />
              ) : (
                <Building2 size={16} />
              )}
              {labels[activeTab]}
            </span>
            {activeTab === "worker" && workerProfile?.availability && (
              <span className="profile-status">
                <CheckCircle size={14} />
                {String(workerProfile.availability)}
              </span>
            )}
          </div>

          <div className="profile-photo-actions">
            <button
              type="button"
              className="profile-edit-button"
              onClick={openFilePicker}
            >
              <Camera size={15} />
              {profileImage ? labels.changePhoto : labels.addPhoto}
            </button>
            {profileImage && (
              <button
                type="button"
                className="profile-edit-button"
                onClick={handleRemovePhoto}
              >
                <Trash2 size={15} />
                {labels.removePhoto}
              </button>
            )}
          </div>

          {imageError && (
            <p className="profile-photo-error" role="alert">
              {imageError}
            </p>
          )}
          <p className="profile-photo-notice">{labels.localNotice}</p>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={handlePhotoUpload}
          className="profile-photo-file-input"
          aria-label={labels.addPhoto}
        />
      </section>

      {/* PROFILE COMPLETION AND VOICE PROFILE */}
      <div className="profile-overview-grid">
        <Card className="profile-glass-card">
          <div className="profile-progress-header">
            <h3>
              <CheckCircle size={20} color="#0891b2" />
              Profile completion
            </h3>
            <span className="profile-progress-value">
              {profileCompletion}%
            </span>
          </div>
          <div
            className="profile-progress-track"
            role="progressbar"
            aria-valuenow={profileCompletion}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Profile completion"
          >
            <div
              className="profile-progress-fill"
              style={{ width: `${profileCompletion}%` }}
            />
          </div>
          <p className="profile-progress-note">
            {currentProfile
              ? "Keep your information up to date to present a complete profile."
              : "Complete your profile to showcase your information."}
          </p>
        </Card>

        <Card className="profile-glass-card profile-overview-message">
          <h3>
            <Mic size={20} color="#7c3aed" />
            {t("voiceProfile")}
          </h3>
          <p>
            {activeTab === "worker"
              ? t("voiceProfileDesc")
              : t("profile.employer.voiceBanner.desc")}
          </p>
          <Link
            to={
              activeTab === "worker"
                ? "/voice-profile"
                : "/voice-profile?role=employer"
            }
            className="btn btn-primary animated-button"
          >
            <Mic size={17} />
            {activeTab === "worker"
              ? workerProfile
                ? t("updateWithVoice")
                : t("createWithVoice")
              : employerProfile
              ? t("updateWithVoice")
              : t("profile.employer.voiceBanner.action")}
          </Link>
        </Card>
      </div>

      {/* COLORFUL SHORTCUT CARDS */}
      <div className="profile-quick-grid">
        <button
          type="button"
          className="profile-quick-card profile-card-blue"
          onClick={() => scrollToSection("profile-details")}
        >
          <UserRound />
          <h3>
            {activeTab === "worker"
              ? t("personalDetails")
              : t("businessDetails")}
          </h3>
          <p>View and update information</p>
        </button>

        <button
          type="button"
          className="profile-quick-card profile-card-orange"
          onClick={() =>
            scrollToSection(
              activeTab === "worker"
                ? "profile-skills"
                : "profile-reviews"
            )
          }
        >
          {activeTab === "worker" ? <Wrench /> : <BriefcaseBusiness />}
          <h3>
            {activeTab === "worker"
              ? t("common.skills")
              : "Business reputation"}
          </h3>
          <p>
            {activeTab === "worker"
              ? "Show your abilities"
              : "See ratings and reviews"}
          </p>
        </button>

        <button
          type="button"
          className="profile-quick-card profile-card-purple"
          onClick={() => scrollToSection("profile-reviews")}
        >
          <Star />
          <h3>{t("reviews")}</h3>
          <p>Ratings and feedback</p>
        </button>

        <button
          type="button"
          className="profile-quick-card profile-card-green"
          onClick={() =>
            activeTab === "worker"
              ? scrollToSection("profile-availability")
              : scrollToSection("profile-details")
          }
        >
          {activeTab === "worker" ? <ClipboardList /> : <ShieldCheck />}
          <h3>
            {activeTab === "worker" ? "Availability" : "Business details"}
          </h3>
          <p>
            {activeTab === "worker"
              ? "Manage work availability"
              : "Manage your business profile"}
          </p>
        </button>
      </div>

      {/* ADD ANOTHER ROLE */}
      {!hasBothRoles && (isWorker || isEmployer) && (
        <Card className="profile-role-cta animated-card">
          <div>
            <h2>
              {isWorker ? (
                <>
                  <Briefcase size={20} />
                  {t("wantToHire")}
                </>
              ) : (
                <>
                  <HardHat size={20} />
                  {t("lookingForWork")}
                </>
              )}
            </h2>
            <p>
              {isWorker
                ? t("addEmployerAccessDesc")
                : t("addWorkerAccessDesc")}
            </p>
          </div>
          <Button
            onClick={() =>
              handleAddRole(
                isWorker ? USER_ROLES.EMPLOYER : USER_ROLES.WORKER
              )
            }
            disabled={addingRole !== null}
            className="animated-button"
          >
            {addingRole
              ? t("common.loading")
              : isWorker
              ? t("becomeEmployer")
              : t("becomeWorker")}
          </Button>
        </Card>
      )}

      {/* WORKER PROFILE SECTIONS */}
      {activeTab === "worker" && isWorker && (
        <>
          {workerProfile && (
            <div id="profile-availability">
              <Card className="profile-section profile-glass-card">
                <div className="profile-section-heading">
                  <h2>
                    <CheckCircle size={20} />
                    {t("voice.guided.availability.label")}
                  </h2>
                </div>
                <AvailabilityToggle
                  availability={workerProfile.availability}
                  onChange={handleAvailabilityChange}
                />
              </Card>
            </div>
          )}

          <div id="profile-details">
            <Card className="profile-section profile-glass-card">
              <div className="profile-section-heading">
                <h2>
                  <UserRound size={20} />
                  {t("personalDetails")}
                </h2>
                <button
                  type="button"
                  className="profile-edit-button"
                  onClick={() => scrollToSection("worker-form")}
                >
                  <Pencil size={15} />
                  {t("jobs.review.editDetails")}
                </button>
              </div>
              <div id="worker-form">
                <WorkerProfileForm
                  key={workerProfile?.updatedAt || workerProfile?._id || "new-worker-profile"}
                  profile={workerProfile}
                  categories={categories}
                  saving={saving}
                  onSave={handleSaveWorkerProfile}
                />
              </div>
            </Card>
          </div>

          {workerProfile && (
            <div id="profile-skills">
              <Card className="profile-section profile-glass-card">
                <div className="profile-section-heading">
                  <h2>
                    <Wrench size={20} />
                    {t("common.skills")}
                  </h2>
                </div>

                <div className="profile-skills">
                  {workerSkills.map((skill) => (
                    <span
                      className="profile-skill-badge"
                      key={skill._id}
                    >
                      <CheckCircle size={14} />
                      {skill.name ||
                        skill.skillName ||
                        skill.skill?.name ||
                        "Skill"}
                    </span>
                  ))}
                </div>

                <WorkerSkillsManager
                  skills={workerSkills}
                  catalogSkills={catalogSkills}
                  onAdd={handleAddSkill}
                  onRemove={handleRemoveSkill}
                />
              </Card>
            </div>
          )}

          <div id="profile-reviews">
            {user && (
              <Card className="profile-section profile-glass-card">
                <div className="profile-section-heading">
                  <h2>
                    <Star size={20} />
                    {t("reviews")}
                  </h2>
                </div>
                <RatingList
                  userId={user._id}
                  ratingAvg={workerProfile?.ratingAvg}
                  ratingCount={workerProfile?.ratingCount}
                  workerProfile={workerProfile}
                  employerProfile={employerProfile}
                  isWorker={isWorker}
                  isEmployer={isEmployer}
                  activeTab="worker"
                />
              </Card>
            )}
          </div>
        </>
      )}
      {/* EMPLOYER PROFILE SECTIONS */}
      {activeTab === "employer" && isEmployer && (
        <>
          <div id="profile-details">
            <Card className="profile-section profile-glass-card">
              <div className="profile-section-heading">
                <h2>
                  <Building2 size={20} />
                  {t("businessDetails")}
                </h2>

                <button
                  type="button"
                  className="profile-edit-button"
                  onClick={() => scrollToSection("employer-form")}
                >
                  <Pencil size={15} />
                  {t("jobs.review.editDetails")}
                </button>
              </div>

              <div id="employer-form">
                <EmployerProfileForm
                  key={employerProfile?.updatedAt || employerProfile?._id || "new-employer-profile"}
                  profile={employerProfile}
                  saving={saving}
                  onSave={handleSaveEmployerProfile}
                />
              </div>
            </Card>
          </div>

          <div id="profile-reviews">
            {user && (
              <Card className="profile-section profile-glass-card">
                <div className="profile-section-heading">
                  <h2>
                    <Star size={20} />
                    {t("reviews")}
                  </h2>
                </div>

                <RatingList
                  userId={user._id}
                  ratingAvg={employerProfile?.ratingAvg}
                  ratingCount={employerProfile?.ratingCount}
                  workerProfile={workerProfile}
                  employerProfile={employerProfile}
                  isWorker={isWorker}
                  isEmployer={isEmployer}
                  activeTab="employer"
                />
              </Card>
            )}
          </div>
        </>
      )}
    </div>
  );
}