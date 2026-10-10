/** One business calendar shared by application instances, independent of host TZ. */
export function financialDay(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santo_Domingo", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(date);
}
export function financialDayStart(now = new Date()) {
  return new Date(`${financialDay(now)}T00:00:00-04:00`);
}
export function isFinanciallyOverdue(due: Date, now: Date) {
  return financialDay(due) < financialDay(now);
}
