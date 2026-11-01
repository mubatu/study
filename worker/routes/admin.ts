import type { AdminUsersResponse } from "../../shared/contracts";
import type { SessionUser } from "../lib/auth";
import type { Env } from "../lib/env";
import { HttpError, json } from "../lib/http";

interface AdminUserRow {
  id: string;
  display_name: string;
  email: string;
}

export function requireAdmin(user: SessionUser): void {
  if (!user.isAdmin) throw new HttpError(403, "Admin access is required.");
}

// Profiles with an email are the ones linked (or pre-linked) to a Google account.
export async function getAdminUsers(
  _request: Request,
  env: Env,
  user: SessionUser,
): Promise<Response> {
  requireAdmin(user);

  const result = await env.DB.prepare(
    `SELECT id, display_name, email
       FROM users
      WHERE email IS NOT NULL
      ORDER BY display_name COLLATE NOCASE`,
  ).all<AdminUserRow>();

  const response: AdminUsersResponse = {
    users: result.results.map((row) => ({
      id: row.id,
      displayName: row.display_name,
      email: row.email,
    })),
  };
  return json(response);
}
