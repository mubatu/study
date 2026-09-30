import { useEffect, useId, useRef, type PointerEvent } from "react";
import type { LeaderboardEntry, UserProfile } from "../../shared/contracts";
import { formatDuration } from "../lib/format";

interface LeaderboardRowProps {
  entry: LeaderboardEntry;
  currentUserId: string;
  onViewActivity: (user: UserProfile) => void;
}

const LONG_PRESS_MS = 700;
const MOVE_TOLERANCE_PX = 10;

export function LeaderboardRow({
  entry,
  currentUserId,
  onViewActivity,
}: LeaderboardRowProps) {
  const rowId = useId();
  const press = useRef<{
    timer: number;
    pointerId: number;
    x: number;
    y: number;
  } | null>(null);
  const isCurrent = entry.user.id === currentUserId;

  function cancelPress() {
    if (press.current) {
      window.clearTimeout(press.current.timer);
      press.current = null;
    }
  }

  useEffect(() => {
    window.addEventListener("scroll", cancelPress, true);
    window.addEventListener("blur", cancelPress);
    return () => {
      cancelPress();
      window.removeEventListener("scroll", cancelPress, true);
      window.removeEventListener("blur", cancelPress);
    };
  }, []);

  function startPress(event: PointerEvent<HTMLButtonElement>) {
    cancelPress();
    if (event.button > 0 || event.isPrimary === false) return;
    const target = event.currentTarget;
    press.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      timer: window.setTimeout(() => {
        press.current = null;
        target.focus({ preventScroll: true });
        onViewActivity(entry.user);
      }, LONG_PRESS_MS),
    };
  }

  const content = (
    <>
      <span
        id={`${rowId}-rank`}
        className={`leaderboard-rank leaderboard-rank--${entry.rank}`}
        aria-label={`Rank ${entry.rank}`}
      >
        {entry.rank}
      </span>
      <span className="leaderboard-person">
        <strong>{entry.user.displayName}</strong>
        {entry.isStudying ? (
          <span id={`${rowId}-status`} className="leaderboard-active">
            <i aria-hidden="true" />
            Studying now
          </span>
        ) : isCurrent ? (
          <span>You</span>
        ) : null}
      </span>
      <strong id={`${rowId}-time`} className="leaderboard-time">
        {formatDuration(entry.totalSeconds)}
      </strong>
    </>
  );

  if (isCurrent) {
    return (
      <div className="leaderboard-row leaderboard-row--current">{content}</div>
    );
  }

  return (
    <button
      className="leaderboard-row leaderboard-row--interactive"
      type="button"
      aria-label={`View ${entry.user.displayName}'s monthly study hours`}
      aria-describedby={`${rowId}-rank ${rowId}-time${entry.isStudying ? ` ${rowId}-status` : ""}`}
      aria-haspopup="dialog"
      title="Press and hold to view monthly study hours"
      onPointerDown={startPress}
      onPointerUp={cancelPress}
      onPointerCancel={cancelPress}
      onPointerLeave={cancelPress}
      onPointerMove={(event) => {
        if (
          press.current &&
          event.pointerId === press.current.pointerId &&
          Math.hypot(
            event.clientX - press.current.x,
            event.clientY - press.current.y,
          ) > MOVE_TOLERANCE_PX
        ) {
          cancelPress();
        }
      }}
      onBlur={cancelPress}
      onContextMenu={(event) => event.preventDefault()}
      onClick={(event) => {
        // Keyboard and assistive-technology activation do not require a hold.
        if (event.detail === 0) onViewActivity(entry.user);
      }}
    >
      {content}
    </button>
  );
}
