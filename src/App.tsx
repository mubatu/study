import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
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
import { BookMark } from "./components/Icons";
import {
  adjustStudyTime,
  getDashboard,
  getLeaderboard,
  openProfile,
  saveDailyNote,
  setStudyState,
} from "./lib/api";
import { currentStudyMonth } from "./lib/format";

const STORAGE_KEY = "study-timer.profile.v1";
const ADJUSTMENT_LONG_PRESS_MS = 700;

function loadSavedProfile(): UserProfile | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    if (!value) return null;

    const parsed = JSON.parse(value) as Partial<UserProfile>;
    return typeof parsed.id === "string" && typeof parsed.displayName === "string"
      ? { id: parsed.id, displayName: parsed.displayName }
      : null;
  } catch {
    return null;
  }
}

function App() {
  const [profile, setProfile] = useState<UserProfile | null>(loadSavedProfile);
  const [name, setName] = useState("");
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
        applyDashboard(await getDashboard(profile.id, month));
      } catch (requestError) {
        setError(
          requestError instanceof Error
            ? requestError.message
            : "Could not refresh your study time.",
        );
      } finally {
        if (!quiet) setLoading(false);
      }
    },
    [applyDashboard, month, profile],
  );

  const refreshLeaderboard = useCallback(
    async (quiet = false) => {
      if (!profile) return;
      if (!quiet) setLeaderboardLoading(true);

      try {
        setLeaderboard(
          await getLeaderboard(profile.id, leaderboardPeriod),
        );
        setLeaderboardError(null);
      } catch (requestError) {
        setLeaderboardError(
          requestError instanceof Error
            ? requestError.message
            : "Could not refresh the leaderboard.",
        );
      } finally {
        if (!quiet) setLeaderboardLoading(false);
      }
    },
    [leaderboardPeriod, profile],
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

  async function handleLogin(event: FormEvent) {
    event.preventDefault();
    const cleanName = name.trim();
    if (!cleanName) return;

    setPending(true);
    setError(null);

    try {
      const nextProfile = await openProfile(cleanName);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(nextProfile));
      setProfile(nextProfile);
      setName("");
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Could not open that profile.",
      );
    } finally {
      setPending(false);
    }
  }

  async function handleToggle() {
    if (!profile || !dashboard) return;
    setPending(true);
    setError(null);

    try {
      await setStudyState(
        profile.id,
        dashboard.state === "studying" ? "resting" : "studying",
      );
      const [dashboardResult, leaderboardResult] = await Promise.allSettled([
        getDashboard(profile.id, month),
        getLeaderboard(profile.id, leaderboardPeriod),
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
      const savedNote = await saveDailyNote(profile.id, date, text);
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

  function startAdjustmentPress() {
    cancelAdjustmentPress();
    adjustmentPressTimer.current = window.setTimeout(() => {
      setAdjustmentError(null);
      setAdjustmentOpen(true);
      adjustmentPressTimer.current = null;
    }, ADJUSTMENT_LONG_PRESS_MS);
  }

  async function handleAdjustment(
    operation: StudyAdjustmentOperation,
    minutes: number,
  ) {
    if (!profile) return;
    setAdjustmentPending(true);
    setAdjustmentError(null);

    try {
      await adjustStudyTime(profile.id, minutes, operation);
      const [dashboardResult, leaderboardResult] = await Promise.allSettled([
        getDashboard(profile.id, month),
        getLeaderboard(profile.id, leaderboardPeriod),
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

  function handleChangeUser() {
    localStorage.removeItem(STORAGE_KEY);
    setProfile(null);
    setDashboard(null);
    setLeaderboard(null);
    setError(null);
    setNoteError(null);
    setAdjustmentOpen(false);
    setAdjustmentError(null);
    setLeaderboardError(null);
  }

  if (!profile) {
    return (
      <div className="app-shell app-shell--login">
        <header className="brand">
          <BookMark />
          <span>Study</span>
        </header>
        <main className="login-panel">
          <div>
            <h1>Make the hours count.</h1>
            <p>
              One button to track focused study time, day after day.
            </p>
          </div>

          <form onSubmit={handleLogin}>
            <label htmlFor="name">Your name</label>
            <div className="name-field">
              <input
                id="name"
                name="name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={40}
                autoComplete="name"
                autoFocus
                placeholder="Enter your name"
              />
              <button type="submit" disabled={pending || !name.trim()}>
                {pending ? "Opening..." : "Continue"}
              </button>
            </div>
          </form>

          {error ? <p className="error-message">{error}</p> : null}

          <p className="privacy-note">
            Profiles use names only. Anyone who enters the same name can view
            and update its study history.
          </p>
        </main>
      </div>
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
        <button className="text-button" type="button" onClick={handleChangeUser}>
          Change user
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
            This profile is public to anyone using the same name.
          </p>
          {adjustmentOpen ? (
            <StudyAdjustmentSheet
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
