import { FormEvent, useState } from "react";
import { MAX_ADJUSTMENT_MINUTES } from "../../shared/adjustments";
import { FIRST_STUDY_DATE } from "../../shared/studyTime";
import type {
  AdminUserOption,
  StudyAdjustmentOperation,
} from "../../shared/contracts";

interface StudyAdjustmentSheetProps {
  currentUserId: string;
  // Current study day (YYYY-MM-DD); the latest date an adjustment may target.
  today: string;
  // Profiles the admin can adjust; undefined while the list is loading.
  adminTargets?: AdminUserOption[];
  pending: boolean;
  error: string | null;
  onClose: () => void;
  onAdjust: (
    operation: StudyAdjustmentOperation,
    minutes: number,
    targetUserId: string,
    date: string,
  ) => Promise<void>;
}

export function StudyAdjustmentSheet({
  currentUserId,
  today,
  adminTargets,
  pending,
  error,
  onClose,
  onAdjust,
}: StudyAdjustmentSheetProps) {
  const [minutesText, setMinutesText] = useState("");
  const [targetUserId, setTargetUserId] = useState(currentUserId);
  const [date, setDate] = useState(today);
  const minutes = Number(minutesText);
  const validMinutes =
    Number.isInteger(minutes) &&
    minutes >= 1 &&
    minutes <= MAX_ADJUSTMENT_MINUTES;
  // Date inputs give "" when cleared; YYYY-MM-DD strings compare in date order.
  const validDate = date >= FIRST_STUDY_DATE && date <= today;
  const canSubmit = validMinutes && validDate && !pending;

  function submitAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (canSubmit) {
      void onAdjust("add", minutes, targetUserId, date);
    }
  }

  return (
    <div className="adjustment-backdrop" onClick={onClose}>
      <section
        className="adjustment-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="adjustment-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="adjustment-handle" aria-hidden="true" />
        <div className="adjustment-heading">
          <div>
            <p className="section-label">Hidden controls</p>
            <h2 id="adjustment-title">Adjust study time</h2>
          </div>
          <button
            className="adjustment-close"
            type="button"
            aria-label="Close adjustments"
            disabled={pending}
            onClick={onClose}
          >
            ×
          </button>
        </div>

        <p className="adjustment-description">
          Pick a profile and a study day, then enter minutes to add or remove.
          This also changes that day&apos;s session count and leaderboard time.
        </p>

        <form onSubmit={submitAdd}>
          <label htmlFor="adjustment-profile">Profile</label>
          <select
            id="adjustment-profile"
            value={targetUserId}
            disabled={pending || !adminTargets}
            onChange={(event) => setTargetUserId(event.target.value)}
          >
            {adminTargets ? (
              adminTargets.map((target) => (
                <option key={target.id} value={target.id}>
                  {target.email
                    ? `${target.displayName} · ${target.email}`
                    : target.displayName}
                </option>
              ))
            ) : (
              <option value={currentUserId}>Loading profiles...</option>
            )}
          </select>

          <label htmlFor="adjustment-date">Date</label>
          <input
            id="adjustment-date"
            type="date"
            min={FIRST_STUDY_DATE}
            max={today}
            value={date}
            disabled={pending}
            required
            onChange={(event) => setDate(event.target.value)}
          />

          <label htmlFor="adjustment-minutes">Minutes</label>
          <input
            id="adjustment-minutes"
            type="number"
            inputMode="numeric"
            min="1"
            max={MAX_ADJUSTMENT_MINUTES}
            step="1"
            value={minutesText}
            disabled={pending}
            placeholder="30"
            onChange={(event) => setMinutesText(event.target.value)}
          />

          {error ? (
            <p className="adjustment-error" role="alert">
              {error}
            </p>
          ) : null}

          <div className="adjustment-actions">
            <button
              className="adjustment-remove"
              type="button"
              disabled={!canSubmit}
              onClick={() => void onAdjust("remove", minutes, targetUserId, date)}
            >
              {pending ? "Updating..." : "Remove"}
            </button>
            <button
              className="adjustment-add"
              type="submit"
              disabled={!canSubmit}
            >
              {pending ? "Updating..." : "Add"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
