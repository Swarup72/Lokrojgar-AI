import { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { X, Calendar, Clock, CheckCircle2, Info } from "lucide-react";
import { useLanguage } from "../../hooks/useLanguage";
import * as schedulingApi from "../../api/scheduling";
import { normalizeError } from "../../api/client";
import {
  SUPPORTED_DURATIONS,
  addDays,
  calculateEndTimeIso,
  formatDisplayDate,
  formatTimeRange,
  todayDateString,
} from "../../utils/calendarHelpers";
import { Spinner } from "../common/Spinner";
import { ErrorBanner } from "../common/ErrorBanner";
import { StatusPill } from "../common/StatusPill";
import "./AppointmentBookingModal.css";

/**
 * Employer modal to view a worker's available dates & 15-min start slots,
 * pick a duration, review the computed end time, and submit an appointment request.
 *
 * @param {{
 *   worker: { _id: string, fullName?: string },
 *   jobId?: string|null,
 *   onClose: () => void,
 *   onBooked?: (appointment: object) => void
 * }} props
 */
export function AppointmentBookingModal({
  worker,
  jobId = null,
  initialScheduleData = null,
  onClose,
  onBooked,
}) {
  const { language, t } = useLanguage();
  const [scheduleData, setScheduleData] = useState(initialScheduleData);
  const [loading, setLoading] = useState(!initialScheduleData);
  const [loadError, setLoadError] = useState(null);

  const [selectedDate, setSelectedDate] = useState(
    initialScheduleData?.days?.[0]?.date || ""
  );
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [selectedSlotStart, setSelectedSlotStart] = useState("");
  const [purpose, setPurpose] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [createdAppointment, setCreatedAppointment] = useState(null);

  useEffect(() => {
    if (!worker?._id) return;
    let active = true;
    const from = todayDateString("Asia/Kolkata");
    const to = addDays(from, 13);
    setLoading(true);
    setLoadError(null);
    schedulingApi
      .getWorkerAvailability(worker._id, { from, to })
      .then((data) => {
        if (!active) return;
        setScheduleData(data);
        const firstAvailableDay =
          (data?.days || []).find((d) => (d.bookableSlots || []).length > 0) ||
          data?.days?.[0];
        if (firstAvailableDay) {
          setSelectedDate(firstAvailableDay.date);
        }
      })
      .catch((err) => {
        if (!active) return;
        setLoadError(normalizeError(err));
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [worker?._id]);

  const selectedDayObj = useMemo(
    () => (scheduleData?.days || []).find((d) => d.date === selectedDate) || null,
    [scheduleData, selectedDate]
  );

  // Filter start slots on the selected date that can accommodate `durationMinutes`
  const matchingSlots = useMemo(() => {
    if (!selectedDayObj) return [];
    return (selectedDayObj.bookableSlots || []).filter((slot) =>
      (slot.availableDurations || []).includes(Number(durationMinutes))
    );
  }, [selectedDayObj, durationMinutes]);

  useEffect(() => {
    if (matchingSlots.length === 0) {
      setSelectedSlotStart("");
    } else if (!matchingSlots.some((s) => s.startAt === selectedSlotStart)) {
      setSelectedSlotStart(matchingSlots[0].startAt);
    }
  }, [matchingSlots, selectedSlotStart]);

  const computedEndIso = useMemo(
    () => (selectedSlotStart ? calculateEndTimeIso(selectedSlotStart, durationMinutes) : null),
    [selectedSlotStart, durationMinutes]
  );

  const timeZone = scheduleData?.timeZone || "Asia/Kolkata";
  const workerName = worker?.fullName || scheduleData?.workerName || t("scheduling.workerLabel");

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedSlotStart || !purpose.trim() || submitting) return;

    setSubmitting(true);
    setSubmitError(null);
    try {
      const idempotencyKey = `${worker._id}_${selectedSlotStart}_${durationMinutes}`;
      const created = await schedulingApi.createAppointment({
        workerId: worker._id,
        jobId: jobId || null,
        startAt: selectedSlotStart,
        durationMinutes: Number(durationMinutes),
        purpose: purpose.trim(),
        idempotencyKey,
      });
      setCreatedAppointment(created);
      if (onBooked) onBooked(created);
    } catch (err) {
      setSubmitError(normalizeError(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="booking-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={t("scheduling.bookingModalTitle", { workerName })}
    >
      <div className="booking-modal-dialog">
        <div className="booking-modal-header">
          <h2>{t("scheduling.bookingModalTitle", { workerName })}</h2>
          <button
            type="button"
            className="booking-close-btn"
            onClick={onClose}
            aria-label={t("common.close")}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        {loading && <Spinner label={t("common.loading")} />}
        {!loading && loadError && <ErrorBanner error={loadError} />}

        {!loading && !loadError && createdAppointment && (
          <div className="booking-summary-card" role="status">
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <CheckCircle2 size={20} color="#15803d" aria-hidden="true" />
              <strong style={{ color: "#15803d" }}>{t("scheduling.bookingSuccess")}</strong>
              <StatusPill status={createdAppointment.status || "pending"} />
            </div>

            <div className="booking-summary-grid">
              <div>
                <strong>{t("scheduling.summaryWorker")}:</strong> {workerName}
              </div>
              <div>
                <strong>{t("scheduling.summaryDate")}:</strong>{" "}
                {formatDisplayDate(selectedDate, language)}
              </div>
              <div>
                <strong>{t("scheduling.summaryTime")}:</strong>{" "}
                {formatTimeRange(
                  createdAppointment.startAt,
                  createdAppointment.endAt,
                  language,
                  timeZone
                )}
              </div>
              <div>
                <strong>{t("scheduling.summaryDuration")}:</strong>{" "}
                {t("scheduling.durationMinutes", {
                  minutes: createdAppointment.durationMinutes,
                })}
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
              <Link to="/employer-appointments" className="btn btn-primary" onClick={onClose}>
                {t("nav.myAppointments")}
              </Link>
              <button type="button" className="btn btn-secondary" onClick={onClose}>
                {t("common.close")}
              </button>
            </div>
          </div>
        )}

        {!loading && !loadError && !createdAppointment && scheduleData && (
          <form onSubmit={handleSubmit}>
            {submitError && <ErrorBanner error={submitError} />}

            {/* Step 1: Select Date */}
            <div className="booking-step-section">
              <label>{t("scheduling.selectDateLabel")}</label>
              <div className="booking-dates-strip">
                {(scheduleData.days || []).map((day) => {
                  const slotCount = (day.bookableSlots || []).length;
                  const isSelected = day.date === selectedDate;
                  return (
                    <button
                      key={day.date}
                      type="button"
                      disabled={slotCount === 0}
                      className={`booking-date-pill ${isSelected ? "selected" : ""}`}
                      onClick={() => setSelectedDate(day.date)}
                    >
                      <strong style={{ fontSize: "0.84rem" }}>
                        {formatDisplayDate(day.date, language)}
                      </strong>
                      <span style={{ fontSize: "0.75rem", color: slotCount > 0 ? "#15803d" : "#64748b" }}>
                        {day.isBlockedDay
                          ? t("scheduling.blockedDay")
                          : slotCount > 0
                          ? `${slotCount} ${t("scheduling.available")}`
                          : t("scheduling.unavailableDay")}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Step 2: Select Duration */}
            <div className="booking-step-section">
              <label>{t("scheduling.selectDurationLabel")}</label>
              <div className="booking-durations-row">
                {SUPPORTED_DURATIONS.map((mins) => (
                  <button
                    key={mins}
                    type="button"
                    className={`booking-choice-pill ${
                      Number(durationMinutes) === mins ? "selected" : ""
                    }`}
                    onClick={() => setDurationMinutes(mins)}
                  >
                    {t("scheduling.durationMinutes", { minutes: mins })}
                  </button>
                ))}
              </div>
            </div>

            {/* Step 3: Select Available Start Time */}
            <div className="booking-step-section">
              <label>{t("scheduling.selectSlotLabel")}</label>
              {matchingSlots.length === 0 ? (
                <p style={{ color: "#b45309", margin: "4px 0" }}>
                  {t("scheduling.noSlotsOnDate")}
                </p>
              ) : (
                <div className="booking-slots-grid">
                  {matchingSlots.map((slot) => (
                    <button
                      key={slot.startAt}
                      type="button"
                      className={`booking-choice-pill ${
                        selectedSlotStart === slot.startAt ? "selected" : ""
                      }`}
                      onClick={() => setSelectedSlotStart(slot.startAt)}
                    >
                      {slot.localTime}
                    </button>
                  ))}
                </div>
              )}

              {selectedDayObj?.busyIntervals?.length > 0 && (
                <div className="booking-busy-list">
                  {selectedDayObj.busyIntervals.map((b, idx) => (
                    <span key={idx}>
                      <Clock size={12} aria-hidden="true" style={{ verticalAlign: "middle", marginRight: 4 }} />
                      {formatTimeRange(b.startAt, b.endAt, language, timeZone)}:{" "}
                      {b.kind === "pending_reserved"
                        ? t("scheduling.tempReservedLabel")
                        : t("scheduling.bookedBusyLabel")}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Step 4: Purpose */}
            <div className="booking-step-section">
              <label htmlFor="appointment-purpose-input">{t("scheduling.purposeLabel")}</label>
              <textarea
                id="appointment-purpose-input"
                rows={3}
                required
                maxLength={500}
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
                placeholder={t("scheduling.purposePlaceholder")}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: "1px solid #cbd5e1",
                  fontSize: "0.94rem",
                }}
              />
            </div>

            {/* Step 5: Review Summary */}
            {selectedSlotStart && computedEndIso && (
              <div className="booking-summary-card">
                <h4>{t("scheduling.summaryHeading")}</h4>
                <div className="booking-summary-grid">
                  <div>
                    <Calendar size={14} aria-hidden="true" />{" "}
                    <strong>{t("scheduling.summaryDate")}:</strong>{" "}
                    {formatDisplayDate(selectedDate, language)}
                  </div>
                  <div>
                    <Clock size={14} aria-hidden="true" />{" "}
                    <strong>{t("scheduling.summaryTime")}:</strong>{" "}
                    {formatTimeRange(selectedSlotStart, computedEndIso, language, timeZone)}
                  </div>
                  <div>
                    <strong>{t("scheduling.summaryDuration")}:</strong>{" "}
                    {t("scheduling.durationMinutes", { minutes: durationMinutes })}
                  </div>
                </div>
                <p className="booking-reservation-note">
                  <Info size={13} aria-hidden="true" style={{ verticalAlign: "text-bottom", marginRight: 4 }} />
                  {t("scheduling.reservationNotice")}
                </p>
              </div>
            )}

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button type="button" className="btn btn-secondary" onClick={onClose}>
                {t("common.cancel")}
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={submitting || !selectedSlotStart || !purpose.trim()}
              >
                {submitting
                  ? t("scheduling.submittingBooking")
                  : t("scheduling.submitBookingBtn")}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
