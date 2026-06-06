import type {
  ApiError,
  DashboardResponse,
  StateResponse,
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

export function setStudyState(
  userId: string,
  state: StudyState,
): Promise<StateResponse> {
  return request<StateResponse>("/api/state", {
    method: "PUT",
    body: JSON.stringify({ userId, state }),
  });
}
