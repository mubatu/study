import type { DailyNote } from "../../shared/contracts";
import type { AuthData, Env } from "../_shared/env";
import { handleError, json, readJson } from "../_shared/http";
import { normalizeDailyNote, requireStudyDate } from "../_shared/validation";

interface NoteRequest {
  date?: unknown;
  text?: unknown;
}

export const onRequestPut: PagesFunction<Env, string, AuthData> = async (context) => {
  try {
    const body = await readJson<NoteRequest>(context.request);
    const userId = context.data.user.id;
    const date = requireStudyDate(body.date);
    const text = normalizeDailyNote(body.text);

    if (text) {
      await context.env.DB.prepare(
        `INSERT INTO daily_notes (user_id, study_date, note, updated_at_ms)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(user_id, study_date) DO UPDATE SET
           note = excluded.note,
           updated_at_ms = excluded.updated_at_ms`,
      )
        .bind(userId, date, text, Date.now())
        .run();
    } else {
      await context.env.DB.prepare(
        "DELETE FROM daily_notes WHERE user_id = ? AND study_date = ?",
      )
        .bind(userId, date)
        .run();
    }

    const response: DailyNote = { date, text };
    return json(response);
  } catch (error) {
    return handleError(error);
  }
};
