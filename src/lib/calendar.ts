export const FIRST_STUDY_MONTH = "2026-06";

export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function getCalendarCells(month: string): Array<number | null> {
  const [year, monthNumber] = month.split("-").map(Number);
  const firstDay = new Date(Date.UTC(year, monthNumber - 1, 1));
  const daysInMonth = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const mondayOffset = (firstDay.getUTCDay() + 6) % 7;

  return [
    ...Array.from<null>({ length: mondayOffset }).fill(null),
    ...Array.from({ length: daysInMonth }, (_, index) => index + 1),
  ];
}
