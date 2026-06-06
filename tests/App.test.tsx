import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "../src/App";
import type { DashboardResponse } from "../shared/contracts";

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
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("App", () => {
  it("opens and remembers a name-only profile", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      return url === "/api/profile"
        ? jsonResponse(profile)
        : jsonResponse(dashboard);
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
    expect(screen.getAllByText("3h 42m")).toHaveLength(3);
    expect(JSON.parse(localStorage.getItem("study-timer.profile.v1")!)).toEqual(
      profile,
    );
  });

  it("restores a remembered profile and can change user", async () => {
    localStorage.setItem("study-timer.profile.v1", JSON.stringify(profile));
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(jsonResponse(dashboard))));
    const user = userEvent.setup();

    render(<App />);
    expect(await screen.findByText("Batu")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Change user" }));
    expect(screen.getByLabelText("Your name")).toBeInTheDocument();
    expect(localStorage.getItem("study-timer.profile.v1")).toBeNull();
  });

  it("keeps the dashboard visible when a refresh fails", async () => {
    localStorage.setItem("study-timer.profile.v1", JSON.stringify(profile));
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(dashboard))
      .mockResolvedValueOnce(jsonResponse({ error: "Network unavailable" }, 503));
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    expect(await screen.findAllByText("3h 42m")).toHaveLength(3);

    window.dispatchEvent(new Event("focus"));
    expect(await screen.findByText("Network unavailable")).toBeInTheDocument();
    expect(screen.getAllByText("3h 42m")).toHaveLength(3);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });
});
