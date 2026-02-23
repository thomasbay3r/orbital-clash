import { PlayerInput } from "../../shared/types";

export class InputHandler {
  private keys: Set<string> = new Set();
  private mouseX = 0;
  private mouseY = 0;
  private mouseDown = false;
  private rightMouseDown = false;
  private tick = 0;

  // Menu callbacks
  onKeyPress: ((key: string) => void) | null = null;
  onMouseClick: ((x: number, y: number) => void) | null = null;

  constructor(canvas: HTMLCanvasElement) {
    window.addEventListener("keydown", (e) => {
      const key = e.key.toLowerCase();
      // Prevent browser default for Tab (focus shift) and Backspace (history nav)
      if (key === "tab") e.preventDefault();
      this.keys.add(key);
      if (this.onKeyPress) this.onKeyPress(key);
    });

    window.addEventListener("keyup", (e) => {
      this.keys.delete(e.key.toLowerCase());
    });

    canvas.addEventListener("mousemove", (e) => {
      this.mouseX = e.clientX;
      this.mouseY = e.clientY;
    });

    canvas.addEventListener("mousedown", (e) => {
      if (e.button === 0) {
        this.mouseDown = true;
        if (this.onMouseClick) this.onMouseClick(e.clientX, e.clientY);
      }
      if (e.button === 2) this.rightMouseDown = true;
    });

    canvas.addEventListener("mouseup", (e) => {
      if (e.button === 0) this.mouseDown = false;
      if (e.button === 2) this.rightMouseDown = false;
    });

    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  }

  getInput(): PlayerInput {
    const aimAngle = Math.atan2(
      this.mouseY - window.innerHeight / 2,
      this.mouseX - window.innerWidth / 2,
    );

    return {
      up: this.keys.has("w"),
      down: this.keys.has("s"),
      left: this.keys.has("a"),
      right: this.keys.has("d"),
      boost: this.keys.has("shift"),
      shoot: this.mouseDown,
      special: this.rightMouseDown || this.keys.has(" "),
      aimAngle,
      tick: this.tick++,
    };
  }

  isKeyDown(key: string): boolean {
    return this.keys.has(key);
  }

  getMouseX(): number { return this.mouseX; }
  getMouseY(): number { return this.mouseY; }
}
