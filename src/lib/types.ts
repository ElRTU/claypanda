export type Category = "model" | "animation" | "texture";
export type ModelFormat = "glb" | "bbmodel";

export interface Media {
  id: string;
  kind: "image" | "video";
  url: string;
}

export interface TextureVariant {
  id: string;
  name: string;
  url: string;
}

export interface Piece {
  id: string;
  slug: string;
  title: string;
  description: string;
  category: Category;
  tags: string[];
  /** null = aún sin archivo; el visor muestra el modelo de prueba */
  modelUrl: string | null;
  modelFormat: ModelFormat | null;
  posterUrl: string | null;
  published: boolean;
  featured: boolean;
  sortOrder: number;
  createdAt: string;
  media: Media[];
  textures: TextureVariant[];
}

/** Lo que edita el formulario del dashboard. Los File son subidas nuevas. */
export interface PieceDraft {
  id?: string;
  title: string;
  slug: string;
  description: string;
  category: Category;
  tags: string[];
  published: boolean;
  featured: boolean;
  sortOrder: number;
  modelFile?: File | null;
  posterFile?: File | null;
  newMedia: File[];
  newTextures: { name: string; file: File }[];
  removeMediaIds: string[];
  removeTextureIds: string[];
}

export type Progress = (label: string, fraction: number) => void;

export interface DataSource {
  /** false = modo demo sin Supabase: nada se guarda */
  readonly connected: boolean;
  listPublished(): Promise<Piece[]>;
  getBySlug(slug: string): Promise<Piece | null>;
  listAll(): Promise<Piece[]>;
  save(draft: PieceDraft, onProgress?: Progress): Promise<Piece>;
  remove(id: string): Promise<void>;
  getUserEmail(): Promise<string | null>;
  signIn(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
}

export const LIMITS = {
  modelBytes: 50 * 1024 * 1024,
  imageBytes: 10 * 1024 * 1024,
  videoBytes: 100 * 1024 * 1024,
  modelExt: [".glb", ".gltf", ".bbmodel"],
  imageTypes: ["image/png", "image/jpeg", "image/webp", "image/gif"],
  videoTypes: ["video/mp4", "video/webm"],
};

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}
