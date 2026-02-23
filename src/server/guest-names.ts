const PREFIXES = [
  "Komet", "Nebula", "Pulsar", "Quasar", "Nova", "Meteor",
  "Stellar", "Astral", "Orbital", "Cosmic", "Solar", "Lunar",
  "Plasma", "Photon", "Neutron", "Zenith", "Vortex", "Eclipse",
];

export function generateGuestName(): string {
  const prefix = PREFIXES[Math.floor(Math.random() * PREFIXES.length)];
  const number = Math.floor(1000 + Math.random() * 9000);
  return `${prefix}_${number}`;
}
