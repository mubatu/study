import type { DailyNote, UserProfile } from "../../shared/contracts";
import type { Env } from "../lib/env";
import { json, readJson } from "../lib/http";
import { normalizeDailyNote, requireStudyDate } from "../lib/validation";

interface NoteRequest {
  date?: unknown;
  text?: unknown;
}

export async function putNote(
  request: Request,
  env: Env,
  user: UserProfile,
): Promise<Response> {
  const body = await readJson<NoteRequest>(request);
  const userId = user.id;
  const date = requireStudyDate(body.date);
  const text = normalizeDailyNote(body.text);

  if (text) {
    await env.DB.prepare(
      `INSERT INTO daily_notes (user_id, study_date, note, updated_at_ms)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(user_id, study_date) DO UPDATE SET
         note = excluded.note,
         updated_at_ms = excluded.updated_at_ms`,
    )
      .bind(userId, date, text, Date.now())
      .run();
  } else {
    await env.DB.prepare(
      "DELETE FROM daily_notes WHERE user_id = ? AND study_date = ?",
    )
      .bind(userId, date)
      .run();
  }

  const response: DailyNote = { date, text };
  return json(response);
}
