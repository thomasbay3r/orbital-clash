import { Renderer } from "../rendering/renderer";
import { InputHandler } from "./input";
import { PlayerInput } from "../../shared/types";

export class Game {
  private renderer: Renderer;
  private input: InputHandler;
  private lastTime = 0;
  private running = false;

  constructor(private canvas: HTMLCanvasElement) {
    this.renderer = new Renderer(canvas);
    this.input = new InputHandler(canvas);
  }

  start(): void {
    this.running = true;
    this.lastTime = performance.now();
    requestAnimationFrame((t) => this.loop(t));
  }

  stop(): void {
    this.running = false;
  }

  private loop(time: number): void {
    if (!this.running) return;

    const dt = (time - this.lastTime) / 1000;
    this.lastTime = time;

    this.update(dt);
    this.render();

    requestAnimationFrame((t) => this.loop(t));
  }

  private update(_dt: number): void {
    const _input: PlayerInput = this.input.getInput();
    // TODO: Send input to server, apply client-side prediction
  }

  private render(): void {
    this.renderer.clear();
    // TODO: Render game state (gravity wells, ships, projectiles, UI)
    this.renderer.drawPlaceholder();
  }
}
