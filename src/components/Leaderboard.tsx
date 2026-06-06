import type {
  LeaderboardPeriod,
  LeaderboardResponse,
} from "../../shared/contracts";
import { formatDuration } from "../lib/format";

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
          <div
            className={`leaderboard-row ${
              entry.user.id === currentUserId ? "leaderboard-row--current" : ""
            }`}
            key={entry.user.id}
          >
            <span className="leaderboard-rank" aria-label={`Rank ${entry.rank}`}>
              {entry.rank}
            </span>
            <div className="leaderboard-person">
              <strong>{entry.user.displayName}</strong>
              {entry.isStudying ? (
                <span className="leaderboard-active">
                  <i aria-hidden="true" />
                  Studying now
                </span>
              ) : entry.user.id === currentUserId ? (
                <span>You</span>
              ) : null}
            </div>
            <strong className="leaderboard-time">
              {formatDuration(entry.totalSeconds)}
            </strong>
          </div>
        ))}

        {currentIsOutsideTop && visibleData.currentUser ? (
          <>
            <div className="leaderboard-divider" aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
            <div className="leaderboard-row leaderboard-row--current">
              <span
                className="leaderboard-rank"
                aria-label={`Rank ${visibleData.currentUser.rank}`}
              >
                {visibleData.currentUser.rank}
              </span>
              <div className="leaderboard-person">
                <strong>{visibleData.currentUser.user.displayName}</strong>
                <span>You</span>
              </div>
              <strong className="leaderboard-time">
                {formatDuration(visibleData.currentUser.totalSeconds)}
              </strong>
            </div>
          </>
        ) : null}

        {visibleData && !visibleData.currentUser ? (
          <p className="leaderboard-nudge">
            Study during this period to join the ranking.
          </p>
        ) : null}
      </div>
    </section>
  );
}
