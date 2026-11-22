import type { ReactNode } from "react";
import type { StudyState } from "../../shared/contracts";
import { formatClock, formatDuration } from "../lib/format";

interface TimerPanelProps {
  state: StudyState;
  activeSeconds: number;
  todaySeconds: number;
  pendingState: StudyState | null;
  onStateChange: (nextState: StudyState) => void;
}

const STATUS_TEXT: Record<StudyState, string> = {
  studying: "Studying",
  paused: "Paused",
  resting: "Resting",
};

const TIMER_LABEL: Record<StudyState, string> = {
  studying: "Current session · 3h max without a break",
  paused: "Session paused",
  resting: "Ready when you are",
};

const PlayIcon = (
  <svg viewBox="0 0 24 24" fill="none">
    <path d="m9 7 8 5-8 5V7Z" fill="currentColor" />
  </svg>
);

const PauseIcon = (
  <svg viewBox="0 0 24 24" fill="none">
    <path
      d="M8.5 7.5v9m7-9v9"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
    />
  </svg>
);

const StopIcon = (
  <svg viewBox="0 0 24 24" fill="none">
    <rect x="7.5" y="7.5" width="9" height="9" rx="2" fill="currentColor" />
  </svg>
);

interface TimerButtonProps {
  label: string;
  pendingLabel: string;
  icon: ReactNode;
  variant: "study" | "pause" | "stop";
  targetState: StudyState;
  pendingState: StudyState | null;
  onStateChange: (nextState: StudyState) => void;
}

function TimerButton({
  label,
  pendingLabel,
  icon,
  variant,
  targetState,
  pendingState,
  onStateChange,
}: TimerButtonProps) {
  return (
    <button
      className={`state-button state-button--${variant}`}
      type="button"
      disabled={pendingState !== null}
      onClick={() => onStateChange(targetState)}
    >
      <span>{pendingState === targetState ? pendingLabel : label}</span>
      <span className="state-button-icon" aria-hidden="true">
        {icon}
      </span>
    </button>
  );
}

export function TimerPanel({
  state,
  activeSeconds,
  todaySeconds,
  pendingState,
  onStateChange,
}: TimerPanelProps) {
  const buttonProps = { pendingState, onStateChange };

  return (
    <main className="timer-panel">
      <div className="status-line">
        <span className={`status-dot status-dot--${state}`} />
        <span>{STATUS_TEXT[state]}</span>
      </div>

      <div className="timer-block">
        <p className="timer-label">{TIMER_LABEL[state]}</p>
        <time
          className={`timer-value ${state === "paused" ? "timer-value--paused" : ""}`}
          aria-label={`${activeSeconds} seconds`}
        >
          {formatClock(state === "resting" ? 0 : activeSeconds)}
        </time>
      </div>

      <div className="today-total">
        <span>Today</span>
        <strong>{formatDuration(todaySeconds)}</strong>
        <small>06:00 to 05:59, Istanbul time</small>
      </div>

      {state === "resting" ? (
        <div className="timer-controls">
          <TimerButton
            {...buttonProps}
            label="Start studying"
            pendingLabel="Starting..."
            icon={PlayIcon}
            variant="study"
            targetState="studying"
          />
        </div>
      ) : (
        <div
          className="timer-controls timer-controls--split"
          role="group"
          aria-label="Session controls"
        >
          {state === "studying" ? (
            <TimerButton
              {...buttonProps}
              label="Pause"
              pendingLabel="Pausing..."
              icon={PauseIcon}
              variant="pause"
              targetState="paused"
            />
          ) : (
            <TimerButton
              {...buttonProps}
              label="Resume"
              pendingLabel="Resuming..."
              icon={PlayIcon}
              variant="study"
              targetState="studying"
            />
          )}
          <TimerButton
            {...buttonProps}
            label="Stop"
            pendingLabel="Stopping..."
            icon={StopIcon}
            variant="stop"
            targetState="resting"
          />
        </div>
      )}
    </main>
  );
}
