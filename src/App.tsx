import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  AdminUserOption,
  DashboardResponse,
  LeaderboardPeriod,
  LeaderboardResponse,
  StudyAdjustmentOperation,
  UserProfile,
} from "../shared/contracts";
import {
  MAX_SESSION_DURATION_MS,
  studyDayKeyForInstant,
  studyDayBounds,
} from "../shared/studyTime";
import { Leaderboard } from "./components/Leaderboard";
import { StudyCalendar } from "./components/StudyCalendar";
import { StudyAdjustmentSheet } from "./components/StudyAdjustmentSheet";
import { TimerPanel } from "./components/TimerPanel";
import { LoginScreen } from "./components/LoginScreen";
import { BookMark } from "./components/Icons";
import {
  adjustStudyTime,
  getAdminUsers,
  getDashboard,
  getLeaderboard,
  getSession,
  isUnauthorized,
  saveDailyNote,
  setStudyState,
  signOut,
} from "./lib/api";
import { currentStudyMonth } from "./lib/format";
import { disableGoogleAutoSelect } from "./lib/googleIdentity";

const ADJUSTMENT_LONG_PRESS_MS = 700;

function App() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminTargets, setAdminTargets] = useState<AdminUserOption[]>();
  const [sessionChecked, setSessionChecked] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [googleClientId, setGoogleClientId] = useState<string | null>(null);
  const [month, setMonth] = useState(() => currentStudyMonth());
  const [selectedDate, setSelectedDate] = useState(() =>
    studyDayKeyForInstant(Date.now()),
  );
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [leaderboardPeriod, setLeaderboardPeriod] =
    useState<LeaderboardPeriod>("today");
  const [leaderboard, setLeaderboard] =
    useState<LeaderboardResponse | null>(null);
  const [clockMs, setClockMs] = useState(Date.now());
  const [snapshotReceivedAt, setSnapshotReceivedAt] = useState(Date.now());
  const [loading, setLoading] = useState(false);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
  const [pending, setPending] = useState(false);
  const [notePending, setNotePending] = useState(false);
  const [adjustmentOpen, setAdjustmentOpen] = useState(false);
  const [adjustmentPending, setAdjustmentPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [noteError, setNoteError] = useState<string | null>(null);
  const [adjustmentError, setAdjustmentError] = useState<string | null>(null);
  const [leaderboardError, setLeaderboardError] = useState<string | null>(null);
  const adjustmentPressTimer = useRef<number | null>(null);

  const clearSignedInState = useCallback(() => {
    setProfile(null);
    setIsAdmin(false);
    setAdminTargets(undefined);
    setDashboard(null);
    setLeaderboard(null);
    setError(null);
    setNoteError(null);
    setAdjustmentOpen(false);
    setAdjustmentError(null);
    setLeaderboardError(null);
  }, []);

  const loadSession = useCallback(async () => {
    setSessionError(null);
    try {
      const session = await getSession();
      setGoogleClientId(session.googleClientId);
      setProfile(session.user);
      setIsAdmin(session.isAdmin);
      setSessionChecked(true);
    } catch (requestError) {
      setSessionError(
        requestError instanceof Error
          ? requestError.message
          : "Could not reach Study.",
      );
    }
  }, []);

  useEffect(() => {
    void loadSession();
  }, [loadSession]);

  const applyDashboard = useCallback((next: DashboardResponse) => {
    setDashboard(next);
    const receivedAt = Date.now();
    setSnapshotReceivedAt(receivedAt);
    setClockMs(receivedAt);
    setError(null);
  }, []);

  const refresh = useCallback(
    async (quiet = false) => {
      if (!profile) return;
      if (!quiet) setLoading(true);

      try {
        applyDashboard(await getDashboard(month));
      } catch (requestError) {
        if (isUnauthorized(requestError)) {
          clearSignedInState();
          return;
        }
        setError(
          requestError instanceof Error
            ? requestError.message
            : "Could not refresh your study time.",
        );
      } finally {
        if (!quiet) setLoading(false);
      }
    },
    [applyDashboard, clearSignedInState, month, profile],
  );

  const refreshLeaderboard = useCallback(
    async (quiet = false) => {
      if (!profile) return;
      if (!quiet) setLeaderboardLoading(true);

      try {
        setLeaderboard(await getLeaderboard(leaderboardPeriod));
        setLeaderboardError(null);
      } catch (requestError) {
        if (isUnauthorized(requestError)) {
          clearSignedInState();
          return;
        }
        setLeaderboardError(
          requestError instanceof Error
            ? requestError.message
            : "Could not refresh the leaderboard.",
        );
      } finally {
        if (!quiet) setLeaderboardLoading(false);
      }
    },
    [clearSignedInState, leaderboardPeriod, profile],
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    void refreshLeaderboard();
  }, [refreshLeaderboard]);

  useEffect(() => {
    if (dashboard?.state !== "studying") return;

    const interval = window.setInterval(() => setClockMs(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [dashboard?.state]);

  useEffect(() => {
    if (!profile) return;

    const refreshAll = () => {
      void refresh(true);
      void refreshLeaderboard(true);
    };
    const onFocus = () => refreshAll();
    const onOnline = () => refreshAll();
    window.addEventListener("focus", onFocus);
    window.addEventListener("online", onOnline);

    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("online", onOnline);
    };
  }, [profile, refresh, refreshLeaderboard]);

  useEffect(() => {
    if (dashboard?.state !== "studying") return;

    const interval = window.setInterval(
      () => void refreshLeaderboard(true),
      60_000,
    );
    return () => window.clearInterval(interval);
  }, [dashboard?.state, refreshLeaderboard]);

  useEffect(() => {
    if (!profile) return;

    const now = Date.now();
    const currentKey = studyDayKeyForInstant(now);
    const nextBoundary = studyDayBounds(currentKey).endMs;
    const timeout = window.setTimeout(() => {
      const nextKey = studyDayKeyForInstant(Date.now());
      setSelectedDate(nextKey);
      setMonth(nextKey.slice(0, 7));
      void refresh(true);
      void refreshLeaderboard(true);
    }, Math.max(1_000, nextBoundary - now + 1_000));

    return () => window.clearTimeout(timeout);
  }, [profile, refresh, refreshLeaderboard, dashboard?.serverTime]);

  useEffect(
    () => () => {
      if (adjustmentPressTimer.current !== null) {
        window.clearTimeout(adjustmentPressTimer.current);
      }
    },
    [],
  );

  const liveValues = useMemo(() => {
    if (!dashboard) return { activeSeconds: 0, todaySeconds: 0 };

    const serverMs = new Date(dashboard.serverTime).getTime();
    const elapsedSinceSnapshotMs = Math.max(0, clockMs - snapshotReceivedAt);
    const activeSinceMs = dashboard.activeSince
      ? new Date(dashboard.activeSince).getTime()
      : null;
    const sessionAgeAtSnapshotMs =
      activeSinceMs === null ? 0 : Math.max(0, serverMs - activeSinceMs);
    const activeSeconds =
      activeSinceMs === null
        ? 0
        : Math.floor(
            Math.min(
              sessionAgeAtSnapshotMs + elapsedSinceSnapshotMs,
              MAX_SESSION_DURATION_MS,
            ) / 1000,
          );
    const creditedSinceSnapshotSeconds =
      dashboard.state === "studying" && activeSinceMs !== null
        ? Math.floor(
            Math.min(
              elapsedSinceSnapshotMs,
              Math.max(0, MAX_SESSION_DURATION_MS - sessionAgeAtSnapshotMs),
            ) / 1000,
          )
        : 0;

    return {
      activeSeconds,
      todaySeconds:
        dashboard.currentDay.totalSeconds +
        creditedSinceSnapshotSeconds,
    };
  }, [clockMs, dashboard, snapshotReceivedAt]);

  async function handleToggle() {
    if (!profile || !dashboard) return;
    setPending(true);
    setError(null);

    try {
      await setStudyState(
        dashboard.state === "studying" ? "resting" : "studying",
      );
      const [dashboardResult, leaderboardResult] = await Promise.allSettled([
        getDashboard(month),
        getLeaderboard(leaderboardPeriod),
      ]);

      if (dashboardResult.status === "rejected") {
        throw dashboardResult.reason;
      }

      applyDashboard(dashboardResult.value);

      if (leaderboardResult.status === "fulfilled") {
        setLeaderboard(leaderboardResult.value);
        setLeaderboardError(null);
      } else {
        setLeaderboardError("Could not refresh the leaderboard.");
      }
    } catch (requestError) {
      if (isUnauthorized(requestError)) {
        clearSignedInState();
        return;
      }
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Could not update your state.",
      );
    } finally {
      setPending(false);
    }
  }

  async function handleSaveNote(date: string, text: string) {
    if (!profile) return;
    setNotePending(true);
    setNoteError(null);

    try {
      const savedNote = await saveDailyNote(date, text);
      setDashboard((current) => {
        if (!current || current.month !== savedNote.date.slice(0, 7)) {
          return current;
        }

        const otherNotes = current.notes.filter(
          (note) => note.date !== savedNote.date,
        );
        return {
          ...current,
          notes: savedNote.text
            ? [...otherNotes, savedNote].sort((a, b) =>
                a.date.localeCompare(b.date),
              )
            : otherNotes,
        };
      });
    } catch (requestError) {
      setNoteError(
        requestError instanceof Error
          ? requestError.message
          : "Could not save your note.",
      );
    } finally {
      setNotePending(false);
    }
  }

  function cancelAdjustmentPress() {
    if (adjustmentPressTimer.current !== null) {
      window.clearTimeout(adjustmentPressTimer.current);
      adjustmentPressTimer.current = null;
    }
  }

  // The hidden controls change leaderboard totals, so they only open for admins.
  function startAdjustmentPress() {
    cancelAdjustmentPress();
    if (!isAdmin) return;
    adjustmentPressTimer.current = window.setTimeout(() => {
      setAdjustmentError(null);
      setAdjustmentOpen(true);
      adjustmentPressTimer.current = null;
    }, ADJUSTMENT_LONG_PRESS_MS);
  }

  useEffect(() => {
    if (!adjustmentOpen || !profile) return;

    let cancelled = false;
    setAdminTargets(undefined);
    getAdminUsers()
      .then(({ users }) => {
        if (cancelled) return;
        setAdminTargets(
          users.some((user) => user.id === profile.id)
            ? users
            : [{ ...profile, email: "" }, ...users],
        );
      })
      .catch((requestError) => {
        if (cancelled) return;
        setAdminTargets([{ ...profile, email: "" }]);
        setAdjustmentError(
          requestError instanceof Error
            ? requestError.message
            : "Could not load profiles.",
        );
      });

    return () => {
      cancelled = true;
    };
  }, [adjustmentOpen, profile]);

  async function handleAdjustment(
    operation: StudyAdjustmentOperation,
    minutes: number,
    targetUserId: string,
  ) {
    if (!profile) return;
    setAdjustmentPending(true);
    setAdjustmentError(null);

    try {
      await adjustStudyTime(
        minutes,
        operation,
        targetUserId === profile.id ? undefined : targetUserId,
      );
      const [dashboardResult, leaderboardResult] = await Promise.allSettled([
        getDashboard(month),
        getLeaderboard(leaderboardPeriod),
      ]);

      if (dashboardResult.status === "rejected") {
        throw dashboardResult.reason;
      }

      applyDashboard(dashboardResult.value);
      if (leaderboardResult.status === "fulfilled") {
        setLeaderboard(leaderboardResult.value);
        setLeaderboardError(null);
      } else {
        setLeaderboardError("Could not refresh the leaderboard.");
      }
      setAdjustmentOpen(false);
    } catch (requestError) {
      setAdjustmentError(
        requestError instanceof Error
          ? requestError.message
          : "Could not adjust today's study time.",
      );
    } finally {
      setAdjustmentPending(false);
    }
  }

  async function handleSignOut() {
    try {
      await signOut();
    } catch {
      // The session cookie expires on its own; still leave the signed-in view.
    }
    disableGoogleAutoSelect();
    clearSignedInState();
  }

  if (!sessionChecked) {
    return (
      <div className="app-shell app-shell--login">
        {sessionError ? (
          <div className="loading-state" role="alert">
            <p>{sessionError}</p>
            <button
              className="text-button"
              type="button"
              onClick={() => void loadSession()}
            >
              Retry
            </button>
          </div>
        ) : (
          <div className="loading-state" aria-live="polite">
            <span />
          </div>
        )}
      </div>
    );
  }

  if (!profile) {
    return (
      <LoginScreen
        googleClientId={googleClientId}
        onSignedIn={(user, admin) => {
          setProfile(user);
          setIsAdmin(admin);
        }}
      />
    );
  }

  const currentDate =
    dashboard?.currentDay.date ?? studyDayKeyForInstant(Date.now());
  const visibleSelectedDate = selectedDate.startsWith(month)
    ? selectedDate
    : `${month}-01`;

  return (
    <div className="app-shell">
      <header className="profile-header">
        <div className="profile-identity">
          <BookMark />
          <div>
            <span>Studying as</span>
            <strong>{profile.displayName}</strong>
          </div>
        </div>
        <button className="text-button" type="button" onClick={() => void handleSignOut()}>
          Sign out
        </button>
      </header>

      {error ? (
        <div className="error-banner" role="alert">
          <span>{error}</span>
          <button type="button" onClick={() => void refresh()}>
            Retry
          </button>
        </div>
      ) : null}

      {dashboard ? (
        <>
          <TimerPanel
            state={dashboard.state}
            activeSeconds={liveValues.activeSeconds}
            todaySeconds={liveValues.todaySeconds}
            pending={pending}
            onToggle={() => void handleToggle()}
          />
          <Leaderboard
            data={leaderboard}
            period={leaderboardPeriod}
            currentUserId={profile.id}
            loading={leaderboardLoading}
            error={leaderboardError}
            onPeriodChange={setLeaderboardPeriod}
            onRetry={() => void refreshLeaderboard()}
          />
          <StudyCalendar
            month={month}
            days={dashboard.days}
            notes={dashboard.notes}
            selectedDate={visibleSelectedDate}
            currentDate={currentDate}
            loading={loading}
            notePending={notePending}
            noteError={noteError}
            onMonthChange={(nextMonth) => {
              setMonth(nextMonth);
              setSelectedDate(`${nextMonth}-01`);
              setNoteError(null);
            }}
            onSelectDate={(date) => {
              setSelectedDate(date);
              setNoteError(null);
            }}
            onSaveNote={handleSaveNote}
          />
          <p
            className="profile-disclaimer"
            onPointerDown={startAdjustmentPress}
            onPointerUp={cancelAdjustmentPress}
            onPointerCancel={cancelAdjustmentPress}
            onPointerLeave={cancelAdjustmentPress}
            onContextMenu={(event) => event.preventDefault()}
          >
            Your name and study hours appear on the shared leaderboard.
          </p>
          {adjustmentOpen && isAdmin ? (
            <StudyAdjustmentSheet
              currentUserId={profile.id}
              adminTargets={adminTargets}
              pending={adjustmentPending}
              error={adjustmentError}
              onClose={() => {
                if (!adjustmentPending) setAdjustmentOpen(false);
              }}
              onAdjust={handleAdjustment}
            />
          ) : null}
        </>
      ) : (
        <div className="loading-state" aria-live="polite">
          <span />
          <p>Loading your study time...</p>
        </div>
      )}
    </div>
  );
}

export default App;
