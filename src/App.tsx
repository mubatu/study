import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import type {
  DashboardResponse,
  UserProfile,
} from "../shared/contracts";
import { studyDayKeyForInstant, studyDayBounds } from "../shared/studyTime";
import { StudyCalendar } from "./components/StudyCalendar";
import { TimerPanel } from "./components/TimerPanel";
import { BookMark } from "./components/Icons";
import { getDashboard, openProfile, setStudyState } from "./lib/api";
import { currentStudyMonth } from "./lib/format";

const STORAGE_KEY = "study-timer.profile.v1";

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
  const [clockMs, setClockMs] = useState(Date.now());
  const [snapshotReceivedAt, setSnapshotReceivedAt] = useState(Date.now());
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (dashboard?.state !== "studying") return;

    const interval = window.setInterval(() => setClockMs(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [dashboard?.state]);

  useEffect(() => {
    if (!profile) return;

    const onFocus = () => void refresh(true);
    const onOnline = () => void refresh(true);
    window.addEventListener("focus", onFocus);
    window.addEventListener("online", onOnline);

    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("online", onOnline);
    };
  }, [profile, refresh]);

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
    }, Math.max(1_000, nextBoundary - now + 1_000));

    return () => window.clearTimeout(timeout);
  }, [profile, refresh, dashboard?.serverTime]);

  const liveValues = useMemo(() => {
    if (!dashboard) return { activeSeconds: 0, todaySeconds: 0 };

    const serverMs = new Date(dashboard.serverTime).getTime();
    const elapsedSinceSnapshot = Math.max(
      0,
      Math.floor((clockMs - snapshotReceivedAt) / 1000),
    );
    const activeSeconds = dashboard.activeSince
      ? Math.floor(
          (serverMs - new Date(dashboard.activeSince).getTime()) / 1000,
        ) + elapsedSinceSnapshot
      : 0;

    return {
      activeSeconds,
      todaySeconds:
        dashboard.currentDay.totalSeconds +
        (dashboard.state === "studying" ? elapsedSinceSnapshot : 0),
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
      applyDashboard(await getDashboard(profile.id, month));
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

  function handleChangeUser() {
    localStorage.removeItem(STORAGE_KEY);
    setProfile(null);
    setDashboard(null);
    setError(null);
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
          <StudyCalendar
            month={month}
            days={dashboard.days}
            selectedDate={visibleSelectedDate}
            currentDate={currentDate}
            loading={loading}
            onMonthChange={(nextMonth) => {
              setMonth(nextMonth);
              setSelectedDate(`${nextMonth}-01`);
            }}
            onSelectDate={setSelectedDate}
          />
          <p className="profile-disclaimer">
            This profile is public to anyone using the same name.
          </p>
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
