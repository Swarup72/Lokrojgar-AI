import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Calendar,
  Clock,
  ShieldAlert,
  Plus,
  Trash2,
  CheckCircle2,
  Inbox,
  CalendarCheck,
} from "lucide-react";
import { useLanguage } from "../hooks/useLanguage";
import * as schedulingApi from "../api/scheduling";
import { normalizeError } from "../api/client";
import {
  formatDisplayDate,
  todayDateString,
  validateDayIntervals,
} from "../utils/calendarHelpers";
import { ScheduleCalendar } from "../components/scheduling/ScheduleCalendar";
import { AppointmentCard } from "../components/scheduling/AppointmentCard";
import { Spinner } from "../components/common/Spinner";
import { ErrorBanner } from "../components/common/ErrorBanner";
import { EmptyState } from "../components/common/EmptyState";
import { StatusPill } from "../components/common/StatusPill";
import "./WorkerAvailabilityPage.css";

const DEFAULT_WEEK = [1, 2, 3, 4, 5, 6, 7].map((wd) => ({
  weekday: wd,
  intervals: wd <= 6 ? [{ start: "09:00", end: "18:00" }] : [],
}));

export function WorkerAvailabilityPage() {
  const { language, t } = useLanguage();
  const [activeTab, setActiveTab] = useState("calendar"); // "calendar" | "weekly" | "exceptions"

  const [availability, setAvailability] = useState(null);
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const [weeklyDraft, setWeeklyDraft] = useState(DEFAULT_WEEK);
  const [savingWeekly, setSavingWeekly] = useState(false);
  const [weeklyNotice, setWeeklyNotice] = useState(null);
  const [weeklyError, setWeeklyError] = useState(null);
  const [weeklyConflictPending, setWeeklyConflictPending] = useState(false);

  const [excDate, setExcDate] = useState(() => todayDateString("Asia/Kolkata"));
  const [excType, setExcType] = useState("block_day");
  const [excStart, setExcStart] = useState("10:00");
  const [excEnd, setExcEnd] = useState("14:00");
  const [excReason, setExcReason] = useState("");
  const [savingExc, setSavingExc] = useState(false);
  const [excError, setExcError] = useState(null);
  const [excNotice, setExcNotice] = useState(null);

  const [busyApptId, setBusyApptId] = useState(null);
  const [apptActionNotice, setApptActionNotice] = useState(null);
  const [apptActionError, setApptActionError] = useState(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [availData, apptsData] = await Promise.all([
        schedulingApi.getMyAvailability(),
        schedulingApi.getAppointments({ role: "worker" }),
      ]);
      setAvailability(availData);
      setAppointments(Array.isArray(apptsData) ? apptsData : []);
      if (Array.isArray(availData?.weekly) && availData.weekly.length > 0) {
        const byWd = new Map(availData.weekly.map((d) => [d.weekday, d.intervals || []]));
        setWeeklyDraft(
          [1, 2, 3, 4, 5, 6, 7].map((wd) => ({
            weekday: wd,
            intervals: (byWd.get(wd) || []).map((iv) => ({ start: iv.start, end: iv.end })),
          }))
        );
      }
    } catch (err) {
      setLoadError(normalizeError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const toggleDayAvailable = (weekday, enabled) => {
    setWeeklyDraft((prev) =>
      prev.map((d) =>
        d.weekday === weekday
          ? {
              ...d,
              intervals: enabled
                ? d.intervals.length > 0
                  ? d.intervals
                  : [{ start: "09:00", end: "18:00" }]
                : [],
            }
          : d
      )
    );
  };

  const updateIntervalField = (weekday, idx, field, value) => {
    setWeeklyDraft((prev) =>
      prev.map((d) =>
        d.weekday === weekday
          ? {
              ...d,
              intervals: d.intervals.map((iv, i) =>
                i === idx ? { ...iv, [field]: value } : iv
              ),
            }
          : d
      )
    );
  };

  const addDayInterval = (weekday) => {
    setWeeklyDraft((prev) =>
      prev.map((d) =>
        d.weekday === weekday
          ? {
              ...d,
              intervals: [...d.intervals, { start: "14:00", end: "18:00" }],
            }
          : d
      )
    );
  };

  const removeDayInterval = (weekday, idx) => {
    setWeeklyDraft((prev) =>
      prev.map((d) =>
        d.weekday === weekday
          ? {
              ...d,
              intervals: d.intervals.filter((_, i) => i !== idx),
            }
          : d
      )
    );
  };

  const handleSaveWeekly = async (acknowledgeConfirmedConflicts = false) => {
    setWeeklyError(null);
    setWeeklyNotice(null);

    for (const day of weeklyDraft) {
      const errCode = validateDayIntervals(day.intervals);
      if (errCode) {
        setWeeklyError({
          message: `${t(`scheduling.weekday.${day.weekday}`)}: ${t("scheduling.overnightHint")}`,
        });
        return;
      }
    }

    setSavingWeekly(true);
    try {
      const updated = await schedulingApi.updateMyAvailability({
        timeZone: availability?.timeZone || "Asia/Kolkata",
        weekly: weeklyDraft,
        acknowledgeConfirmedConflicts,
      });
      setAvailability((prev) => ({ ...prev, ...updated }));
      setWeeklyConflictPending(false);
      setWeeklyNotice(t("scheduling.scheduleSaved"));
    } catch (err) {
      const norm = normalizeError(err);
      if (norm.status === 409) {
        setWeeklyConflictPending(true);
      }
      setWeeklyError(norm);
    } finally {
      setSavingWeekly(false);
    }
  };

  const handleAddException = async (e) => {
    e.preventDefault();
    setExcError(null);
    setExcNotice(null);

    if (excType !== "block_day") {
      const errCode = validateDayIntervals([{ start: excStart, end: excEnd }]);
      if (errCode) {
        setExcError({ message: t("scheduling.overnightHint") });
        return;
      }
    }

    setSavingExc(true);
    try {
      const updated = await schedulingApi.addAvailabilityException({
        date: excDate,
        type: excType,
        ...(excType === "block_day" ? {} : { start: excStart, end: excEnd }),
        reason: excReason.trim(),
      });
      setAvailability((prev) => ({ ...prev, ...updated }));
      setExcReason("");
      setExcNotice(t("scheduling.exceptionAdded"));
    } catch (err) {
      setExcError(normalizeError(err));
    } finally {
      setSavingExc(false);
    }
  };

  const handleRemoveException = async (exceptionId) => {
    setExcError(null);
    setExcNotice(null);
    try {
      const updated = await schedulingApi.removeAvailabilityException(exceptionId);
      setAvailability((prev) => ({ ...prev, ...updated }));
      setExcNotice(t("scheduling.exceptionRemoved"));
    } catch (err) {
      setExcError(normalizeError(err));
    }
  };

  const runAppointmentAction = async (id, fn, successMessageKey) => {
    setBusyApptId(id);
    setApptActionError(null);
    setApptActionNotice(null);
    try {
      await fn();
      setApptActionNotice(t(successMessageKey));
      await loadAll();
    } catch (err) {
      setApptActionError(normalizeError(err));
    } finally {
      setBusyApptId(null);
    }
  };

  const pendingRequests = useMemo(
    () => appointments.filter((a) => a.status === "pending"),
    [appointments]
  );

  const upcomingConfirmed = useMemo(
    () => appointments.filter((a) => a.status === "confirmed"),
    [appointments]
  );

  return (
    <div className="worker-availability-page page-animate">
      <div className="worker-availability-header">
        <div>
          <h1>
            <Calendar size={28} aria-hidden="true" />
            <span>{t("scheduling.workerTitle")}</span>
          </h1>
          <p>{t("scheduling.workerSubtitle")}</p>
        </div>
        {availability?.coarseAvailability && (
          <StatusPill status={availability.coarseAvailability} />
        )}
      </div>

      {/* Section Navigation Tabs */}
      <div className="sched-tabs-bar" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "calendar"}
          className={`sched-tab-button ${activeTab === "calendar" ? "active" : ""}`}
          onClick={() => setActiveTab("calendar")}
        >
          <Calendar size={18} aria-hidden="true" />
          <span>{t("scheduling.tabCalendar")}</span>
          {pendingRequests.length > 0 && (
            <span className="nav-badge-dot" style={{ marginLeft: 4 }}>
              {pendingRequests.length}
            </span>
          )}
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "weekly"}
          className={`sched-tab-button ${activeTab === "weekly" ? "active" : ""}`}
          onClick={() => setActiveTab("weekly")}
        >
          <Clock size={18} aria-hidden="true" />
          <span>{t("scheduling.tabWeekly")}</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "exceptions"}
          className={`sched-tab-button ${activeTab === "exceptions" ? "active" : ""}`}
          onClick={() => setActiveTab("exceptions")}
        >
          <ShieldAlert size={18} aria-hidden="true" />
          <span>{t("scheduling.tabExceptions")}</span>
        </button>
      </div>

      {loading && <Spinner label={t("common.loading")} />}
      {!loading && loadError && <ErrorBanner error={loadError} onRetry={loadAll} />}

      {!loading && !loadError && (
        <>
          {apptActionError && <ErrorBanner error={apptActionError} />}
          {apptActionNotice && (
            <div
              role="status"
              style={{
                padding: "12px 16px",
                background: "#dcfce7",
                color: "#166534",
                borderRadius: 12,
                fontWeight: 700,
                marginBottom: 16,
              }}
            >
              <CheckCircle2 size={16} aria-hidden="true" style={{ verticalAlign: "text-bottom", marginRight: 6 }} />
              {apptActionNotice}
            </div>
          )}

          {/* TAB 1: CALENDAR & APPOINTMENT REQUESTS */}
          {activeTab === "calendar" && (
            <>
              <ScheduleCalendar
                perspective="worker"
                appointments={appointments}
                weekly={availability?.weekly || weeklyDraft}
                exceptions={availability?.exceptions || []}
                timeZone={availability?.timeZone || "Asia/Kolkata"}
                busyId={busyApptId}
                onAccept={(id) =>
                  runAppointmentAction(
                    id,
                    () => schedulingApi.acceptAppointment(id),
                    "scheduling.acceptedMsg"
                  )
                }
                onReject={(id) =>
                  runAppointmentAction(
                    id,
                    () => schedulingApi.rejectAppointment(id),
                    "scheduling.rejectedMsg"
                  )
                }
                onCancel={(id) =>
                  runAppointmentAction(
                    id,
                    () => schedulingApi.cancelAppointment(id),
                    "scheduling.cancelledMsg"
                  )
                }
                onComplete={(id) =>
                  runAppointmentAction(
                    id,
                    () => schedulingApi.completeAppointment(id),
                    "scheduling.completedMsg"
                  )
                }
              />

              <div className="sched-two-col">
                <section aria-label={t("scheduling.pendingRequestsTitle")}>
                  <h2 style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "1.2rem" }}>
                    <Inbox size={20} aria-hidden="true" />
                    <span>
                      {t("scheduling.pendingRequestsTitle")} ({pendingRequests.length})
                    </span>
                  </h2>
                  {pendingRequests.length === 0 ? (
                    <EmptyState
                      icon={Inbox}
                      title={t("scheduling.noPendingRequests")}
                    />
                  ) : (
                    pendingRequests.map((appt) => (
                      <AppointmentCard
                        key={appt._id}
                        appointment={appt}
                        perspective="worker"
                        busyId={busyApptId}
                        onAccept={(id) =>
                          runAppointmentAction(
                            id,
                            () => schedulingApi.acceptAppointment(id),
                            "scheduling.acceptedMsg"
                          )
                        }
                        onReject={(id) =>
                          runAppointmentAction(
                            id,
                            () => schedulingApi.rejectAppointment(id),
                            "scheduling.rejectedMsg"
                          )
                        }
                        onCancel={(id) =>
                          runAppointmentAction(
                            id,
                            () => schedulingApi.cancelAppointment(id),
                            "scheduling.cancelledMsg"
                          )
                        }
                      />
                    ))
                  )}
                </section>

                <section aria-label={t("scheduling.upcomingConfirmedTitle")}>
                  <h2 style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "1.2rem" }}>
                    <CalendarCheck size={20} aria-hidden="true" />
                    <span>
                      {t("scheduling.upcomingConfirmedTitle")} ({upcomingConfirmed.length})
                    </span>
                  </h2>
                  {upcomingConfirmed.length === 0 ? (
                    <EmptyState
                      icon={CalendarCheck}
                      title={t("scheduling.noUpcomingAppointments")}
                    />
                  ) : (
                    upcomingConfirmed.map((appt) => (
                      <AppointmentCard
                        key={appt._id}
                        appointment={appt}
                        perspective="worker"
                        busyId={busyApptId}
                        onCancel={(id) =>
                          runAppointmentAction(
                            id,
                            () => schedulingApi.cancelAppointment(id),
                            "scheduling.cancelledMsg"
                          )
                        }
                        onComplete={(id) =>
                          runAppointmentAction(
                            id,
                            () => schedulingApi.completeAppointment(id),
                            "scheduling.completedMsg"
                          )
                        }
                      />
                    ))
                  )}
                </section>
              </div>
            </>
          )}

          {/* TAB 2: WEEKLY WORKING HOURS EDITOR */}
          {activeTab === "weekly" && (
            <div className="weekly-editor-card">
              <h2>{t("scheduling.tabWeekly")}</h2>
              <p style={{ color: "#475569", marginTop: 4 }}>{t("scheduling.overnightHint")}</p>

              {weeklyError && <ErrorBanner error={weeklyError} />}
              {weeklyConflictPending && (
                <div style={{ margin: "10px 0" }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={savingWeekly}
                    onClick={() => handleSaveWeekly(true)}
                  >
                    {t("scheduling.acknowledgeConflictsBtn")}
                  </button>
                </div>
              )}
              {weeklyNotice && (
                <div
                  role="status"
                  style={{
                    padding: "10px 14px",
                    background: "#dcfce7",
                    color: "#166534",
                    borderRadius: 10,
                    fontWeight: 700,
                    marginBottom: 12,
                  }}
                >
                  {weeklyNotice}
                </div>
              )}

              <div>
                {weeklyDraft.map((day) => {
                  const isAvailable = day.intervals.length > 0;
                  return (
                    <div key={day.weekday} className="weekly-day-row">
                      <label className="weekly-day-label">
                        <input
                          type="checkbox"
                          checked={isAvailable}
                          onChange={(e) => toggleDayAvailable(day.weekday, e.target.checked)}
                        />
                        <span>{t(`scheduling.weekday.${day.weekday}`)}</span>
                      </label>

                      <div className="weekly-intervals-col">
                        {!isAvailable ? (
                          <span style={{ color: "#64748b", fontWeight: 600 }}>
                            {t("scheduling.unavailableDay")}
                          </span>
                        ) : (
                          day.intervals.map((iv, idx) => (
                            <div key={idx} className="weekly-interval-row">
                              <input
                                type="time"
                                value={iv.start}
                                aria-label={`${t(`scheduling.weekday.${day.weekday}`)} start ${idx + 1}`}
                                onChange={(e) =>
                                  updateIntervalField(day.weekday, idx, "start", e.target.value)
                                }
                              />
                              <span>–</span>
                              <input
                                type="time"
                                value={iv.end}
                                aria-label={`${t(`scheduling.weekday.${day.weekday}`)} end ${idx + 1}`}
                                onChange={(e) =>
                                  updateIntervalField(day.weekday, idx, "end", e.target.value)
                                }
                              />
                              <button
                                type="button"
                                className="btn btn-secondary"
                                onClick={() => removeDayInterval(day.weekday, idx)}
                                aria-label={t("scheduling.removeInterval")}
                              >
                                <Trash2 size={15} aria-hidden="true" />
                              </button>
                            </div>
                          ))
                        )}
                      </div>

                      {isAvailable && (
                        <button
                          type="button"
                          className="btn btn-secondary"
                          onClick={() => addDayInterval(day.weekday)}
                        >
                          <Plus size={15} aria-hidden="true" />
                          <span>{t("scheduling.addInterval")}</span>
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>

              <div style={{ marginTop: 18 }}>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={savingWeekly}
                  onClick={() => handleSaveWeekly(false)}
                >
                  {savingWeekly ? t("scheduling.savingSchedule") : t("scheduling.saveSchedule")}
                </button>
              </div>
            </div>
          )}

          {/* TAB 3: DATE EXCEPTIONS & BLOCKS */}
          {activeTab === "exceptions" && (
            <div className="exceptions-editor-card">
              <h2>{t("scheduling.exceptionTitle")}</h2>

              {excError && <ErrorBanner error={excError} />}
              {excNotice && (
                <div
                  role="status"
                  style={{
                    padding: "10px 14px",
                    background: "#dcfce7",
                    color: "#166534",
                    borderRadius: 10,
                    fontWeight: 700,
                    marginBottom: 12,
                  }}
                >
                  {excNotice}
                </div>
              )}

              <form onSubmit={handleAddException}>
                <div className="exceptions-form-grid">
                  <div>
                    <label htmlFor="exc-date">{t("scheduling.exceptionDate")}</label>
                    <input
                      id="exc-date"
                      type="date"
                      required
                      value={excDate}
                      onChange={(e) => setExcDate(e.target.value)}
                    />
                  </div>

                  <div>
                    <label htmlFor="exc-type">{t("scheduling.exceptionType")}</label>
                    <select
                      id="exc-type"
                      value={excType}
                      onChange={(e) => setExcType(e.target.value)}
                    >
                      <option value="block_day">
                        {t("scheduling.exceptionType.block_day")}
                      </option>
                      <option value="block_range">
                        {t("scheduling.exceptionType.block_range")}
                      </option>
                      <option value="extra">
                        {t("scheduling.exceptionType.extra")}
                      </option>
                    </select>
                  </div>

                  {excType !== "block_day" && (
                    <>
                      <div>
                        <label htmlFor="exc-start">{t("scheduling.exceptionStart")}</label>
                        <input
                          id="exc-start"
                          type="time"
                          required
                          value={excStart}
                          onChange={(e) => setExcStart(e.target.value)}
                        />
                      </div>

                      <div>
                        <label htmlFor="exc-end">{t("scheduling.exceptionEnd")}</label>
                        <input
                          id="exc-end"
                          type="time"
                          required
                          value={excEnd}
                          onChange={(e) => setExcEnd(e.target.value)}
                        />
                      </div>
                    </>
                  )}

                  <div>
                    <label htmlFor="exc-reason">{t("scheduling.exceptionReason")}</label>
                    <input
                      id="exc-reason"
                      type="text"
                      maxLength={200}
                      value={excReason}
                      onChange={(e) => setExcReason(e.target.value)}
                    />
                  </div>
                </div>

                <button type="submit" className="btn btn-primary" disabled={savingExc}>
                  <Plus size={16} aria-hidden="true" />
                  <span>{t("scheduling.exceptionAddBtn")}</span>
                </button>
              </form>

              <hr style={{ margin: "22px 0", borderColor: "#e2e8f0" }} />

              <h3>{t("scheduling.exceptionsListTitle")}</h3>
              {(availability?.exceptions || []).length === 0 ? (
                <p style={{ color: "#64748b" }}>{t("scheduling.noExceptions")}</p>
              ) : (
                (availability?.exceptions || []).map((exc) => (
                  <div key={exc._id} className="exception-item-row">
                    <div>
                      <strong>{formatDisplayDate(exc.date, language)}</strong> —{" "}
                      <span>{t(`scheduling.exceptionType.${exc.type}`)}</span>
                      {exc.start && exc.end && (
                        <span>
                          {" "}
                          ({exc.start} – {exc.end})
                        </span>
                      )}
                      {exc.reason && (
                        <span style={{ color: "#64748b", marginLeft: 8 }}>
                          • {exc.reason}
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      className="btn btn-danger"
                      onClick={() => handleRemoveException(exc._id)}
                    >
                      <Trash2 size={15} aria-hidden="true" />
                      <span>{t("common.delete")}</span>
                    </button>
                  </div>
                ))
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

