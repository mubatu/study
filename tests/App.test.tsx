import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
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
  sessions: [],
  adjustments: [],
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

type FetchHandler = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

function stubApi(
  handler: FetchHandler,
  user: typeof profile | null = profile,
  isAdmin = false,
) {
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
    String(input) === "/api/auth/session"
      ? Promise.resolve(
          jsonResponse({ user, isAdmin, googleClientId: "client-id" }),
        )
      : handler(input, init),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function stubGoogleIdentity() {
  let callback: ((response: { credential?: string }) => void) | null = null;
  vi.stubGlobal("google", {
    accounts: {
      id: {
        initialize: vi.fn((config: { callback: typeof callback }) => {
          callback = config.callback;
        }),
        renderButton: vi.fn(),
        disableAutoSelect: vi.fn(),
      },
    },
  });
  return {
    signIn: (credential: string) => callback?.({ credential }),
  };
}

beforeEach(() => {
  vi.spyOn(Date, "now").mockReturnValue(Date.parse(dashboard.serverTime));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("App", () => {
  it("signs in with Google and links an existing name profile", async () => {
    const google = stubGoogleIdentity();
    const fetchMock = stubApi(async (input, init) => {
      const url = String(input);
      if (url === "/api/auth/google") {
        const body = JSON.parse(String(init?.body));
        return jsonResponse(
          body.profile
            ? { status: "signed_in", user: profile }
            : { status: "needs_profile", suggestedName: "Batu Han" },
        );
      }
      if (url.startsWith("/api/leaderboard")) {
        return jsonResponse(todayLeaderboard);
      }
      return jsonResponse(dashboard);
    }, null);
    const user = userEvent.setup();

    render(<App />);
    expect(
      await screen.findByText(/only you can change your study history/i),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(window.google?.accounts?.id?.renderButton).toHaveBeenCalled(),
    );

    act(() => google.signIn("google-token"));
    await user.click(
      await screen.findByRole("button", { name: "Yes, link my old profile" }),
    );
    await user.type(screen.getByLabelText("The name you used before"), "Batu");
    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(await screen.findByText("Studying as")).toBeInTheDocument();
    expect(screen.getAllByText("3h 42m")).toHaveLength(4);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/google",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          credential: "google-token",
          profile: { mode: "claim", name: "Batu" },
        }),
      }),
    );
  });

  it("prefills the Google name for a new profile", async () => {
    const google = stubGoogleIdentity();
    stubApi(async () =>
      jsonResponse({ status: "needs_profile", suggestedName: "Batu Han" }),
    null);
    const user = userEvent.setup();

    render(<App />);
    await waitFor(() =>
      expect(window.google?.accounts?.id?.renderButton).toHaveBeenCalled(),
    );
    act(() => google.signIn("google-token"));
    await user.click(
      await screen.findByRole("button", { name: "No, I'm new here" }),
    );

    expect(screen.getByLabelText("Your name")).toHaveValue("Batu Han");
  });

  it("restores a signed-in session and signs out", async () => {
    const fetchMock = stubApi(async (input) => {
      const url = String(input);
      if (url === "/api/auth/logout") return jsonResponse({ ok: true });
      if (url.startsWith("/api/leaderboard")) {
        return jsonResponse(todayLeaderboard);
      }
      return jsonResponse(dashboard);
    });
    const user = userEvent.setup();

    render(<App />);
    expect(await screen.findByText("Batu")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Sign out" }));
    expect(
      await screen.findByText(/only you can change your study history/i),
    ).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/logout",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("returns to sign-in when the session has expired", async () => {
    stubApi(async () => jsonResponse({ error: "Sign in to continue." }, 401));

    render(<App />);

    expect(
      await screen.findByText(/only you can change your study history/i),
    ).toBeInTheDocument();
  });

  it("keeps the dashboard visible when a refresh fails", async () => {
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
    stubApi(fetchMock);

    render(<App />);
    expect(await screen.findAllByText("3h 42m")).toHaveLength(4);

    window.dispatchEvent(new Event("focus"));
    expect(await screen.findByText("Network unavailable")).toBeInTheDocument();
    expect(screen.getAllByText("3h 42m")).toHaveLength(4);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4));
  });

  it("switches between today and monthly leaderboard rankings", async () => {
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
    stubApi(fetchMock);
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

  it("stops your history calendar at June 2026", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("/api/leaderboard")) {
        return jsonResponse(todayLeaderboard);
      }
      const month = new URL(url, "https://study.test").searchParams.get("month");
      return jsonResponse({ ...dashboard, month });
    });
    stubApi(fetchMock);
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText("June 2026");

    const previous = screen.getByRole("button", { name: "Previous month" });
    expect(previous).toBeDisabled();
    await user.click(previous);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    await user.click(screen.getByRole("button", { name: "Next month" }));
    expect(screen.getByText("July 2026")).toBeInTheDocument();
    expect(previous).toBeEnabled();
    await user.click(previous);
    expect(screen.getByText("June 2026")).toBeInTheDocument();
    expect(previous).toBeDisabled();
    expect(fetchMock.mock.calls
      .map(([url]) => String(url))
      .filter((url) => url.startsWith("/api/dashboard")))
      .toEqual([
        "/api/dashboard?month=2026-06",
        "/api/dashboard?month=2026-07",
        "/api/dashboard?month=2026-06",
      ]);
  });

  it("caps an active session and today's total at three hours", async () => {
    const cappedDashboard: DashboardResponse = {
      ...dashboard,
      state: "studying",
      activeSince: "2026-06-06T06:00:00.000Z",
      currentDay: { ...dashboard.currentDay, totalSeconds: 10_800 },
      days: [{ ...dashboard.days[0], totalSeconds: 10_800 }],
    };
    stubApi(
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

  it("lists the selected day's session times", async () => {
    const sessionsDashboard: DashboardResponse = {
      ...dashboard,
      state: "studying",
      activeSince: "2026-06-06T09:15:00.000Z",
      sessions: [
        {
          date: "2026-06-06",
          startedAt: "2026-06-06T06:00:00.000Z",
          endedAt: "2026-06-06T07:30:00.000Z",
          inProgress: false,
        },
        {
          date: "2026-06-06",
          startedAt: "2026-06-06T09:15:00.000Z",
          endedAt: "2026-06-06T10:00:00.000Z",
          inProgress: true,
        },
      ],
      adjustments: [{ date: "2026-06-06", deltaSeconds: 1800 }],
    };
    stubApi(async (input) =>
      String(input).startsWith("/api/leaderboard")
        ? jsonResponse(todayLeaderboard)
        : jsonResponse(sessionsDashboard),
    );
    const user = userEvent.setup();

    render(<App />);

    const list = await screen.findByRole("list", {
      name: "Study sessions on Saturday, June 6, 2026",
    });
    const rows = within(list).getAllByRole("listitem");
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent("09:00 – 10:30");
    expect(rows[0]).toHaveTextContent("1h 30m");
    expect(rows[1]).toHaveTextContent("12:15 – now");
    expect(rows[1]).toHaveTextContent("In progress");
    expect(rows[2]).toHaveTextContent("Manual adjustment");
    expect(rows[2]).toHaveTextContent("+30m");

    await user.click(
      screen.getByRole("button", { name: /Friday, June 5, 2026/ }),
    );
    expect(
      screen.queryByRole("list", { name: /Study sessions on/ }),
    ).not.toBeInTheDocument();
  });

  it("edits and saves a note for the selected day", async () => {
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
    stubApi(fetchMock);
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
            date: "2026-06-06",
            text: "Practice limits",
          }),
        }),
      ),
    );
    expect(screen.getByRole("button", { name: "Saved" })).toBeDisabled();
  });

  it("opens hidden controls on long press and adds minutes", async () => {
    let adjusted = false;
    const adjustedDashboard: DashboardResponse = {
      ...dashboard,
      currentDay: {
        ...dashboard.currentDay,
        totalSeconds: 15_120,
        sessionCount: 3,
      },
      days: [
        {
          ...dashboard.days[0],
          totalSeconds: 15_120,
          sessionCount: 3,
        },
      ],
    };
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url === "/api/admin/users") {
          return jsonResponse({
            users: [{ ...profile, email: "batu@example.com" }],
          });
        }
        if (url === "/api/adjustment") {
          adjusted = true;
          return jsonResponse(adjustedDashboard.currentDay);
        }
        if (url.startsWith("/api/leaderboard")) {
          return jsonResponse(todayLeaderboard);
        }
        if (url.startsWith("/api/dashboard")) {
          return jsonResponse(adjusted ? adjustedDashboard : dashboard);
        }
        return jsonResponse(dashboard);
      },
    );
    stubApi(fetchMock, profile, true);
    const user = userEvent.setup();

    render(<App />);
    const disclaimer = await screen.findByText(
      "Your name and study hours appear on the shared leaderboard.",
    );
    fireEvent.pointerDown(disclaimer);

    expect(
      await screen.findByRole(
        "dialog",
        { name: "Adjust today" },
        { timeout: 1_500 },
      ),
    ).toBeInTheDocument();
    fireEvent.pointerUp(disclaimer);

    expect(screen.getByRole("button", { name: "Remove" })).toBeDisabled();
    await user.type(screen.getByLabelText("Minutes"), "30");
    await user.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/adjustment",
        expect.objectContaining({
          method: "PUT",
          body: JSON.stringify({
            minutes: 30,
            operation: "add",
          }),
        }),
      ),
    );
    expect(await screen.findByText("3 sessions")).toBeInTheDocument();
    expect(
      screen.getByText("06:00 to 05:59, Istanbul time").parentElement,
    ).toHaveTextContent("4h 12m");
  });

  it("lets an admin pick another profile in the hidden controls", async () => {
    const fetchMock = stubApi(
      async (input) => {
        const url = String(input);
        if (url === "/api/admin/users") {
          return jsonResponse({
            users: [
              { ...profile, email: "batu@example.com" },
              { id: "gokce", displayName: "Gökçe", email: "gokce@example.com" },
            ],
          });
        }
        if (url === "/api/adjustment") {
          return jsonResponse(dashboard.currentDay);
        }
        if (url.startsWith("/api/leaderboard")) {
          return jsonResponse(todayLeaderboard);
        }
        return jsonResponse(dashboard);
      },
      profile,
      true,
    );
    const user = userEvent.setup();

    render(<App />);
    const disclaimer = await screen.findByText(
      "Your name and study hours appear on the shared leaderboard.",
    );
    fireEvent.pointerDown(disclaimer);
    await screen.findByRole("dialog", { name: "Adjust today" }, { timeout: 1_500 });
    fireEvent.pointerUp(disclaimer);

    const picker = screen.getByLabelText("Profile");
    await screen.findByRole("option", { name: "Gökçe · gokce@example.com" });
    expect(picker).toHaveValue(profile.id);
    await user.selectOptions(picker, "gokce");
    await user.type(screen.getByLabelText("Minutes"), "45");
    await user.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/adjustment",
        expect.objectContaining({
          body: JSON.stringify({ userId: "gokce", minutes: 45, operation: "add" }),
        }),
      ),
    );
  });

  it("does not open the hidden controls for regular users", async () => {
    stubApi(async (input) =>
      String(input).startsWith("/api/leaderboard")
        ? jsonResponse(todayLeaderboard)
        : jsonResponse(dashboard),
    );

    render(<App />);
    const disclaimer = await screen.findByText(
      "Your name and study hours appear on the shared leaderboard.",
    );
    fireEvent.pointerDown(disclaimer);
    await new Promise((resolve) => setTimeout(resolve, 900));
    fireEvent.pointerUp(disclaimer);

    expect(
      screen.queryByRole("dialog", { name: "Adjust today" }),
    ).not.toBeInTheDocument();
  });
});
