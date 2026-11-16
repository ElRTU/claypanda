import type { Category, DataSource, Piece, PieceDraft } from "./types.ts";

// Modo demo: piezas de prueba en memoria. Nada se guarda al recargar.

const seed: [string, Category, string, string[]][] = [
  ["Clay Golem", "model", "A stubby guardian shaped from river clay.", ["entity", "boss"]],
  ["Bamboo Sentinel", "model", "Stands watch at the edge of the grove.", ["entity"]],
  ["Kiln Walker", "animation", "Walk, idle and wave cycles for a furnace-backed mob.", ["rig", "walk cycle"]],
  ["Leaf Sprite", "animation", "Looping idle with a gentle bob.", ["rig", "idle"]],
  ["Terracotta Set", "texture", "Three palette variants on one model.", ["variants"]],
  ["Moss Knight", "model", "Armor overgrown after a long sleep.", ["entity", "armor"]],
  ["Ember Pup", "animation", "A companion with too much energy.", ["pet"]],
  ["Glazed Relics", "texture", "Hand-placed pixels with emissive accents.", ["items"]],
];

let pieces: Piece[] = seed.map(([title, category, description, tags], i) => ({
  id: `demo-${i + 1}`,
  slug: title.toLowerCase().replace(/\s+/g, "-"),
  title,
  description,
  category,
  tags,
  modelUrl: null,
  modelFormat: null,
  posterUrl: null,
  published: true,
  featured: i === 0,
  sortOrder: i,
  createdAt: new Date(Date.UTC(2026, 10, 15 - i)).toISOString(),
  media: [],
  textures: [],
}));

const sorted = (list: Piece[]) => [...list].sort((a, b) => a.sortOrder - b.sortOrder);
const uid = () => crypto.randomUUID();

export const localSource: DataSource = {
  connected: false,
  async listPublished() {
    return sorted(pieces.filter((p) => p.published));
  },
  async getBySlug(slug) {
    return pieces.find((p) => p.slug === slug && p.published) ?? null;
  },
  async listAll() {
    return sorted(pieces);
  },
  async save(d: PieceDraft, onProgress) {
    const prev = pieces.find((p) => p.id === d.id);
    const isBb = d.modelFile?.name.toLowerCase().endsWith(".bbmodel");
    const next: Piece = {
      id: prev?.id ?? uid(),
      createdAt: prev?.createdAt ?? new Date().toISOString(),
      slug: d.slug,
      title: d.title,
      description: d.description,
      category: d.category,
      tags: d.tags,
      published: d.published,
      featured: d.featured,
      sortOrder: d.sortOrder,
      modelUrl: d.modelFile ? URL.createObjectURL(d.modelFile) : (prev?.modelUrl ?? null),
      modelFormat: d.modelFile ? (isBb ? "bbmodel" : "glb") : (prev?.modelFormat ?? null),
      posterUrl: d.posterFile ? URL.createObjectURL(d.posterFile) : (prev?.posterUrl ?? null),
      media: [
        ...(prev?.media ?? []).filter((m) => !d.removeMediaIds.includes(m.id)),
        ...d.newMedia.map((f) => ({
          id: uid(),
          kind: f.type.startsWith("video") ? ("video" as const) : ("image" as const),
          url: URL.createObjectURL(f),
        })),
      ],
      textures: [
        ...(prev?.textures ?? []).filter((t) => !d.removeTextureIds.includes(t.id)),
        ...d.newTextures.map((t) => ({ id: uid(), name: t.name, url: URL.createObjectURL(t.file) })),
      ],
    };
    onProgress?.("Saving", 1);
    pieces = prev ? pieces.map((p) => (p.id === prev.id ? next : p)) : [...pieces, next];
    return next;
  },
  async remove(id) {
    pieces = pieces.filter((p) => p.id !== id);
  },
  async getUserEmail() {
    return "demo@local";
  },
  async signIn() {},
  async signOut() {},
};
