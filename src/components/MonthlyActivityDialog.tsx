import { useEffect, useRef, useState } from "react";
import type {
  MonthlyActivityResponse,
  UserProfile,
} from "../../shared/contracts";
import { getMonthlyActivity } from "../lib/api";
import { FIRST_STUDY_MONTH, getCalendarCells, WEEKDAYS } from "../lib/calendar";
import {
  formatDuration,
  formatLongDate,
  formatMonth,
  moveMonth,
} from "../lib/format";
import { ChevronLeft, ChevronRight } from "./Icons";

interface MonthlyActivityDialogProps {
  user: UserProfile;
  initialMonth: string;
  onClose: () => void;
}

interface ActivityRequest {
  month: string;
  data: MonthlyActivityResponse | null;
  error: string | null;
}

export function MonthlyActivityDialog({
  user,
  initialMonth,
  onClose,
}: MonthlyActivityDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [month, setMonth] = useState(() =>
    initialMonth < FIRST_STUDY_MONTH ? FIRST_STUDY_MONTH : initialMonth,
  );
  const [retry, setRetry] = useState(0);
  const [request, setRequest] = useState<ActivityRequest | null>(null);
  const visibleRequest = request?.month === month ? request : null;
  const data = visibleRequest?.data;
  const error = visibleRequest?.error;
  const loading = !data && !error;
  const totals = new Map(data?.days.map((day) => [day.date, day.totalSeconds]));
  const monthTotal =
    data?.days.reduce((sum, day) => sum + day.totalSeconds, 0) ?? 0;

  useEffect(() => {
    const dialog = dialogRef.current!;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    dialog.showModal();
    document.body.style.overflow = "hidden";

    return () => {
      dialog.close();
      document.body.style.overflow = previousOverflow;
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) {
        previousFocus.focus({ preventScroll: true });
      }
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setRequest({ month, data: null, error: null });

    void getMonthlyActivity(user.id, month, controller.signal).then(
      (next) => {
        if (!controller.signal.aborted) {
          setRequest({ month, data: next, error: null });
        }
      },
      (requestError: unknown) => {
        if (!controller.signal.aborted) {
          setRequest({
            month,
            data: null,
            error:
              requestError instanceof Error
                ? requestError.message
                : "Could not load study hours.",
          });
        }
      },
    );

    return () => controller.abort();
  }, [user.id, month, retry]);

  return (
    <dialog
      ref={dialogRef}
      className="activity-dialog"
      aria-labelledby="activity-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (
          event.clientX < bounds.left ||
          event.clientX > bounds.right ||
          event.clientY < bounds.top ||
          event.clientY > bounds.bottom
        ) {
          onClose();
        }
      }}
    >
      <div className="adjustment-handle" aria-hidden="true" />
      <div className="adjustment-heading">
        <div>
          <p className="section-label">Monthly study hours</p>
          <h2 id="activity-title">{user.displayName}</h2>
        </div>
        <button
          className="adjustment-close"
          type="button"
          aria-label="Close monthly activity"
          onClick={onClose}
        >
          ×
        </button>
      </div>

      <div className="activity-month-heading">
        <h3>{formatMonth(month)}</h3>
        <div className="month-controls">
          <button
            className="icon-button"
            type="button"
            aria-label="Previous activity month"
            disabled={month <= FIRST_STUDY_MONTH}
            onClick={() => setMonth(moveMonth(month, -1))}
          >
            <ChevronLeft />
          </button>
          <button
            className="icon-button"
            type="button"
            aria-label="Next activity month"
            onClick={() => setMonth(moveMonth(month, 1))}
          >
            <ChevronRight />
          </button>
        </div>
      </div>

      <div className="activity-content" aria-busy={loading} aria-live="polite">
        {loading ? (
          <p className="activity-message" role="status">Loading study hours...</p>
        ) : null}
        {error ? (
          <div className="leaderboard-message" role="alert">
            <span>{error}</span>
            <button type="button" onClick={() => setRetry((value) => value + 1)}>
              Retry
            </button>
          </div>
        ) : null}
        {data ? (
          <>
            <div className="activity-total">
              <span>Month total</span>
              <strong>{formatDuration(monthTotal)}</strong>
            </div>
            <div className="calendar-weekdays" aria-hidden="true">
              {WEEKDAYS.map((weekday) => (
                <span key={weekday}>{weekday}</span>
              ))}
            </div>
            <div
              className="calendar-grid"
              role="list"
              aria-label="Daily study hours"
            >
              {getCalendarCells(month).map((day, index) => {
                if (day === null) {
                  return (
                    <span
                      className="calendar-spacer"
                      key={`spacer-${index}`}
                      aria-hidden="true"
                    />
                  );
                }
                const date = `${month}-${day.toString().padStart(2, "0")}`;
                const seconds = totals.get(date) ?? 0;
                return (
                  <div
                    className={`calendar-day activity-day ${seconds > 0 ? "calendar-day--studied" : ""}`}
                    key={date}
                    role="listitem"
                    aria-label={`${formatLongDate(date)}, ${formatDuration(seconds)}`}
                  >
                    <span className="calendar-date">{day}</span>
                    <span className="calendar-total">{formatDuration(seconds)}</span>
                  </div>
                );
              })}
            </div>
            {monthTotal === 0 ? (
              <p className="activity-message">No study hours this month.</p>
            ) : null}
          </>
        ) : null}
      </div>
      <p className="activity-footnote">06:00 to 05:59, Istanbul time</p>
    </dialog>
  );
}
