import type { StudyState } from "../../shared/contracts";
import { formatClock, formatDuration } from "../lib/format";

interface TimerPanelProps {
  state: StudyState;
  activeSeconds: number;
  todaySeconds: number;
  pending: boolean;
  onToggle: () => void;
}

export function TimerPanel({
  state,
  activeSeconds,
  todaySeconds,
  pending,
  onToggle,
}: TimerPanelProps) {
  const studying = state === "studying";

  return (
    <main className="timer-panel">
      <div className="status-line">
        <span className={`status-dot ${studying ? "status-dot--active" : ""}`} />
        <span>{studying ? "Studying" : "Resting"}</span>
      </div>

      <div className="timer-block">
        <p className="timer-label">
          {studying ? "Current session" : "Ready when you are"}
        </p>
        <time className="timer-value" aria-label={`${activeSeconds} seconds`}>
          {formatClock(studying ? activeSeconds : 0)}
        </time>
      </div>

      <div className="today-total">
        <span>Today</span>
        <strong>{formatDuration(todaySeconds)}</strong>
        <small>07:00 to 06:59, Istanbul time</small>
      </div>

      <button
        className={`state-button ${studying ? "state-button--rest" : ""}`}
        type="button"
        disabled={pending}
        onClick={onToggle}
      >
        <span>{pending ? "Updating..." : studying ? "Start resting" : "Start studying"}</span>
        <span className="state-button-icon" aria-hidden="true">
          {studying ? (
            <svg viewBox="0 0 24 24" fill="none">
              <path
                d="M8.5 7.5v9m7-9v9"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
              />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none">
              <path d="m9 7 8 5-8 5V7Z" fill="currentColor" />
            </svg>
          )}
        </span>
      </button>
    </main>
  );
}
