import type {
  ApiError,
  DailyNote,
  DailyTotal,
  DashboardResponse,
  LeaderboardPeriod,
  LeaderboardResponse,
  StateResponse,
  StudyAdjustmentOperation,
  StudyState,
  UserProfile,
} from "../../shared/contracts";

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  const body = (await response.json()) as T | ApiError;

  if (!response.ok) {
    throw new Error(
      typeof body === "object" && body !== null && "error" in body
        ? body.error
        : "Something went wrong.",
    );
  }

  return body as T;
}

export function openProfile(name: string): Promise<UserProfile> {
  return request<UserProfile>("/api/profile", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

export function getDashboard(
  userId: string,
  month: string,
): Promise<DashboardResponse> {
  const params = new URLSearchParams({ userId, month });
  return request<DashboardResponse>(`/api/dashboard?${params}`);
}

export function getLeaderboard(
  userId: string,
  period: LeaderboardPeriod,
): Promise<LeaderboardResponse> {
  const params = new URLSearchParams({ userId, period });
  return request<LeaderboardResponse>(`/api/leaderboard?${params}`);
}

export function setStudyState(
  userId: string,
  state: StudyState,
): Promise<StateResponse> {
  return request<StateResponse>("/api/state", {
    method: "PUT",
    body: JSON.stringify({ userId, state }),
  });
}

export function saveDailyNote(
  userId: string,
  date: string,
  text: string,
): Promise<DailyNote> {
  return request<DailyNote>("/api/note", {
    method: "PUT",
    body: JSON.stringify({ userId, date, text }),
  });
}

export function adjustStudyTime(
  userId: string,
  minutes: number,
  operation: StudyAdjustmentOperation,
): Promise<DailyTotal> {
  return request<DailyTotal>("/api/adjustment", {
    method: "PUT",
    body: JSON.stringify({ userId, minutes, operation }),
  });
}
