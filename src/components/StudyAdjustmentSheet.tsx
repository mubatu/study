import { FormEvent, useState } from "react";
import { MAX_ADJUSTMENT_MINUTES } from "../../shared/adjustments";
import type { StudyAdjustmentOperation } from "../../shared/contracts";

interface StudyAdjustmentSheetProps {
  pending: boolean;
  error: string | null;
  onClose: () => void;
  onAdjust: (
    operation: StudyAdjustmentOperation,
    minutes: number,
  ) => Promise<void>;
}

export function StudyAdjustmentSheet({
  pending,
  error,
  onClose,
  onAdjust,
}: StudyAdjustmentSheetProps) {
  const [minutesText, setMinutesText] = useState("");
  const minutes = Number(minutesText);
  const validMinutes =
    Number.isInteger(minutes) &&
    minutes >= 1 &&
    minutes <= MAX_ADJUSTMENT_MINUTES;

  function submitAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (validMinutes && !pending) {
      void onAdjust("add", minutes);
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
          count and leaderboard time.
        </p>

        <form onSubmit={submitAdd}>
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
              onClick={() => void onAdjust("remove", minutes)}
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
