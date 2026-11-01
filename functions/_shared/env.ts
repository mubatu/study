import type { D1Database } from "@cloudflare/workers-types";
import type { UserProfile } from "../../shared/contracts";

export interface Env {
  DB: D1Database;
  GOOGLE_CLIENT_ID?: string;
}

// Populated by functions/api/_middleware.ts for every signed-in API request.
export type AuthData = {
  user: UserProfile;
};
