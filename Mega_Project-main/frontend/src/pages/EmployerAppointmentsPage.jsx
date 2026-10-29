import { useState, useEffect, useCallback, useMemo } from "react";
import { Calendar, CheckCircle2, CalendarClock } from "lucide-react";
import { useLanguage } from "../hooks/useLanguage";
import * as schedulingApi from "../api/scheduling";
import { normalizeError } from "../api/client";
import { ScheduleCalendar } from "../components/scheduling/ScheduleCalendar";
import { AppointmentCard } from "../components/scheduling/AppointmentCard";
import { Spinner } from "../components/common/Spinner";
import { ErrorBanner } from "../components/common/ErrorBanner";
import { EmptyState } from "../components/common/EmptyState";
import "./WorkerAvailabilityPage.css";

const STATUS_FILTERS = [
  { id: "all", labelKey: "scheduling.filterAll" },
  { id: "pending", labelKey: "appointments.status.pending" },
  { id: "confirmed", labelKey: "appointments.status.confirmed" },
  { id: "completed", labelKey: "appointments.status.completed" },
  { id: "rejected", labelKey: "appointments.status.rejected" },
  { id: "cancelled", labelKey: "appointments.status.cancelled" },
  { id: "expired", labelKey: "appointments.status.expired" },
];

export function EmployerAppointmentsPage() {
  const { t } = useLanguage();

  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [busyApptId, setBusyApptId] = useState(null);
  const [actionNotice, setActionNotice] = useState(null);
  const [actionError, setActionError] = useState(null);

  const loadAppointments = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await schedulingApi.getAppointments({ role: "employer" });
      setAppointments(Array.isArray(data) ? data : []);
    } catch (err) {
      setLoadError(normalizeError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAppointments();
  }, [loadAppointments]);

  const filteredAppointments = useMemo(() => {
    if (statusFilter === "all") return appointments;
    return appointments.filter((a) => a.status === statusFilter);
  }, [appointments, statusFilter]);

  const handleCancel = async (id, reason) => {
    setBusyApptId(id);
    setActionError(null);
    setActionNotice(null);
    try {
      await schedulingApi.cancelAppointment(id, { reason });
      setActionNotice(t("scheduling.cancelledMsg"));
      await loadAppointments();
    } catch (err) {
      setActionError(normalizeError(err));
    } finally {
      setBusyApptId(null);
    }
  };

  const handleComplete = async (id) => {
    setBusyApptId(id);
    setActionError(null);
    setActionNotice(null);
    try {
      await schedulingApi.completeAppointment(id);
      setActionNotice(t("scheduling.completedMsg"));
      await loadAppointments();
    } catch (err) {
      setActionError(normalizeError(err));
    } finally {
      setBusyApptId(null);
    }
  };

  return (
    <div className="worker-availability-page page-animate">
      <header className="worker-availability-header">
        <div>
          <h1>
            <Calendar size={28} aria-hidden="true" />
            <span>{t("scheduling.employerTitle")}</span>
          </h1>
          <p>{t("scheduling.employerSubtitle")}</p>
        </div>
      </header>

      {loadError && <ErrorBanner error={loadError} onRetry={loadAppointments} />}
      {actionError && <ErrorBanner error={actionError} />}

      {actionNotice && (
        <div
          role="status"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            background: "#ecfdf5",
            border: "1px solid #86efac",
            color: "#065f46",
            padding: "10px 14px",
            borderRadius: "10px",
            marginBottom: "16px",
            fontWeight: 600,
          }}
        >
          <CheckCircle2 size={18} aria-hidden="true" />
          <span>{actionNotice}</span>
        </div>
      )}

      {loading ? (
        <Spinner label={t("common.loading")} />
      ) : (
        <>
          <ScheduleCalendar
            appointments={appointments}
            perspective="employer"
            timeZone="Asia/Kolkata"
            onCancel={handleCancel}
            onComplete={handleComplete}
            busyId={busyApptId}
          />

          <section className="worker-appointments-section" style={{ marginTop: "24px" }}>
            <div className="sched-tabs-bar" role="group" aria-label={t("scheduling.allAppointmentsTitle")}>
              {STATUS_FILTERS.map((filter) => {
                const count =
                  filter.id === "all"
                    ? appointments.length
                    : appointments.filter((a) => a.status === filter.id).length;
                return (
                  <button
                    key={filter.id}
                    type="button"
                    className={`sched-tab-button ${statusFilter === filter.id ? "active" : ""}`}
                    onClick={() => setStatusFilter(filter.id)}
                    aria-pressed={statusFilter === filter.id}
                  >
                    <span>{t(filter.labelKey)}</span>
                    <span
                      style={{
                        background: statusFilter === filter.id ? "rgba(255,255,255,0.22)" : "#f1f5f9",
                        color: statusFilter === filter.id ? "#ffffff" : "#334155",
                        borderRadius: "999px",
                        padding: "1px 8px",
                        fontSize: "0.78rem",
                      }}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>

            {filteredAppointments.length === 0 ? (
              <EmptyState
                icon={CalendarClock}
                title={t("scheduling.noUpcomingAppointments")}
                description={t("scheduling.employerSubtitle")}
              />
            ) : (
              <div className="sched-agenda-list">
                {filteredAppointments.map((appt) => (
                  <AppointmentCard
                    key={appt._id}
                    appointment={appt}
                    perspective="employer"
                    onCancel={handleCancel}
                    onComplete={handleComplete}
                    busy={busyApptId === appt._id}
                  />
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
