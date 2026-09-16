import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../src/App";
import type {
  DashboardResponse,
  LeaderboardResponse,
} from "../shared/contracts";

const profile = {
  id: "123e4567-e89b-42d3-a456-426614174000",
  displayName: "Batu",
};

const dashboard: DashboardResponse = {
  user: profile,
  serverTime: "2026-06-06T10:00:00.000Z",
  state: "resting",
  activeSince: null,
  currentDay: {
    date: "2026-06-06",
    totalSeconds: 13_320,
    sessionCount: 2,
  },
  month: "2026-06",
  days: [
    {
      date: "2026-06-06",
      totalSeconds: 13_320,
      sessionCount: 2,
    },
  ],
  notes: [],
};

const todayLeaderboard: LeaderboardResponse = {
  serverTime: "2026-06-06T10:00:00.000Z",
  period: "today",
  periodStart: "2026-06-06T03:00:00.000Z",
  periodEnd: "2026-06-06T10:00:00.000Z",
  entries: [
    {
      rank: 1,
      user: { id: "ada", displayName: "Ada" },
      totalSeconds: 14_400,
      isStudying: true,
    },
    {
      rank: 2,
      user: profile,
      totalSeconds: 13_320,
      isStudying: false,
    },
  ],
  currentUser: {
    rank: 2,
    user: profile,
    totalSeconds: 13_320,
    isStudying: false,
  },
};

const monthLeaderboard: LeaderboardResponse = {
  ...todayLeaderboard,
  period: "month",
  periodStart: "2026-06-01T03:00:00.000Z",
  entries: [
    {
      rank: 1,
      user: { id: "cara", displayName: "Cara" },
      totalSeconds: 72_000,
      isStudying: false,
    },
  ],
  currentUser: null,
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  vi.spyOn(Date, "now").mockReturnValue(Date.parse(dashboard.serverTime));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("App", () => {
  it("opens and remembers a name-only profile", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/profile") return jsonResponse(profile);
      if (url.startsWith("/api/leaderboard")) {
        return jsonResponse(todayLeaderboard);
      }
      return jsonResponse(dashboard);
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<App />);
    expect(
      screen.getByText(/anyone who enters the same name/i),
    ).toBeInTheDocument();

    await user.type(screen.getByLabelText("Your name"), "Batu");
    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(await screen.findByText("Studying as")).toBeInTheDocument();
    expect(screen.getAllByText("3h 42m")).toHaveLength(4);
    expect(screen.getByText("Ada")).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem("study-timer.profile.v1")!)).toEqual(
      profile,
    );
  });

  it("restores a remembered profile and can change user", async () => {
    localStorage.setItem("study-timer.profile.v1", JSON.stringify(profile));
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) =>
        Promise.resolve(
          String(input).startsWith("/api/leaderboard")
            ? jsonResponse(todayLeaderboard)
            : jsonResponse(dashboard),
        ),
      ),
    );
    const user = userEvent.setup();

    render(<App />);
    expect(await screen.findByText("Batu")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Change user" }));
    expect(screen.getByLabelText("Your name")).toBeInTheDocument();
    expect(localStorage.getItem("study-timer.profile.v1")).toBeNull();
  });

  it("keeps the dashboard visible when a refresh fails", async () => {
    localStorage.setItem("study-timer.profile.v1", JSON.stringify(profile));
    let dashboardRequests = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).startsWith("/api/leaderboard")) {
        return jsonResponse(todayLeaderboard);
      }
      dashboardRequests += 1;
      return dashboardRequests === 1
        ? jsonResponse(dashboard)
        : jsonResponse({ error: "Network unavailable" }, 503);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    expect(await screen.findAllByText("3h 42m")).toHaveLength(4);

    window.dispatchEvent(new Event("focus"));
    expect(await screen.findByText("Network unavailable")).toBeInTheDocument();
    expect(screen.getAllByText("3h 42m")).toHaveLength(4);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4));
  });

  it("switches between today and monthly leaderboard rankings", async () => {
    localStorage.setItem("study-timer.profile.v1", JSON.stringify(profile));
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/leaderboard") && url.includes("period=month")) {
        return jsonResponse(monthLeaderboard);
      }
      if (url.startsWith("/api/leaderboard")) {
        return jsonResponse(todayLeaderboard);
      }
      return jsonResponse(dashboard);
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<App />);
    expect(await screen.findByText("Ada")).toBeInTheDocument();
    expect(screen.getByText("Studying now")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "This month" }));
    expect(await screen.findByText("Cara")).toBeInTheDocument();
    expect(
      screen.getByText("Study during this period to join the ranking."),
    ).toBeInTheDocument();
  });

  it("caps an active session and today's total at three hours", async () => {
    localStorage.setItem("study-timer.profile.v1", JSON.stringify(profile));
    const cappedDashboard: DashboardResponse = {
      ...dashboard,
      state: "studying",
      activeSince: "2026-06-06T06:00:00.000Z",
      currentDay: { ...dashboard.currentDay, totalSeconds: 10_800 },
      days: [{ ...dashboard.days[0], totalSeconds: 10_800 }],
    };
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) =>
        Promise.resolve(
          String(input).startsWith("/api/leaderboard")
            ? jsonResponse(todayLeaderboard)
            : jsonResponse(cappedDashboard),
        ),
      ),
    );

    render(<App />);

    expect(await screen.findByText("03:00:00")).toBeInTheDocument();
    expect(screen.getByText("Current session · 3h max")).toBeInTheDocument();
    expect(
      screen.getByText("06:00 to 05:59, Istanbul time").parentElement,
    ).toHaveTextContent("3h");
  });

  it("edits and saves a note for the selected day", async () => {
    localStorage.setItem("study-timer.profile.v1", JSON.stringify(profile));
    const notedDashboard: DashboardResponse = {
      ...dashboard,
      notes: [{ date: "2026-06-06", text: "Read chapter 4" }],
    };
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.startsWith("/api/leaderboard")) {
          return jsonResponse(todayLeaderboard);
        }
        if (url === "/api/note") {
          const request = JSON.parse(String(init?.body));
          return jsonResponse({ date: request.date, text: request.text });
        }
        return jsonResponse(notedDashboard);
      },
    );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<App />);

    const note = await screen.findByLabelText("Daily note");
    expect(note).toHaveValue("Read chapter 4");
    expect(
      screen.getByRole("button", {
        name: /Saturday, June 6, 2026, 3h 42m, note added/i,
      }),
    ).toBeInTheDocument();

    await user.clear(note);
    await user.type(note, "Practice limits");
    await user.click(screen.getByRole("button", { name: "Save note" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/note",
        expect.objectContaining({
          method: "PUT",
          body: JSON.stringify({
            userId: profile.id,
            date: "2026-06-06",
            text: "Practice limits",
          }),
        }),
      ),
    );
    expect(screen.getByRole("button", { name: "Saved" })).toBeDisabled();
  });
});
