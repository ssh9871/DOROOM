import { eliteSprites, type Stage } from './stages';

type Frame = {
  frame: { x: number; y: number; w: number; h: number };
  duration: number;
};
type Sheet = {
  frames: Frame[];
  meta: { frameTags: { name: string; from: number; to: number }[] };
};
type Sprite = { image: HTMLImageElement; sheet?: Sheet };

export const asset = (key: string) => `/assets/minigame/${key}.png`;
const loaded = new Map<string, Sprite>();
const requests = new Map<string, Promise<void>>();

export function loadSprite(key: string, animated = false): Promise<void> {
  const existing = requests.get(key);
  if (existing) return existing;
  const image = new Image();
  image.src = asset(key);
  const sheet = animated ? fetch(`/assets/minigame/${key}.json`).then(response => {
    if (!response.ok) throw new Error(`Missing sprite sheet: ${key}`);
    return response.json() as Promise<Sheet>;
  }) : undefined;
  const pending = Promise.all([image.decode(), sheet]).then(([, data]) => {
    loaded.set(key, { image, sheet: data });
  }).catch(error => {
    requests.delete(key);
    throw error;
  });
  requests.set(key, pending);
  return pending;
}

export const areaImage = (zone: number, kind: 'map' | 'battle') => `${kind === 'map' ? 'maps' : 'backgrounds'}/${kind}-0${zone + 1}`;

export function loadBattle(stages: readonly Stage[]) {
  const staticKeys = ['pets/hover-platform', 'projectiles/purification-pulse', 'projectiles/enemy-basic',
    'projectiles/enemy-aimed', 'projectiles/enemy-spray', 'projectiles/hp-potion'];
  const sheets = ['player/hoverboard', 'player/thruster', 'pets/pet-cat-001', 'enemies/enemy-small-worker',
    ...['bullet-clear', 'enemy-barrier', 'enemy-reinforce', 'heal', 'hit-spark', 'purify', 'rapid-fire', 'shield'].map(id => `effects/fx-${id}`)];
  for (const stage of stages) {
    staticKeys.push(areaImage(stage.zone, 'battle'), `props/${stage.prop}`);
    sheets.push(`bosses/boss-${stage.id}`, `enemies/elite-${eliteSprites[stage.zone]}`,
      ...stage.wave.map(enemy => `enemies/enemy-${enemy}`));
  }
  return Promise.all([...new Set(staticKeys)].map(key => loadSprite(key))
    .concat([...new Set(sheets)].map(key => loadSprite(key, true))));
}

export function drawSprite(
  ctx: CanvasRenderingContext2D, key: string, x: number, y: number,
  options: { tag?: string; time?: number; scale?: number; width?: number; height?: number } = {},
): boolean {
  const sprite = loaded.get(key);
  if (!sprite) return false;
  const { image, sheet } = sprite;
  const tag = sheet?.meta.frameTags.find(item => item.name === options.tag) ?? sheet?.meta.frameTags[0];
  let frame = { x: 0, y: 0, w: image.naturalWidth, h: image.naturalHeight };
  if (sheet && tag) {
    let duration = 0;
    for (let i = tag.from; i <= tag.to; i++) duration += sheet.frames[i]!.duration;
    let ms = (options.time ?? 0) * 1000 % duration;
    for (let i = tag.from; i <= tag.to; i++) {
      const current = sheet.frames[i]!;
      frame = current.frame;
      if (ms < current.duration) break;
      ms -= current.duration;
    }
  }
  const width = options.width ?? frame.w * (options.scale ?? 2);
  const height = options.height ?? frame.h * (options.scale ?? 2);
  ctx.drawImage(image, frame.x, frame.y, frame.w, frame.h,
    Math.round(x - width / 2), Math.round(y - height / 2), Math.round(width), Math.round(height));
  return true;
}
