import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LeaderboardResponse, MonthlyActivityResponse } from "../shared/contracts";
import { Leaderboard } from "../src/components/Leaderboard";

const profile = { id: "minis", displayName: "Miniş" };
const other = { id: "batu", displayName: "Batu" };
const leaderboard: LeaderboardResponse = {
  // Before 06:00 on July 1 is still the June study month.
  serverTime: "2026-07-01T02:00:00Z",
  period: "today",
  periodStart: "2026-06-30T03:00:00Z",
  periodEnd: "2026-07-01T02:00:00Z",
  entries: [
    { rank: 1, user: other, totalSeconds: 7200, isStudying: true },
    { rank: 2, user: profile, totalSeconds: 3600, isStudying: false },
  ],
  currentUser: null,
};
const activity: MonthlyActivityResponse = {
  user: other,
  serverTime: leaderboard.serverTime,
  month: "2026-06",
  days: [{ date: "2026-06-06", totalSeconds: 7200 }],
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

function renderLeaderboard(
  period: "today" | "month" = "today",
  serverTime = leaderboard.serverTime,
) {
  render(<Leaderboard
    data={{ ...leaderboard, period, serverTime }}
    period={period}
    currentUserId={profile.id}
    loading={false}
    error={null}
    onPeriodChange={vi.fn()}
    onRetry={vi.fn()}
  />);
  return screen.getByRole("button", { name: "View Batu's monthly study hours" });
}

beforeEach(() => {
  vi.useFakeTimers();
  // jsdom has no native dialog implementation. Browsers provide focus trapping.
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true,
    value: function (this: HTMLDialogElement) {
      this.setAttribute("open", "");
      this.querySelector<HTMLButtonElement>("button")?.focus();
    },
  });
  Object.defineProperty(HTMLDialogElement.prototype, "close", {
    configurable: true,
    value: function (this: HTMLDialogElement) {
      this.removeAttribute("open");
    },
  });
  vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(activity)));
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function hold(row: HTMLElement) {
  fireEvent.pointerDown(row, { button: 0 });
  await act(async () => { vi.advanceTimersByTime(700); });
  fireEvent.pointerUp(row);
}

