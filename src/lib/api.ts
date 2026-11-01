import type {
  AdminUsersResponse,
  ApiError,
  AuthSessionResponse,
  DailyNote,
  DailyTotal,
  DashboardResponse,
  GoogleSignInRequest,
  GoogleSignInResponse,
  LeaderboardPeriod,
  LeaderboardResponse,
  MonthlyActivityResponse,
  StateResponse,
  StudyAdjustmentOperation,
  StudyState,
} from "../../shared/contracts";

export class ApiRequestError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export function isUnauthorized(error: unknown): boolean {
  return error instanceof ApiRequestError && error.status === 401;
}

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
    throw new ApiRequestError(
      response.status,
      typeof body === "object" && body !== null && "error" in body
        ? body.error
        : "Something went wrong.",
    );
  }

  return body as T;
}

export function getSession(): Promise<AuthSessionResponse> {
  return request<AuthSessionResponse>("/api/auth/session");
}

export function signInWithGoogle(
  input: GoogleSignInRequest,
): Promise<GoogleSignInResponse> {
  return request<GoogleSignInResponse>("/api/auth/google", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function signOut(): Promise<{ ok: true }> {
  return request<{ ok: true }>("/api/auth/logout", { method: "POST" });
}

export function getDashboard(month: string): Promise<DashboardResponse> {
  const params = new URLSearchParams({ month });
  return request<DashboardResponse>(`/api/dashboard?${params}`);
}

export function getLeaderboard(
  period: LeaderboardPeriod,
): Promise<LeaderboardResponse> {
  const params = new URLSearchParams({ period });
  return request<LeaderboardResponse>(`/api/leaderboard?${params}`);
}

export function getMonthlyActivity(
  userId: string,
  month: string,
  signal?: AbortSignal,
): Promise<MonthlyActivityResponse> {
  const params = new URLSearchParams({ userId, month });
  return request<MonthlyActivityResponse>(`/api/activity?${params}`, { signal });
}

export function setStudyState(state: StudyState): Promise<StateResponse> {
  return request<StateResponse>("/api/state", {
    method: "PUT",
    body: JSON.stringify({ state }),
  });
}

export function saveDailyNote(date: string, text: string): Promise<DailyNote> {
  return request<DailyNote>("/api/note", {
    method: "PUT",
    body: JSON.stringify({ date, text }),
  });
}

export function getAdminUsers(): Promise<AdminUsersResponse> {
  return request<AdminUsersResponse>("/api/admin/users");
}

// userId is only sent for admin adjustments of another profile.
export function adjustStudyTime(
  minutes: number,
  operation: StudyAdjustmentOperation,
  userId?: string,
): Promise<DailyTotal> {
  return request<DailyTotal>("/api/adjustment", {
    method: "PUT",
    body: JSON.stringify(userId ? { userId, minutes, operation } : { minutes, operation }),
  });
}
