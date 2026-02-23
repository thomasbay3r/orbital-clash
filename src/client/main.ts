import { Game } from "./game/game";
import { initLang } from "../shared/i18n";

initLang();

const canvas = document.getElementById("gameCanvas") as HTMLCanvasElement;
if (!canvas) {
  throw new Error("Canvas element not found");
}

const game = new Game(canvas);
game.start();

// Expose for E2E tests
(window as any).__game = game;
