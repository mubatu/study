import type { LeaderboardEntry } from "./contracts";

export interface LeaderboardSessionRow {
  user_id: string;
  display_name: string;
  started_at_ms: number;
  ended_at_ms: number | null;
}

interface RankedTotal {
  userId: string;
  displayName: string;
  totalSeconds: number;
  isStudying: boolean;
}

export function rankLeaderboardSessions(
  rows: LeaderboardSessionRow[],
  rangeStartMs: number,
  rangeEndMs: number,
): LeaderboardEntry[] {
  const totals = new Map<
    string,
    { displayName: string; totalMs: number; isStudying: boolean }
  >();

  for (const row of rows) {
    const overlapStart = Math.max(row.started_at_ms, rangeStartMs);
    const overlapEnd = Math.min(row.ended_at_ms ?? rangeEndMs, rangeEndMs);

    if (overlapEnd <= overlapStart) continue;

    const current = totals.get(row.user_id) ?? {
      displayName: row.display_name,
      totalMs: 0,
      isStudying: false,
    };
    current.totalMs += overlapEnd - overlapStart;
    current.isStudying ||= row.ended_at_ms === null;
    totals.set(row.user_id, current);
  }

  const sorted: RankedTotal[] = [...totals.entries()]
    .map(([userId, total]) => ({
      userId,
      displayName: total.displayName,
      totalSeconds: Math.round(total.totalMs / 1000),
      isStudying: total.isStudying,
    }))
    .filter((entry) => entry.totalSeconds > 0)
    .sort(
      (a, b) =>
        b.totalSeconds - a.totalSeconds ||
        a.displayName.localeCompare(b.displayName),
    );

  let previousSeconds = -1;
  let previousRank = 0;

  return sorted.map((entry, index) => {
    const rank =
      entry.totalSeconds === previousSeconds ? previousRank : index + 1;
    previousSeconds = entry.totalSeconds;
    previousRank = rank;

    return {
      rank,
      user: {
        id: entry.userId,
        displayName: entry.displayName,
      },
      totalSeconds: entry.totalSeconds,
      isStudying: entry.isStudying,
    };
  });
}
