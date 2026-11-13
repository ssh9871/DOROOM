export const operations = ['낯선 순찰', '어긋난 숲의 박자', '되풀이되는 명령', '마지막 동기화'] as const;
export const eliteSprites = ['patrol', 'irrigation', 'maintenance', 'hub'] as const;
export const endlessStages = [2, 5, 8, 9] as const;
export const speakers = { zero: '제로', rico: '리코', xilo: '자일로', codex: '코덱스', void: '보이드 단말', neiti: '네이티' } as const;
export type Dialogue = readonly [keyof typeof speakers, string, ('alert' | 'calm' | 'harmony')?];
export type Attack = 'single' | 'diagonal' | 'burst' | 'fan' | 'fixed' | 'fixed-double' | 'cross' | 'radial'
  | 'stop' | 'dash' | 'return-dash' | 'sweep' | 'spray' | 'barrier' | 'reinforce' | 'crane' | 'twin-radial'
  | 'open-fan' | 'split' | 'corridor' | 'ricochet';
export type Stage = {
  id: string; name: string; intro: string; bossName: string; objective: string;
  zone: number; reward: number; prop: string; pin: readonly [number, number];
  wave: readonly string[]; elite: readonly Attack[]; boss: readonly Attack[];
  start: readonly Dialogue[]; clear: readonly Dialogue[];
};

