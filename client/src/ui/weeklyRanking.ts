const date = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'long', day: 'numeric' });

export function formatWeek(start: number, end: number): string {
  return `${date.format(start)} ~ ${date.format(end - 1)} (한국시간)`;
}

export function formatRankingWeek(weekStart: string): string {
  const start = Date.parse(`${weekStart}T00:00:00+09:00`);
  return formatWeek(start, start + 7 * 86_400_000);
}
