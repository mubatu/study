import type { DailyNote } from "../../shared/contracts";
import { getUser } from "../_shared/dashboard";
import type { Env } from "../_shared/env";
import { handleError, json, readJson } from "../_shared/http";
import {
  normalizeDailyNote,
  requireStudyDate,
  requireUserId,
} from "../_shared/validation";

interface NoteRequest {
  userId?: unknown;
  date?: unknown;
  text?: unknown;
}

export const onRequestPut: PagesFunction<Env> = async (context) => {
  try {
    const body = await readJson<NoteRequest>(context.request);
    const userId = requireUserId(body.userId);
    const date = requireStudyDate(body.date);
    const text = normalizeDailyNote(body.text);

    await getUser(context.env, userId);

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
