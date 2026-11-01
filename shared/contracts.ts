export type StudyState = "studying" | "resting";

export interface UserProfile {
  id: string;
  displayName: string;
}

export interface AuthSessionResponse {
  user: UserProfile | null;
  isAdmin: boolean;
  googleClientId: string | null;
}

export interface AdminUserOption extends UserProfile {
  email: string;
}

export interface AdminUsersResponse {
  users: AdminUserOption[];
}

export type ProfileSetupMode = "create" | "claim";

export interface GoogleSignInRequest {
  credential: string;
  profile?: { mode: ProfileSetupMode; name: string };
}

export type GoogleSignInResponse =
  | { status: "signed_in"; user: UserProfile; isAdmin: boolean }
  | { status: "needs_profile"; suggestedName: string };

export interface DailyTotal {
  date: string;
  totalSeconds: number;
  sessionCount: number;
}

export interface DailyNote {
  date: string;
  text: string;
}

// One study session's part within a single 06:00-to-06:00 study day.
export interface StudySessionSpan {
  date: string;
  startedAt: string;
  endedAt: string;
  inProgress: boolean;
}

// Net manual change an admin made to a study day's total.
export interface StudyDayAdjustment {
  date: string;
  deltaSeconds: number;
}

export interface DashboardResponse {
  user: UserProfile;
  serverTime: string;
  state: StudyState;
  activeSince: string | null;
  currentDay: DailyTotal;
  month: string;
  days: DailyTotal[];
  sessions: StudySessionSpan[];
  adjustments: StudyDayAdjustment[];
  notes: DailyNote[];
}

export interface StateResponse {
  state: StudyState;
  serverTime: string;
  activeSince: string | null;
}

export type StudyAdjustmentOperation = "add" | "remove";

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

export interface MonthlyActivityResponse {
  user: UserProfile;
  serverTime: string;
  month: string;
  days: Array<Pick<DailyTotal, "date" | "totalSeconds">>;
}

export interface ApiError {
  error: string;
}
