/**
 * 키보드 상태 관리.
 * - 눌린 상태(held): 이동처럼 "누르고 있는 동안" 필요한 입력
 * - 방금 눌림(pressed): 시작/일시정지처럼 "한 번만" 필요한 입력
 */
export class Input {
  private readonly held = new Set<string>();
  private readonly pressed = new Set<string>();
  private attachedCanvas: HTMLCanvasElement | null = null;
  private pointerHandler: ((event: MouseEvent) => void) | null = null;

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    // 방향키/스페이스로 페이지가 스크롤되지 않도록 막습니다.
    if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
    if (!e.repeat) this.pressed.add(e.code);
    this.held.add(e.code);
  };

  private readonly onKeyUp = (e: KeyboardEvent): void => {
    this.held.delete(e.code);
  };

  private readonly onBlur = (): void => {
    this.held.clear();
  };

  attach(canvas?: HTMLCanvasElement, onPointerDown?: (event: MouseEvent) => void): void {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    if (canvas && onPointerDown) {
      this.attachedCanvas = canvas;
      this.pointerHandler = onPointerDown;
      canvas.addEventListener('mousedown', this.pointerHandler);
    }
  }

  detach(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    if (this.attachedCanvas && this.pointerHandler) {
      this.attachedCanvas.removeEventListener('mousedown', this.pointerHandler);
    }
    this.attachedCanvas = null;
    this.pointerHandler = null;
    this.held.clear();
    this.pressed.clear();
  }

  get left(): boolean { return this.held.has('ArrowLeft') || this.held.has('KeyA'); }
  get right(): boolean { return this.held.has('ArrowRight') || this.held.has('KeyD'); }
  get up(): boolean { return this.held.has('ArrowUp') || this.held.has('KeyW'); }
  get down(): boolean { return this.held.has('ArrowDown') || this.held.has('KeyS'); }
  /** Shift: 느리게 이동(정밀 회피) */
  get focus(): boolean { return this.held.has('ShiftLeft') || this.held.has('ShiftRight'); }

  /** 이번 프레임에 새로 눌린 키인지 */
  wasPressed(...codes: string[]): boolean {
    return codes.some((code) => this.pressed.has(code));
  }

  /** 프레임 끝에서 호출해 "방금 눌림" 상태를 비웁니다. */
  endFrame(): void {
    this.pressed.clear();
  }
}
