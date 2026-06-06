import type { UserProfile } from "../../shared/contracts";
import type { Env } from "../_shared/env";
import { handleError, json, readJson } from "../_shared/http";
import { normalizeProfileName } from "../_shared/validation";

interface ProfileRequest {
  name?: unknown;
}

interface UserRow {
  id: string;
  display_name: string;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const body = await readJson<ProfileRequest>(context.request);
    const normalized = normalizeProfileName(body.name);
    const id = crypto.randomUUID();
    const nowMs = Date.now();

    await context.env.DB.prepare(
      `INSERT OR IGNORE INTO users
        (id, name_key, display_name, created_at_ms)
       VALUES (?, ?, ?, ?)`,
    )
      .bind(id, normalized.nameKey, normalized.displayName, nowMs)
      .run();

    const user = await context.env.DB.prepare(
      "SELECT id, display_name FROM users WHERE name_key = ?",
    )
      .bind(normalized.nameKey)
      .first<UserRow>();

    if (!user) {
      throw new Error("Profile was not available after creation.");
    }

    const response: UserProfile = {
      id: user.id,
      displayName: user.display_name,
    };
    return json(response);
  } catch (error) {
    return handleError(error);
  }
};
