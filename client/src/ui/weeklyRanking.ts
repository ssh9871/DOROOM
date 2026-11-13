const date = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'long', day: 'numeric' });

export function formatWeek(start: number, end: number): string {
  return `${date.format(start)} ~ ${date.format(end - 1)} (한국시간)`;
}
