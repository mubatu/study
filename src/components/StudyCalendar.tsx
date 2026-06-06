import type { DailyTotal } from "../../shared/contracts";
import { ChevronLeft, ChevronRight } from "./Icons";
import {
  formatDuration,
  formatLongDate,
  formatMonth,
  moveMonth,
} from "../lib/format";

interface StudyCalendarProps {
  month: string;
  days: DailyTotal[];
  selectedDate: string;
  currentDate: string;
  loading: boolean;
  onMonthChange: (month: string) => void;
  onSelectDate: (date: string) => void;
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function getCalendarCells(month: string): Array<number | null> {
  const [year, monthNumber] = month.split("-").map(Number);
  const firstDay = new Date(Date.UTC(year, monthNumber - 1, 1));
  const daysInMonth = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const mondayOffset = (firstDay.getUTCDay() + 6) % 7;

  return [
    ...Array.from<null>({ length: mondayOffset }).fill(null),
    ...Array.from({ length: daysInMonth }, (_, index) => index + 1),
  ];
}

export function StudyCalendar({
  month,
  days,
  selectedDate,
  currentDate,
  loading,
  onMonthChange,
  onSelectDate,
}: StudyCalendarProps) {
  const totals = new Map(days.map((day) => [day.date, day]));
  const selected = totals.get(selectedDate) ?? {
    date: selectedDate,
    totalSeconds: 0,
    sessionCount: 0,
  };

  return (
    <section className="history" aria-labelledby="history-title">
      <div className="history-heading">
        <div>
          <p className="section-label">Study history</p>
          <h2 id="history-title">{formatMonth(month)}</h2>
        </div>
        <div className="month-controls">
          <button
            className="icon-button"
            type="button"
            aria-label="Previous month"
            onClick={() => onMonthChange(moveMonth(month, -1))}
          >
            <ChevronLeft />
          </button>
          <button
            className="icon-button"
            type="button"
            aria-label="Next month"
            onClick={() => onMonthChange(moveMonth(month, 1))}
          >
            <ChevronRight />
          </button>
        </div>
      </div>

      <div className={`calendar ${loading ? "calendar--loading" : ""}`}>
        <div className="calendar-weekdays" aria-hidden="true">
          {WEEKDAYS.map((weekday) => (
            <span key={weekday}>{weekday}</span>
          ))}
        </div>
        <div className="calendar-grid">
          {getCalendarCells(month).map((day, index) => {
            if (day === null) {
              return <span className="calendar-spacer" key={`spacer-${index}`} />;
            }

            const date = `${month}-${day.toString().padStart(2, "0")}`;
            const total = totals.get(date);
            const isSelected = date === selectedDate;
            const isToday = date === currentDate;

            return (
              <button
                className={[
                  "calendar-day",
                  isSelected ? "calendar-day--selected" : "",
                  isToday ? "calendar-day--today" : "",
                  total?.totalSeconds ? "calendar-day--studied" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                type="button"
                key={date}
                aria-pressed={isSelected}
                aria-label={`${formatLongDate(date)}, ${
                  total ? formatDuration(total.totalSeconds) : "no study time"
                }`}
                onClick={() => onSelectDate(date)}
              >
                <span className="calendar-date">{day}</span>
                <span className="calendar-total">
                  {total?.totalSeconds ? formatDuration(total.totalSeconds) : ""}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="day-summary" aria-live="polite">
        <div>
          <p>{formatLongDate(selectedDate)}</p>
          <span>
            {selected.sessionCount === 0
              ? "No study sessions"
              : `${selected.sessionCount} ${
                  selected.sessionCount === 1 ? "session" : "sessions"
                }`}
          </span>
        </div>
        <strong>{formatDuration(selected.totalSeconds)}</strong>
      </div>
    </section>
  );
}
