import { useState, useMemo } from "react";
import {
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Ban,
  Clock,
  CalendarCheck,
} from "lucide-react";
import { useLanguage } from "../../hooks/useLanguage";
import {
  addDays,
  addMonths,
  appointmentLocalDate,
  buildMonthGrid,
  buildWeekDates,
  computeDateWorkingIntervals,
  formatDisplayDate,
  formatMonthHeading,
  todayDateString,
} from "../../utils/calendarHelpers";
import { AppointmentCard } from "./AppointmentCard";
import "./ScheduleCalendar.css";

/**
 * Shared interactive Month / Week / Day-Agenda calendar for Worker & Employer dashboards.
 *
 * @param {{
 *   perspective: "worker" | "employer",
 *   appointments: Array<object>,
 *   weekly?: Array<object>,
 *   exceptions?: Array<object>,
 *   timeZone?: string,
 *   selectedDate?: string,
 *   onSelectDate?: (date: string) => void,
 *   onAccept?: (id: string) => Promise<void>,
 *   onReject?: (id: string) => Promise<void>,
 *   onCancel?: (id: string) => Promise<void>,
 *   onComplete?: (id: string) => Promise<void>,
 *   busyId?: string|null
 * }} props
 */
export function ScheduleCalendar({
  perspective = "worker",
  appointments = [],
  weekly = [],
  exceptions = [],
  timeZone = "Asia/Kolkata",
  selectedDate: controlledDate,
  onSelectDate,
  onAccept,
  onReject,
  onCancel,
  onComplete,
  busyId = null,
}) {
  const { language, t } = useLanguage();
  const today = useMemo(() => todayDateString(timeZone), [timeZone]);
  const [internalDate, setInternalDate] = useState(controlledDate || today);
  const [viewMode, setViewMode] = useState("month"); // "month" | "week" | "agenda"

  const selectedDate = controlledDate || internalDate;
  const selectDate = (nextDate) => {
    setInternalDate(nextDate);
    if (onSelectDate) onSelectDate(nextDate);
  };

  const handleNavigate = (dir) => {
    if (viewMode === "month") {
      selectDate(addMonths(selectedDate, dir));
    } else if (viewMode === "week") {
      selectDate(addDays(selectedDate, dir * 7));
    } else {
      selectDate(addDays(selectedDate, dir));
    }
  };

  // Index appointments by local YYYY-MM-DD in timeZone
  const appointmentsByDate = useMemo(() => {
    const map = new Map();
    for (const appt of appointments || []) {
      const d = appointmentLocalDate(appt.startAt, appt.timeZone || timeZone);
      if (!d) continue;
      if (!map.has(d)) map.set(d, []);
      map.get(d).push(appt);
    }
    return map;
  }, [appointments, timeZone]);

  const monthCells = useMemo(() => buildMonthGrid(selectedDate), [selectedDate]);
  const weekDates = useMemo(() => buildWeekDates(selectedDate), [selectedDate]);

  const selectedDayIntervals = useMemo(
    () =>
      perspective === "worker"
        ? computeDateWorkingIntervals(selectedDate, weekly, exceptions)
        : [],
    [perspective, selectedDate, weekly, exceptions]
  );

  const selectedDayBlocked = useMemo(
    () =>
      perspective === "worker" &&
      (exceptions || []).some((e) => e.date === selectedDate && e.type === "block_day"),
    [perspective, selectedDate, exceptions]
  );

  const selectedDateAppointments = appointmentsByDate.get(selectedDate) || [];

  const renderDayCell = (cell) => {
    const d = cell.date;
    const isToday = d === today;
    const isSelected = d === selectedDate;
    const dayAppts = appointmentsByDate.get(d) || [];
    const pendingCount = dayAppts.filter((a) => a.status === "pending").length;
    const confirmedCount = dayAppts.filter((a) => a.status === "confirmed").length;

    const isBlocked =
      perspective === "worker" &&
      (exceptions || []).some((e) => e.date === d && e.type === "block_day");
    const intervals =
      perspective === "worker"
        ? computeDateWorkingIntervals(d, weekly, exceptions)
        : [];

    const cellClasses = [
      "sched-day-cell",
      !cell.inCurrentMonth ? "outside-month" : "",
      isToday ? "today" : "",
      isSelected ? "selected" : "",
      isBlocked ? "blocked" : "",
    ]
      .filter(Boolean)
      .join(" ");

    return (
      <button
        key={d}
        type="button"
        className={cellClasses}
        onClick={() => selectDate(d)}
        aria-pressed={isSelected}
        aria-label={formatDisplayDate(d, language)}
      >
        <div className="sched-day-top">
          <span className="sched-day-number">{cell.dayNumber}</span>
        </div>

        <div className="sched-day-badges">
          {perspective === "worker" && (
            isBlocked ? (
              <span className="sched-chip sched-chip-blocked">
                <Ban size={11} aria-hidden="true" />
                <span>{t("scheduling.blockedDay")}</span>
              </span>
            ) : intervals.length > 0 ? (
              <span className="sched-chip sched-chip-available">
                <CheckCircle2 size={11} aria-hidden="true" />
                <span>
                  {intervals[0].start}–{intervals[intervals.length - 1].end}
                </span>
              </span>
            ) : (
              <span className="sched-chip sched-chip-unavailable">
                <span>{t("scheduling.unavailableDay")}</span>
              </span>
            )
          )}

          {confirmedCount > 0 && (
            <span className="sched-chip sched-chip-confirmed">
              <CalendarCheck size={11} aria-hidden="true" />
              <span>
                {confirmedCount} {t("appointments.status.confirmed")}
              </span>
            </span>
          )}

          {pendingCount > 0 && (
            <span className="sched-chip sched-chip-pending">
              <Clock size={11} aria-hidden="true" />
              <span>
                {pendingCount} {t("appointments.status.pending")}
              </span>
            </span>
          )}
        </div>
      </button>
    );
  };

  return (
    <div className="sched-calendar-wrapper">
      <div className="sched-toolbar">
        <div className="sched-nav-group">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => handleNavigate(-1)}
            aria-label={t("scheduling.prev")}
          >
            <ChevronLeft size={17} aria-hidden="true" />
            <span>{t("scheduling.prev")}</span>
          </button>

          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => selectDate(today)}
          >
            {t("scheduling.today")}
          </button>

          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => handleNavigate(1)}
            aria-label={t("scheduling.next")}
          >
            <span>{t("scheduling.next")}</span>
            <ChevronRight size={17} aria-hidden="true" />
          </button>

          <h3 className="sched-heading">
            {viewMode === "agenda"
              ? formatDisplayDate(selectedDate, language)
              : formatMonthHeading(selectedDate, language)}
          </h3>
        </div>

        <div className="sched-view-switcher" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={viewMode === "month"}
            className={`sched-view-btn ${viewMode === "month" ? "active" : ""}`}
            onClick={() => setViewMode("month")}
          >
            {t("scheduling.viewMonth")}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={viewMode === "week"}
            className={`sched-view-btn ${viewMode === "week" ? "active" : ""}`}
            onClick={() => setViewMode("week")}
          >
            {t("scheduling.viewWeek")}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={viewMode === "agenda"}
            className={`sched-view-btn ${viewMode === "agenda" ? "active" : ""}`}
            onClick={() => setViewMode("agenda")}
          >
            {t("scheduling.viewAgenda")}
          </button>
        </div>
      </div>

      {/* Accessible Legend */}
      <div className="sched-legend">
        {perspective === "worker" && (
          <>
            <span className="sched-legend-item">
              <CheckCircle2 size={14} color="#166534" aria-hidden="true" />
              {t("scheduling.available")}
            </span>
            <span className="sched-legend-item">
              <Ban size={14} color="#991b1b" aria-hidden="true" />
              {t("scheduling.blockedDay")}
            </span>
          </>
        )}
        <span className="sched-legend-item">
          <CalendarCheck size={14} color="#1e40af" aria-hidden="true" />
          {t("appointments.status.confirmed")}
        </span>
        <span className="sched-legend-item">
          <Clock size={14} color="#92400e" aria-hidden="true" />
          {t("appointments.status.pending")}
        </span>
      </div>

      {viewMode !== "agenda" && (
        <>
          <div className="sched-weekday-header">
            {[1, 2, 3, 4, 5, 6, 7].map((wd) => (
              <div key={wd}>{t(`scheduling.weekdayShort.${wd}`)}</div>
            ))}
          </div>

          {viewMode === "month" ? (
            <div className="sched-grid-month">
              {monthCells.map((cell) => renderDayCell(cell))}
            </div>
          ) : (
            <div className="sched-grid-week">
              {weekDates.map((d) =>
                renderDayCell({
                  date: d,
                  dayNumber: Number(d.slice(8, 10)),
                  inCurrentMonth: true,
                })
              )}
            </div>
          )}
        </>
      )}

      {/* Selected Date Details & Day/Agenda View */}
      <div className="sched-selected-panel">
        <div className="sched-selected-header">
          <h3>
            {t("scheduling.selectedDate")}: {formatDisplayDate(selectedDate, language)}
          </h3>
        </div>

        {perspective === "worker" && (
          <div className="sched-hours-list">
            <strong>{t("scheduling.workingHoursOnDate")}:</strong>
            {selectedDayBlocked ? (
              <span className="sched-chip sched-chip-blocked">
                <Ban size={12} aria-hidden="true" /> {t("scheduling.blockedDay")}
              </span>
            ) : selectedDayIntervals.length === 0 ? (
              <span className="sched-chip sched-chip-unavailable">
                {t("scheduling.unavailableDay")}
              </span>
            ) : (
              selectedDayIntervals.map((iv, idx) => (
                <span key={idx} className="sched-chip sched-chip-available">
                  <CheckCircle2 size={12} aria-hidden="true" />
                  {iv.start} – {iv.end}
                </span>
              ))
            )}
          </div>
        )}

        {selectedDateAppointments.length === 0 ? (
          <p style={{ color: "#64748b", margin: "8px 0 0" }}>
            {t("scheduling.noAppointmentsOnDate")}
          </p>
        ) : (
          <div>
            {selectedDateAppointments.map((appt) => (
              <AppointmentCard
                key={appt._id}
                appointment={appt}
                perspective={perspective}
                onAccept={onAccept}
                onReject={onReject}
                onCancel={onCancel}
                onComplete={onComplete}
                busyId={busyId}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