describe("leaderboard monthly activity", () => {
  it.each(["today", "month"] as const)("opens hours-only activity on long press in the %s leaderboard", async (period) => {
    const row = renderLeaderboard(period);
    fireEvent.pointerDown(row, { button: 0 });
    await act(async () => { vi.advanceTimersByTime(699); });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await act(async () => { vi.advanceTimersByTime(1); });
    fireEvent.pointerUp(row);

    const dialog = screen.getByRole("dialog", { name: "Batu" });
    expect(within(dialog).getByText("June 2026")).toBeInTheDocument();
    expect(within(dialog).getByRole("listitem", { name: "Saturday, June 6, 2026, 2h" })).toBeInTheDocument();
    expect(within(dialog).getAllByRole("listitem")).toHaveLength(30);
    expect(within(dialog).queryByText(/note|session/i)).not.toBeInTheDocument();
    expect(within(dialog).queryByRole("textbox")).not.toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(
      "/api/activity?userId=batu&month=2026-06",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(document.body.style.overflow).toBe("hidden");
    fireEvent.click(within(dialog).getByRole("button", { name: "Close monthly activity" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(document.body.style.overflow).toBe("");
    expect(row).toHaveFocus();
  });

  it("ignores a short tap and does not make your own row interactive", async () => {
    const row = renderLeaderboard();
    fireEvent.pointerDown(row);
    await act(async () => { vi.advanceTimersByTime(300); });
    fireEvent.pointerUp(row);
    fireEvent.click(row, { detail: 1 });
    await act(async () => { vi.advanceTimersByTime(1000); });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: /View Miniş/ })).not.toBeInTheDocument();
  });

  it.each(["pointerCancel", "pointerLeave", "scroll", "blur"] as const)("cancels a pending hold on %s", async (event) => {
    const row = renderLeaderboard();
    fireEvent.pointerDown(row);
    await act(async () => { vi.advanceTimersByTime(300); });
    if (event === "scroll") fireEvent.scroll(window);
    else if (event === "blur") fireEvent.blur(window);
    else fireEvent[event](row);
    await act(async () => { vi.advanceTimersByTime(1000); });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("cancels a hold when a touch moves to scroll", async () => {
    // jsdom otherwise treats pointer events as plain Events without coordinates.
    vi.stubGlobal("PointerEvent", MouseEvent);
    const row = renderLeaderboard();
    fireEvent.pointerDown(row, { clientX: 50, clientY: 50 });
    fireEvent.pointerMove(row, { clientX: 50, clientY: 70 });
    await act(async () => { vi.advanceTimersByTime(1000); });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("supports keyboard activation and Escape dismissal", async () => {
    const row = renderLeaderboard();
    row.focus();
    await act(async () => { fireEvent.click(row, { detail: 0 }); });
    const dialog = screen.getByRole("dialog", { name: "Batu" });
    fireEvent(dialog, new Event("cancel", { bubbles: false, cancelable: true }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(row).toHaveFocus();
  });

  it("loads other months, handles empty history, and ignores stale responses", async () => {
    let resolveJuly!: (response: Response) => void;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("month=2026-07")) {
        return new Promise<Response>((resolve) => { resolveJuly = resolve; });
      }
      if (url.includes("month=2026-06")) {
        return jsonResponse({ ...activity, days: [] });
      }
      return jsonResponse({ ...activity, month: "2026-08", days: [] });
    });
    vi.stubGlobal("fetch", fetchMock);
    await hold(renderLeaderboard("today", "2026-08-06T10:00:00Z"));
    const dialog = screen.getByRole("dialog");
    const previous = within(dialog).getByRole("button", { name: "Previous activity month" });
    await act(async () => { fireEvent.click(previous); });
    expect(within(dialog).getByText("Loading study hours...")).toBeInTheDocument();
    expect(within(dialog).queryByRole("list")).not.toBeInTheDocument();
    await act(async () => { fireEvent.click(previous); });
    expect(within(dialog).getByText("June 2026")).toBeInTheDocument();
    expect(within(dialog).getByText("No study hours this month.")).toBeInTheDocument();
    await act(async () => { resolveJuly(jsonResponse({ ...activity, month: "2026-07" })); });
    expect(within(dialog).getByText("No study hours this month.")).toBeInTheDocument();
    expect(within(dialog).getAllByRole("listitem")).toHaveLength(30);
  });

  it("stops at June 2026 and allows navigating forward and back", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const month = new URL(String(input), "https://study.test").searchParams.get("month");
      return jsonResponse({ ...activity, month, days: [] });
    });
    vi.stubGlobal("fetch", fetchMock);
    await hold(renderLeaderboard());
    const dialog = screen.getByRole("dialog");
    const previous = within(dialog).getByRole("button", { name: "Previous activity month" });
    const next = within(dialog).getByRole("button", { name: "Next activity month" });

    expect(previous).toBeDisabled();
    await act(async () => { fireEvent.click(previous); });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(within(dialog).getByText("June 2026")).toBeInTheDocument();

    await act(async () => { fireEvent.click(next); });
    expect(within(dialog).getByText("July 2026")).toBeInTheDocument();
    expect(previous).toBeEnabled();
    await act(async () => { fireEvent.click(previous); });
    expect(within(dialog).getByText("June 2026")).toBeInTheDocument();
    expect(previous).toBeDisabled();
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
      "/api/activity?userId=batu&month=2026-06",
      "/api/activity?userId=batu&month=2026-07",
      "/api/activity?userId=batu&month=2026-06",
    ]);
  });

  it("shows request failures and can retry", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ error: "Network unavailable" }, 503))
      .mockResolvedValueOnce(jsonResponse(activity));
    vi.stubGlobal("fetch", fetchMock);
    await hold(renderLeaderboard());
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("alert")).toHaveTextContent("Network unavailable");
    await act(async () => { fireEvent.click(within(dialog).getByRole("button", { name: "Retry" })); });
    expect(within(dialog).getByRole("list")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("clears an unfinished hold when the leaderboard unmounts", async () => {
    const view = render(<Leaderboard data={leaderboard} period="today" currentUserId={profile.id}
      loading={false} error={null} onPeriodChange={vi.fn()} onRetry={vi.fn()} />);
    fireEvent.pointerDown(screen.getByRole("button", { name: "View Batu's monthly study hours" }));
    view.unmount();
    await act(async () => { vi.advanceTimersByTime(1000); });
    expect(fetch).not.toHaveBeenCalled();
  });
});
