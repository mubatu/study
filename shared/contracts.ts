export type StudyState = "studying" | "resting";

export interface UserProfile {
  id: string;
  displayName: string;
}

export interface DailyTotal {
  date: string;
  totalSeconds: number;
  sessionCount: number;
}

export interface DashboardResponse {
  user: UserProfile;
  serverTime: string;
  state: StudyState;
  activeSince: string | null;
  currentDay: DailyTotal;
  month: string;
  days: DailyTotal[];
}

export interface StateResponse {
  state: StudyState;
  serverTime: string;
  activeSince: string | null;
}

export interface ApiError {
  error: string;
}
