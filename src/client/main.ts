import { Game } from "./game/game";

const canvas = document.getElementById("gameCanvas") as HTMLCanvasElement;
if (!canvas) {
  throw new Error("Canvas element not found");
}

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

window.addEventListener("resize", () => {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
});

const game = new Game(canvas);
game.start();
