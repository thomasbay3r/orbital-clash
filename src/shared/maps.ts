import { MapConfig, MapId } from "./types";
import { generateAsteroidVertices } from "./physics";

export const MAPS: Record<MapId, MapConfig> = {
  "nebula-station": {
    id: "nebula-station",
    name: "Nebula Station",
    width: 1600,
    height: 1200,
    gravityWells: [
      { id: "gw1", position: { x: 480, y: 600 }, strength: 1.0, radius: 160 },
      { id: "gw2", position: { x: 1120, y: 600 }, strength: 1.0, radius: 160 },
    ],
    asteroids: [],
    spawnPoints: [
      { x: 200, y: 200 },
      { x: 1400, y: 200 },
      { x: 200, y: 1000 },
      { x: 1400, y: 1000 },
      { x: 800, y: 150 },
      { x: 800, y: 1050 },
    ],
  },
  "asteroid-belt": {
    id: "asteroid-belt",
    name: "Asteroid Belt",
    width: 2000,
    height: 1500,
    gravityWells: [
      { id: "gw1", position: { x: 600, y: 450 }, strength: 0.8, radius: 140 },
      { id: "gw2", position: { x: 1400, y: 450 }, strength: 0.8, radius: 140 },
      { id: "gw3", position: { x: 1000, y: 1100 }, strength: 0.8, radius: 140 },
    ],
    asteroids: [
      { id: "a1", position: { x: 300, y: 300 }, radius: 40, vertices: generateAsteroidVertices(40, 1) },
      { id: "a2", position: { x: 800, y: 200 }, radius: 55, vertices: generateAsteroidVertices(55, 2) },
      { id: "a3", position: { x: 1300, y: 300 }, radius: 35, vertices: generateAsteroidVertices(35, 3) },
      { id: "a4", position: { x: 500, y: 750 }, radius: 50, vertices: generateAsteroidVertices(50, 4) },
      { id: "a5", position: { x: 1000, y: 700 }, radius: 60, vertices: generateAsteroidVertices(60, 5) },
      { id: "a6", position: { x: 1500, y: 800 }, radius: 45, vertices: generateAsteroidVertices(45, 6) },
      { id: "a7", position: { x: 400, y: 1100 }, radius: 38, vertices: generateAsteroidVertices(38, 7) },
      { id: "a8", position: { x: 1600, y: 1200 }, radius: 42, vertices: generateAsteroidVertices(42, 8) },
      { id: "a9", position: { x: 200, y: 700 }, radius: 30, vertices: generateAsteroidVertices(30, 9) },
      { id: "a10", position: { x: 1800, y: 500 }, radius: 48, vertices: generateAsteroidVertices(48, 10) },
    ],
    spawnPoints: [
      { x: 150, y: 150 },
      { x: 1850, y: 150 },
      { x: 150, y: 1350 },
      { x: 1850, y: 1350 },
      { x: 1000, y: 150 },
      { x: 1000, y: 1350 },
    ],
  },
  "the-singularity": {
    id: "the-singularity",
    name: "The Singularity",
    width: 1200,
    height: 1200,
    gravityWells: [
      { id: "gw1", position: { x: 600, y: 600 }, strength: 2.0, radius: 200 },
    ],
    asteroids: [],
    spawnPoints: [
      { x: 150, y: 150 },
      { x: 1050, y: 150 },
      { x: 150, y: 1050 },
      { x: 1050, y: 1050 },
    ],
  },
};
