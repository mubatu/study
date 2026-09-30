import { useState } from "react";
import type {
  LeaderboardPeriod,
  LeaderboardResponse,
  UserProfile,
} from "../../shared/contracts";
import { currentStudyMonth } from "../lib/format";
import { LeaderboardRow } from "./LeaderboardRow";
import { MonthlyActivityDialog } from "./MonthlyActivityDialog";

interface LeaderboardProps {
  data: LeaderboardResponse | null;
  period: LeaderboardPeriod;
  currentUserId: string;
  loading: boolean;
  error: string | null;
  onPeriodChange: (period: LeaderboardPeriod) => void;
  onRetry: () => void;
}

export function Leaderboard({
  data,
  period,
  currentUserId,
  loading,
  error,
  onPeriodChange,
  onRetry,
}: LeaderboardProps) {
  const [activityUser, setActivityUser] = useState<UserProfile | null>(null);
  const visibleData = data?.period === period ? data : null;
  const currentIsOutsideTop =
    visibleData?.currentUser &&
    !visibleData.entries.some((entry) => entry.user.id === currentUserId);

  return (
    <section className="leaderboard" aria-labelledby="leaderboard-title">
      <div className="leaderboard-heading">
        <div>
          <p className="section-label">Community</p>
          <h2 id="leaderboard-title">Leaderboard</h2>
        </div>
        <div className="leaderboard-tabs" role="group" aria-label="Ranking period">
          <button
            type="button"
            className={period === "today" ? "is-active" : ""}
            aria-pressed={period === "today"}
            onClick={() => onPeriodChange("today")}
          >
            Today
          </button>
          <button
            type="button"
            className={period === "month" ? "is-active" : ""}
            aria-pressed={period === "month"}
            onClick={() => onPeriodChange("month")}
          >
            This month
          </button>
        </div>
      </div>

      <div
        className={`leaderboard-card ${loading ? "leaderboard-card--loading" : ""}`}
        aria-busy={loading}
      >
        {error ? (
          <div className="leaderboard-message" role="alert">
            <span>{error}</span>
            <button type="button" onClick={onRetry}>
              Retry
            </button>
          </div>
        ) : null}

        {!visibleData && loading ? (
          <div className="leaderboard-skeleton" aria-label="Loading leaderboard">
            <span />
            <span />
            <span />
          </div>
        ) : null}

        {visibleData && visibleData.entries.length === 0 ? (
          <div className="leaderboard-empty">
            <strong>No study time yet</strong>
            <span>Start a session to take the first place.</span>
          </div>
        ) : null}

        {visibleData?.entries.map((entry) => (
          <LeaderboardRow
            key={entry.user.id}
            entry={entry}
            currentUserId={currentUserId}
            onViewActivity={setActivityUser}
          />
        ))}

        {currentIsOutsideTop && visibleData.currentUser ? (
          <>
            <div className="leaderboard-divider" aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
            <LeaderboardRow
              entry={visibleData.currentUser}
              currentUserId={currentUserId}
              onViewActivity={setActivityUser}
            />
          </>
        ) : null}

        {visibleData && !visibleData.currentUser ? (
          <p className="leaderboard-nudge">
            Study during this period to join the ranking.
          </p>
        ) : null}
      </div>
      {activityUser ? (
        <MonthlyActivityDialog
          key={activityUser.id}
          user={activityUser}
          initialMonth={currentStudyMonth(
            visibleData ? Date.parse(visibleData.serverTime) : Date.now(),
          )}
          onClose={() => setActivityUser(null)}
        />
      ) : null}
    </section>
  );
}
