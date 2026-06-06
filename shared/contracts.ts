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

export type LeaderboardPeriod = "today" | "month";

export interface LeaderboardEntry {
  rank: number;
  user: UserProfile;
  totalSeconds: number;
  isStudying: boolean;
}

export interface LeaderboardResponse {
  serverTime: string;
  period: LeaderboardPeriod;
  periodStart: string;
  periodEnd: string;
  entries: LeaderboardEntry[];
  currentUser: LeaderboardEntry | null;
}

export interface ApiError {
  error: string;
}
