import { COLORS } from "../../shared/constants";

export class Renderer {
  private ctx: CanvasRenderingContext2D;

  constructor(private canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Failed to get 2D context");
    this.ctx = ctx;
  }

  clear(): void {
    this.ctx.fillStyle = COLORS.background;
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
  }

  /** Placeholder rendering until game state is connected */
  drawPlaceholder(): void {
    const cx = this.canvas.width / 2;
    const cy = this.canvas.height / 2;

    // Title
    this.ctx.fillStyle = COLORS.ui;
    this.ctx.font = "bold 48px monospace";
    this.ctx.textAlign = "center";
    this.ctx.fillText("ORBITAL CLASH", cx, cy - 40);

    // Subtitle
    this.ctx.font = "18px monospace";
    this.ctx.fillStyle = COLORS.gravityWell;
    this.ctx.fillText("Engine initializing...", cx, cy + 10);

    // Draw decorative gravity well
    this.drawGravityWellEffect(cx, cy + 80, 60);
  }

  private drawGravityWellEffect(x: number, y: number, radius: number): void {
    const gradient = this.ctx.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, COLORS.gravityWell + "80");
    gradient.addColorStop(0.5, COLORS.gravityWell + "30");
    gradient.addColorStop(1, COLORS.gravityWell + "00");

    this.ctx.beginPath();
    this.ctx.arc(x, y, radius, 0, Math.PI * 2);
    this.ctx.fillStyle = gradient;
    this.ctx.fill();
  }
}
