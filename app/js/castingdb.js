// Casting data: metals/materials and mold processes.
// pour/melt °C, rho g/cm³, shrink = linear pattern allowance %, vshrink = volumetric liquid→solid shrink %,
// wall = min reliable wall (mm) {sand, inv(estment), perm(anent-ish molds)}, ratio = sprue:runner:gate
export const METALS = {
  fields: { name: "Field's metal (Bi-In-Sn)", melt: 62, pour: 90, rho: 7.88, shrink: 0, vshrink: 0, wall: { sand: 2, inv: 1, perm: 0.6 }, ratio: [1, 2, 2], note: "Non-toxic, melts in hot water. Great for testing molds." },
  bismuth: { name: "Rose's / bismuth alloy", melt: 98, pour: 140, rho: 9.6, shrink: 0, vshrink: -2, wall: { sand: 2, inv: 1, perm: 0.6 }, ratio: [1, 2, 2], note: "Expands slightly on cooling — fills detail very well." },
  pewter: { name: "Pewter (lead-free tin)", melt: 245, pour: 300, rho: 7.3, shrink: 0.5, vshrink: 3, wall: { sand: 2.5, inv: 1, perm: 0.8 }, ratio: [1, 2, 2], note: "Easy on a stove/torch. Good for jewelry, figures." },
  zinc: { name: "Zinc (Zamak 3)", melt: 385, pour: 430, rho: 6.6, shrink: 1.1, vshrink: 4, wall: { sand: 3, inv: 1.2, perm: 1 }, ratio: [1, 2, 2], note: "Don't overheat — zinc fumes are toxic above ~900 °C." },
  aluminum: { name: "Aluminum (A356 / cans)", melt: 615, pour: 720, rho: 2.68, shrink: 1.3, vshrink: 6.5, wall: { sand: 4, inv: 2, perm: 3 }, ratio: [1, 2, 2], note: "Most popular hobby metal. Degas and skim dross; cans make poor alloy." },
  silver: { name: "Sterling silver", melt: 893, pour: 1000, rho: 10.4, shrink: 1.2, vshrink: 5, wall: { sand: 3, inv: 0.6, perm: 2 }, ratio: [1, 1.5, 1.5], note: "Investment casting is standard. Flux to prevent firescale." },
  brass: { name: "Yellow brass", melt: 930, pour: 1050, rho: 8.5, shrink: 1.5, vshrink: 5.5, wall: { sand: 3.5, inv: 2, perm: 3 }, ratio: [1, 1.5, 1.5], note: "Zinc boils off if overheated — pour promptly." },
  bronze: { name: "Silicon / tin bronze", melt: 1000, pour: 1150, rho: 8.8, shrink: 1.5, vshrink: 5, wall: { sand: 3.5, inv: 2, perm: 3 }, ratio: [1, 1.5, 1.5], note: "Classic for art and bushings. Flows well." },
  copper: { name: "Pure copper", melt: 1085, pour: 1200, rho: 8.9, shrink: 2, vshrink: 4.5, wall: { sand: 5, inv: 3, perm: 4 }, ratio: [1, 1.5, 1.5], note: "Hard to cast — absorbs gas, poor fluidity. Bronze is easier." },
  iron: { name: "Gray cast iron", melt: 1180, pour: 1400, rho: 7.2, shrink: 1, vshrink: 1, wall: { sand: 5, inv: 4, perm: 5 }, ratio: [1, 1.3, 1.1], note: "Needs a strong furnace. Sand only." },
  steel: { name: "Carbon steel", melt: 1450, pour: 1600, rho: 7.85, shrink: 2, vshrink: 3, wall: { sand: 6, inv: 4, perm: 6 }, ratio: [1, 1.3, 1.1], note: "Industrial — beyond hobby furnaces." },
  wax: { name: "Casting wax", melt: 65, pour: 85, rho: 0.95, shrink: 1, vshrink: 6, wall: { sand: 2, inv: 1, perm: 0.6 }, ratio: [1, 2, 2], note: "For making wax patterns from a silicone mold." },
  resin: { name: "Epoxy / urethane resin", melt: 0, pour: 25, rho: 1.15, shrink: 0.3, vshrink: 2, wall: { sand: 2, inv: 1, perm: 0.6 }, ratio: [1, 2, 2], note: "Room temperature, not molten. Degas for bubble-free parts." },
};

// maxC = hottest material the mold survives; draft = recommended draft°; key = which wall table to use
export const PROCESSES = {
  sand: { name: "Sand casting (greensand / petrobond)", maxC: 1700, twoPart: true, mold: false, splitPattern: true, draft: 1.5, key: "sand", undercutsOK: false,
    tip: "Pattern is rammed into sand in a two-part flask (cope + drag). Needs draft on vertical walls and no undercuts." },
  lostpla: { name: "Lost-PLA (investment / plaster-silica)", maxC: 1200, twoPart: false, mold: false, key: "inv", undercutsOK: true, draft: 0,
    tip: "Print the gated pattern in PLA, invest in a flask, burn out the PLA (~730 °C), pour. Any shape works." },
  plaster: { name: "Plaster mold (two-part)", maxC: 1100, twoPart: true, mold: true, key: "perm", undercutsOK: false, draft: 1,
    tip: "Cast plaster halves around the pattern (or print the halves as a master). Must be bone-dry before pouring metal." },
  silicone: { name: "High-temp silicone mold", maxC: 320, twoPart: true, mold: true, key: "perm", undercutsOK: true, draft: 0,
    tip: "RTV silicone rated ~300–340 °C. Flexes, so small undercuts are fine. Low-melt metals, wax, resin." },
  printed: { name: "3D-printed mold (PETG / ASA)", maxC: 90, twoPart: true, mold: true, key: "perm", undercutsOK: false, draft: 1,
    tip: "Print the two mold halves directly. Only for Field's metal, wax-free low-melt alloys, and resin." },
};

export const FURNACES = [
  [100, "Hot water / hot plate (~100 °C)"],
  [450, "Stove / torch (~450 °C)"],
  [1100, "Small propane furnace (~1100 °C)"],
  [1300, "Propane / oil furnace (~1300 °C)"],
  [1700, "Induction / big furnace (1700 °C)"],
];