export const stages: readonly Stage[] = [
  {
    id: "1-1", name: "외곽 순찰로", bossName: "선두 순찰기", objective: "통로 확보",
    intro: "제로가 사파리 입구에서 같은 길을 도는 순찰기를 발견했다. 펫과 함께 안전 통로를 확보하자.",
    zone: 0, reward: 40, prop: "1-1-patrol-sign", pin: [20,68],
    wave: ["patrol-drone"], elite: ["dash"], boss: ["open-fan","single"],
    start: [
      ["zero","호버보드 준비됐어? 네 펫도 발판에 올라탔네. 저 순찰기, 아까도 이 표지판 앞을 지났어."],
      ["void","반복 경로 확인. 첫 임무는 선두 순찰기를 정화하고 입구를 확보하는 것입니다."],
    ],
    clear: [
      ["zero","좋아, 이번엔 표지판 앞에서 멈췄어. 이제 안전하게 지나갈 수 있겠다."],
      ["void","관리 초원에서도 같은 시간 간격의 방향 전환을 감지했습니다."],
    ],
  },
  {
    id: "1-2", name: "관리 초원", bossName: "초원 경비기", objective: "명령 시간대 확보",
    intro: "초원의 순찰기들이 같은 시각에 방향을 바꾼다. 보이드가 공통 명령을 추적한다.",
    zone: 0, reward: 50, prop: "1-2-fence", pin: [52,55],
    wave: ["mower"], elite: ["sweep"], boss: ["fixed-double","burst"],
    start: [
      ["zero","한 대가 방향을 틀면 저쪽 기계도 딱 맞춰 돌아. 신호를 같이 받는 걸까?"],
      ["void","초원 경비기의 동작 기록을 확보하면 명령이 들어온 시각을 대조할 수 있습니다."],
    ],
    clear: [
      ["void","전환 시각 일치. 사파리 관제소에도 같은 시각의 수신 기록이 있습니다."],
      ["zero","그럼 관제소에서 어떤 명령이 들어왔는지 확인해 보자."],
    ],
  },
  {
    id: "1-3", name: "사파리 관제소", bossName: "순찰 대장", objective: "오래된 제어 명령 발견",
    intro: "관제소 앞에 순찰 대장이 멈춰 서 있다. 첫 오류 기록을 확보할 마지막 지점이다.",
    zone: 0, reward: 60, prop: "1-3-control-antenna", pin: [83,38],
    wave: ["guard"], elite: ["cross"], boss: ["cross","burst"],
    start: [
      ["zero","순찰 대장이 관제소 문을 막고 있어. 저 기계가 길을 비켜주면 기록을 확인할 수 있겠어."],
      ["void","관제소 접속 대기. 순찰 대장의 상태를 안정시켜 주세요."],
    ],
    clear: [
      ["void","현재 운영표에 없는 옛 순찰 명령을 발견했습니다. 같은 명령 형식이 숲 관리로에서도 수신됐습니다."],
      ["zero","리코에게 기록을 보냈어. 이번에는 숲 쪽으로 가자."],
    ],
  },
  {
    id: "2-1", name: "숲 관리로", bossName: "운반 조정기", objective: "관리로 정상화",
    intro: "리코가 숲의 급수 순서가 어긋난 것을 확인했다. 운반로를 확보하면 흐름을 따라갈 수 있다.",
    zone: 1, reward: 70, prop: "2-1-forest-marker", pin: [17,66],
    wave: ["carrier"], elite: ["return-dash"], boss: ["return-dash","fan"],
    start: [
      ["rico","사파리 기록과 비교해 봤어. 이쪽 운반기는 분기 밸브가 열리기도 전에 출발하고 있어."],
      ["codex","물을 기다리는 나무가 있다. 먼저 관리로를 열어라."],
    ],
    clear: [
      ["rico","운반 순서는 맞췄어. 이제 분기점의 밸브가 언제 열리는지 확인할 수 있겠다."],
      ["codex","분기점에 네이티가 있다. 빛이 급해지면 먼저 주위를 살펴라."],
    ],
  },
  {
    id: "2-2", name: "급수 분기점", bossName: "분기 밸브기", objective: "급수 경로 복구",
    intro: "네이티가 급수 분기점에서 빛을 깜빡인다. 펫이 분사기의 이상 진동을 감지했다.",
    zone: 1, reward: 80, prop: "2-2-junction-valve", pin: [53,47],
    wave: ["sprayer"], elite: ["spray"], boss: ["cross","spray"],
    start: [
      ["neiti","노란빛이 짧게 깜빡이고 분기 밸브에서 물러난다.","alert"],
      ["codex","저 분사기가 움직일 때마다 네이티가 물러난다. 노즐이 돌아가는 방향을 살펴라."],
      ["rico","분기 밸브기를 정화하면 어느 쪽에서 다시 명령을 보내는지 볼 수 있어."],
    ],
    clear: [
      ["neiti","하늘빛이 일정해지고 밸브 곁에 천천히 다가간다.","calm"],
      ["codex","물이 낮은 뿌리까지 닿는군."],
      ["rico","급수는 돌아왔어. 제어 신호가 하모니아 연결 관리로 쪽에서 되돌아오고 있어."],
    ],
  },
  {
    id: "2-3", name: "하모니아 연결로", bossName: "급수 관리기", objective: "보조 제어망의 역류 경로 확인",
    intro: "숲에서 발생한 신호가 하모니아 연결 관리로를 통해 돌아온다. 급수 관리기의 제어 기록을 확인하자.",
    zone: 1, reward: 90, prop: "2-3-harmonia-marker", pin: [82,38],
    wave: ["carrier","sprayer"], elite: ["spray"], boss: ["cross","corridor","fan"],
    start: [
      ["rico","급수 관리기가 분기점으로 같은 명령을 되돌려 보내고 있어. 정화하면 다음 전송 지점을 확인할 수 있어."],
      ["codex","숲의 물길은 내가 지켜보마. 관리기를 살펴라."],
    ],
    clear: [
      ["rico","경로를 찾았어. 신호가 보조 제어망을 타고 관람차 정비 구역까지 이어져."],
      ["codex","이쪽 급수는 안정됐다. 나는 숲에 남아 물길을 살피겠다."],
    ],
  },
  {
    id: "3-1", name: "관람차 정비로", bossName: "정비 지휘기", objective: "반복 수신 로그 확보",
    intro: "방금 정화한 기계가 다시 움직인다. 자일로가 관람차 아래의 정비 기록을 공개했다.",
    zone: 2, reward: 100, prop: "3-1-ferris-support", pin: [18,62],
    wave: ["armored-worker"], elite: ["barrier"], boss: ["barrier","fixed-double"],
    start: [
      ["xilo","재개장 때 사용한 정비 기록을 공유했습니다. 방금 정화된 기계가 같은 지시를 다시 받은 시각도 표시해 뒀어요."],
      ["rico","정비 지휘기를 안정시키면 장비가 받은 명령과 정비 기록을 맞춰볼 수 있어."],
    ],
    clear: [
      ["void","정화 후 동일 명령 재수신 확인. 첫 수신 시각은 자재 이송장의 송신 기록과 일치합니다."],
      ["xilo","그 기록도 함께 열어 두겠습니다. 중계기부터 확인해 주세요."],
    ],
  },
  {
    id: "3-2", name: "자재 이송장", bossName: "증원 중계기", objective: "신호 발신 경로 확인",
    intro: "운반 라인에서 증원 신호가 계속 발신된다. 발신기를 정화해 이송장을 확보하자.",
    zone: 2, reward: 110, prop: "3-2-cargo-crates", pin: [48,49],
    wave: ["small-worker","relay"], elite: ["reinforce"], boss: ["burst","split"],
    start: [
      ["void","증원 호출 감지. 송신 위치는 이송장 안쪽 중계기입니다."],
      ["rico","중계기가 작업기를 계속 부르고 있어. 정화한 뒤 신호가 어디서 들어왔는지 거슬러 올라가자."],
    ],
    clear: [
      ["void","증원 호출 중단. 중계기 직전의 신호 경로는 크레인 작업장입니다."],
      ["rico","크레인 쪽 로그가 남아 있다면 이 명령을 처음 보낸 장치를 찾을 수 있어."],
    ],
  },
  {
    id: "3-3", name: "크레인 작업장", bossName: "운반 크레인", objective: "옛 동기화 장치 위치 특정",
    intro: "리코가 작업장 안쪽에서 동일한 신호를 찾았다. 크레인이 보낸 마지막 기록에 원점이 남아 있다.",
    zone: 2, reward: 120, prop: "3-3-crane-rail", pin: [83,45],
    wave: ["armored-worker","relay"], elite: ["burst"], boss: ["crane","ricochet"],
    start: [
      ["xilo","크레인 제어기에 송신 원본 주소를 남기는 기능이 있습니다. 장비가 안정되면 제가 마지막 기록을 열겠습니다."],
      ["rico","크레인이 움직이는 방향을 봐. 안전한 틈이 열리면 정화 펄스를 보내자."],
    ],
    clear: [
      ["void","송신 원본 주소 확인. 보조 제어 허브의 옛 동기화 장치입니다."],
      ["xilo","허브 도면을 팀에 공유했습니다. 중앙 장치까지 가는 동안 보조 송신부터 차단하죠."],
    ],
  },
  {
    id: "4-1", name: "허브 진입로", bossName: "허브 경비기", objective: "진입로 확보",
    intro: "보이드가 보조 제어 허브의 입구를 표시했다. 기존 구역의 기계들이 한곳에 모이고 있다.",
    zone: 3, reward: 130, prop: "4-1-hub-gate", pin: [18,60],
    wave: ["patrol-drone","carrier"], elite: ["return-dash"], boss: ["fan","radial","split"],
    start: [
      ["void","허브 입구에 사파리 순찰기와 숲 운반기가 모이고 있습니다. 진입로를 지도에 표시했습니다."],
      ["zero","펫이 벌써 고개를 돌렸어. 서두르지 말고 안전한 쪽부터 길을 열자."],
    ],
    clear: [
      ["void","진입로 확보. 송신 제어실 출입이 가능합니다."],
      ["zero","좋아, 너희가 길을 열어줬으니 리코와 자일로도 제어실로 들어갈 수 있어."],
    ],
  },
  {
    id: "4-2", name: "송신 제어실", bossName: "이중 송신기", objective: "보조 송신 차단",
    intro: "리코와 자일로가 송신 차단을 준비한다. 그동안 제어실의 중계기를 안정시켜야 한다.",
    zone: 3, reward: 140, prop: "4-2-signal-console", pin: [49,51],
    wave: ["sprayer","armored-worker"], elite: ["cross"], boss: ["cross","stop"],
    start: [
      ["xilo","좌우 송신 모듈을 모두 안정시키면 제가 보조 송신을 차단하겠습니다."],
      ["rico","두 모듈이 번갈아 신호를 보내고 있어. 마지막 송신 경로가 이 방을 지나가."],
    ],
    clear: [
      ["xilo","보조 송신을 차단했습니다. 중앙 장치의 연결도 확인했어요."],
      ["rico","이제 중앙 방어기만 정화하면, 반복 명령을 보내는 회선을 끊을 수 있어."],
    ],
  },
  {
    id: "4-3", name: "중앙 동기화실", bossName: "중앙 장치 방어기", objective: "반복 송신 종료 및 엔딩",
    intro: "중앙 장치가 방어 기계에 같은 명령을 보내고 있다. 펫과 함께 마지막 방어기를 정화하자.",
    zone: 3, reward: 150, prop: "4-3-central-core", pin: [82,43],
    wave: ["patrol-drone","carrier","sprayer","armored-worker","small-worker","relay"], elite: ["reinforce","burst"], boss: ["twin-radial","cross","fan"],
    start: [
      ["rico","방어기가 계속 같은 명령을 받고 있어. 네 펫이 반응하면 정화할 틈을 봐."],
      ["xilo","두 분이 방어기를 안정시키는 동안 차단을 준비하겠습니다. 정화 신호가 오면 바로 회선을 끊을게요."],
    ],
    clear: [
      ["void","방어기 정화 완료. 반복 송신이 종료되었습니다."],
      ["xilo","네 구역의 기록과 차단 절차를 공개하겠습니다. 다음 점검부터 함께 확인해요."],
      ["neiti","허브 지도 위에서 흰빛이 부드럽게 번진다.","harmony"],
      ["codex","숲의 물길이 평온하다. 이제 다시 함께 돌볼 수 있겠군."],
      ["zero","돌아온 걸 환영해. 오늘은 펫한테도 수고했다고 해 주자!"],
    ],
  },
];

export function canEnterStage(index: number, cleared: Readonly<Record<string, boolean>>, debug: boolean): boolean {
  const stage = stages[index];
  return !!stage && (debug || index === 0 || !!cleared[stage.id] || !!cleared[stages[index - 1]!.id]);
}

export function canEnterEndless(cleared: Readonly<Record<string, boolean>>, debug: boolean): boolean {
  return debug || !!cleared['4-3'];
}
