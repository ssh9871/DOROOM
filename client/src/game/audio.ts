const audioRoot = '/assets/minigame/audio/';
const storageKey = 'doroom.minigame.audio';

export const zoneMusic = ['zone-1', 'zone-2', 'zone-3', 'zone-4'] as const;
type Music = 'lobby' | 'boss' | 'ending' | typeof zoneMusic[number];

export const soundFiles = {
  click: 's01', launch: 's02', playerShot: 's03', enemyHit: 's04', damage: 's05',
  absorb: 's06', enemyShot: 's07', purify: 's08', eliteWarning: 's09', bossWarning: 's10',
  bossEnter: 's11', laserWarning: 's12', phaseTwo: 's13', reinforce: 's14', shield: 's15',
  clear: 's16', 'rapid-fire': 's17', heal: 's18', victory: 's19', retreat: 's20', reward: 's22',
} as const;

export type SoundCue = keyof typeof soundFiles;
export type AudioChannel = 'bgm' | 'sfx';
type Level = { volume: number; muted: boolean };

const frequent: Partial<Record<SoundCue, { gain: number; interval: number }>> = {
  playerShot: { gain: 0.48, interval: 0.075 },
  enemyHit: { gain: 0.62, interval: 0.09 },
  absorb: { gain: 0.65, interval: 0.12 },
  enemyShot: { gain: 0.48, interval: 0.15 },
  purify: { gain: 0.78, interval: 0.18 },
};

function readLevels(): Record<AudioChannel, Level> {
  let saved: Partial<Record<AudioChannel, Partial<Level>>> | undefined;
  try { saved = JSON.parse(localStorage.getItem(storageKey) ?? 'null'); } catch { /* Use defaults. */ }
  const read = (channel: AudioChannel): Level => {
    const value = saved?.[channel];
    return {
      volume: typeof value?.volume === 'number' && value.volume >= 0 && value.volume <= 100 ? value.volume : 50,
      muted: value?.muted === true,
    };
  };
  return { bgm: read('bgm'), sfx: read('sfx') };
}

export class MinigameAudio {
  private readonly levels = readLevels();
  private readonly player = new Audio();
  private readonly loader = new AbortController();
  private readonly buffers = new Map<SoundCue, AudioBuffer>();
  private readonly voices = new Map<SoundCue, { source: AudioBufferSourceNode; start: number }>();
  private context?: AudioContext;
  private channels?: Record<AudioChannel, GainNode>;
  private track?: Music;
  private paused = false;
  private ducked = false;

  level(channel: AudioChannel): Readonly<Level> { return this.levels[channel]; }

  setVolume(channel: AudioChannel, volume: number): void {
    this.levels[channel].volume = volume;
    this.saveLevels();
  }

  toggleMute(channel: AudioChannel): void {
    this.levels[channel].muted = !this.levels[channel].muted;
    this.saveLevels();
  }

  private saveLevels(): void {
    try { localStorage.setItem(storageKey, JSON.stringify(this.levels)); } catch { /* Keep the session values. */ }
    this.updateGains();
  }

  unlock(): void {
    if (this.loader.signal.aborted) return;
    if (!this.context) {
      let context: AudioContext;
      try { context = this.context = new AudioContext(); } catch { return; }
      const limit = context.createDynamicsCompressor();
      limit.threshold.value = -9;
      limit.ratio.value = 8;
      limit.connect(context.destination);
      const bgm = context.createGain();
      const sfx = context.createGain();
      bgm.gain.value = sfx.gain.value = 0;
      this.channels = { bgm, sfx };
      bgm.connect(limit);
      sfx.connect(limit);
      context.createMediaElementSource(this.player).connect(bgm);
      this.updateGains();
      for (const [cue, file] of Object.entries(soundFiles)) {
        void fetch(`${audioRoot}${file}.wav`, { signal: this.loader.signal }).then(response => {
          if (!response.ok) throw new Error(`Audio ${response.status}`);
          return response.arrayBuffer();
        }).then(bytes => context.decodeAudioData(bytes)).then(buffer => {
          if (!this.loader.signal.aborted) this.buffers.set(cue as SoundCue, buffer);
        }).catch(() => {});
      }
    }
    if (this.context.state !== 'running') void this.context.resume().catch(() => {});
    this.playMusic();
  }

  setMusic(track?: Music): void {
    if (track === this.track) return;
    this.track = track;
    this.player.pause();
    if (track) {
      this.player.src = `${audioRoot}${track}.ogg`;
      this.player.loop = track !== 'ending';
      this.playMusic();
    } else {
      this.player.removeAttribute('src');
      this.player.load();
    }
  }

  setPaused(paused: boolean): void {
    if (paused === this.paused) return;
    this.paused = paused;
    if (paused) {
      this.player.pause();
      this.stopEffects();
    } else this.playMusic();
  }

  setDucked(ducked: boolean): void {
    if (ducked === this.ducked) return;
    this.ducked = ducked;
    this.updateGains();
  }

  private playMusic(): void {
    if (this.context && this.track && !this.paused && this.player.paused && !this.player.ended)
      void this.player.play().catch(() => {});
  }

  private updateGains(): void {
    if (!this.channels) return;
    for (const channel of ['bgm', 'sfx'] as const) {
      const { volume, muted } = this.levels[channel];
      const gain = muted ? 0 : volume / 100 * (channel === 'bgm' && this.ducked ? 0.45 : 1);
      const { context } = this.channels[channel];
      this.channels[channel].gain.setTargetAtTime(gain, context.currentTime, 0.02);
    }
  }

  readonly effect = (cue: SoundCue): number => {
    const context = this.context;
    const buffer = this.buffers.get(cue);
    const { muted, volume } = this.levels.sfx;
    if (this.paused || muted || !volume || !buffer || context?.state !== 'running') return 0;

    const previous = this.voices.get(cue);
    const mix = frequent[cue];
    const now = context.currentTime;
    if (previous && now - previous.start < (mix?.interval ?? 0.12)) return 0;
    previous?.source.stop();
    const source = context.createBufferSource();
    const gain = context.createGain();
    source.buffer = buffer;
    gain.gain.value = mix?.gain ?? 1;
    source.connect(gain).connect(this.channels!.sfx);
    this.voices.set(cue, { source, start: now });
    source.onended = () => {
      source.disconnect();
      gain.disconnect();
      if (this.voices.get(cue)?.source === source) this.voices.delete(cue);
    };
    source.start();
    return buffer.duration;
  };

  stopEffects(): void {
    for (const { source } of this.voices.values()) source.stop();
    this.voices.clear();
  }

  dispose(): void {
    this.loader.abort();
    this.stopEffects();
    this.setMusic();
    if (this.context) void this.context.close().catch(() => {});
  }
}
