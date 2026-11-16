// Texto fijo del sitio público (en inglés). Las piezas del portafolio vienen de src/lib/data.ts.
// PROVISIONAL: textos y enlaces a confirmar con ClayPanda.

export const studio = {
  name: "ClayPanda",
  logo: "/brand/logo.png",
  discord: "", // PROVISIONAL: enlace de invitación
  x: "", // PROVISIONAL: perfil de X
  email: "", // PROVISIONAL
};

export const nav = [
  { label: "Work", href: "/#work" },
  { label: "Viewer", href: "/#viewer" },
  { label: "Studio", href: "/#studio" },
];

export const hero = {
  eyebrow: "Minecraft art studio",
  lead: "We create",
  rotating: ["models", "animations", "textures"],
  body: "Creatures, gear and worlds for mods, servers and marketplace. Pick a letter and take it apart.",
  cta: { label: "See the work", href: "#work" },
};

export const marquee = ["Models", "Animations", "Textures", "Rigs", "Entities", "Items"];

export const work = {
  eyebrow: "Portfolio",
  title: "Fresh from the kiln",
  filters: [
    { id: "all", label: "All" },
    { id: "model", label: "Models" },
    { id: "animation", label: "Animations" },
    { id: "texture", label: "Textures" },
  ] as const,
  more: "Load more",
  empty: "Nothing here yet. New pieces are on the way.",
};

export const showcase = {
  eyebrow: "3D viewer",
  title: "Turn it around",
  steps: [
    { title: "Drag to rotate", body: "Every model is the real in-game asset, not a render." },
    { title: "Play the animations", body: "Switch between clips and scrub the speed." },
    { title: "Swap the textures", body: "See each variant on the same model." },
  ],
};

export const about = {
  eyebrow: "The studio",
  title: "Small team, big blocks",
  body: "ClayPanda is a studio of modelers, animators and texture artists building for Minecraft. We take a piece from concept to an asset that is ready to drop into your project.",
  services: [
    { title: "3D models", body: "Entities, items, blocks and armor, built to the pixel grid." },
    { title: "Animations", body: "Idle, walk, attack and custom clips, ready for your mod or resource pack." },
    { title: "Textures", body: "Hand-placed pixels, variants and emissive layers." },
  ],
};

export const contact = {
  title: "Let's make something",
  body: "Tell us what you are building.",
};
