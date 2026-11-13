// Calendar dates stay YYYY-MM-DD internally; user-facing full dates use MM/DD/YYYY.
function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000-')) return false;
  const date = new Date(value + 'T00:00:00.000Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function formatCalendarDate(value: string): string {
  if (!isCalendarDate(value)) return value;
  return `${value.slice(5, 7)}/${value.slice(8, 10)}/${value.slice(0, 4)}`;
}

// Parse explicitly instead of relying on locale-dependent slash-date parsing.
export function parseDisplayDate(value: string): string | undefined {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value.trim());
  if (!match) return undefined;
  const canonical = `${match[3]}-${match[1]}-${match[2]}`;
  return isCalendarDate(canonical) ? canonical : undefined;
}

export function formatEventDate(value: string, timeZone?: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'Unavailable';
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      month: '2-digit', day: '2-digit', year: 'numeric', ...(timeZone ? { timeZone } : {}),
    }).formatToParts(date);
    const part = (type: string) => parts.find(item => item.type === type)?.value ?? '';
    return `${part('month')}/${part('day')}/${part('year').padStart(4, '0')}`;
  } catch { return 'Unavailable'; }
}
