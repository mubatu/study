import { FormEvent, useState } from "react";
import { MAX_ADJUSTMENT_MINUTES } from "../../shared/adjustments";
import type {
  AdminUserOption,
  StudyAdjustmentOperation,
} from "../../shared/contracts";

interface StudyAdjustmentSheetProps {
  currentUserId: string;
  // Profiles the admin can adjust; undefined while the list is loading.
  adminTargets?: AdminUserOption[];
  pending: boolean;
  error: string | null;
  onClose: () => void;
  onAdjust: (
    operation: StudyAdjustmentOperation,
    minutes: number,
    targetUserId: string,
  ) => Promise<void>;
}

export function StudyAdjustmentSheet({
  currentUserId,
  adminTargets,
  pending,
  error,
  onClose,
  onAdjust,
}: StudyAdjustmentSheetProps) {
  const [minutesText, setMinutesText] = useState("");
  const [targetUserId, setTargetUserId] = useState(currentUserId);
  const minutes = Number(minutesText);
  const validMinutes =
    Number.isInteger(minutes) &&
    minutes >= 1 &&
    minutes <= MAX_ADJUSTMENT_MINUTES;

  function submitAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (validMinutes && !pending) {
      void onAdjust("add", minutes, targetUserId);
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
            <h2 id="adjustment-title">Adjust today</h2>
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
          Enter minutes to add or remove. This also changes today&apos;s session
          count and leaderboard time for the selected profile.
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
              disabled={!validMinutes || pending}
              onClick={() => void onAdjust("remove", minutes, targetUserId)}
            >
              {pending ? "Updating..." : "Remove"}
            </button>
            <button
              className="adjustment-add"
              type="submit"
              disabled={!validMinutes || pending}
            >
              {pending ? "Updating..." : "Add"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
