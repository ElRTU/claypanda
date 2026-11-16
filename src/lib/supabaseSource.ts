import { createClient } from "@supabase/supabase-js";
import type { DataSource, Media, Piece, PieceDraft, Progress, TextureVariant } from "./types.ts";

// Esquema y políticas: supabase/schema.sql

interface PieceRow {
  id: string;
  slug: string;
  title: string;
  description: string;
  category: Piece["category"];
  tags: string[];
  model_path: string | null;
  model_format: Piece["modelFormat"];
  poster_path: string | null;
  published: boolean;
  featured: boolean;
  sort_order: number;
  created_at: string;
  piece_media: { id: string; kind: Media["kind"]; path: string; sort_order: number }[];
  texture_variants: { id: string; name: string; path: string }[];
}

const SELECT = "*, piece_media(*), texture_variants(*)";

function modelContentType(name: string): string {
  const n = name.toLowerCase();
  if (n.endsWith(".glb")) return "model/gltf-binary";
  if (n.endsWith(".gltf")) return "model/gltf+json";
  return "application/json";
}

export function createSupabaseSource(url: string, anonKey: string): DataSource {
  const sb = createClient(url, anonKey);
  const publicUrl = (bucket: string, path: string) => `${url}/storage/v1/object/public/${bucket}/${path}`;

  const toPiece = (r: PieceRow): Piece => ({
    id: r.id,
    slug: r.slug,
    title: r.title,
    description: r.description,
    category: r.category,
    tags: r.tags ?? [],
    modelUrl: r.model_path ? publicUrl("models", r.model_path) : null,
    modelFormat: r.model_format,
    posterUrl: r.poster_path ? publicUrl("media", r.poster_path) : null,
    published: r.published,
    featured: r.featured,
    sortOrder: r.sort_order,
    createdAt: r.created_at,
    media: [...(r.piece_media ?? [])]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((m) => ({ id: m.id, kind: m.kind, url: publicUrl("media", m.path) })),
    textures: (r.texture_variants ?? []).map(
      (t): TextureVariant => ({ id: t.id, name: t.name, url: publicUrl("media", t.path) }),
    ),
  });

  // Subida por XHR para tener progreso real (supabase-js no lo expone).
  async function upload(bucket: string, path: string, file: File, contentType: string, onFraction: (f: number) => void) {
    const { data } = await sb.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error("Your session expired. Sign in again.");
    await new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", `${url}/storage/v1/object/${bucket}/${path}`);
      xhr.setRequestHeader("authorization", `Bearer ${token}`);
      xhr.setRequestHeader("apikey", anonKey);
      xhr.setRequestHeader("content-type", contentType);
      xhr.setRequestHeader("cache-control", "max-age=31536000");
      xhr.upload.onprogress = (e) => e.lengthComputable && onFraction(e.loaded / e.total);
      xhr.onload = () =>
        xhr.status < 300 ? resolve() : reject(new Error(`Upload of ${file.name} failed (${xhr.status}).`));
      xhr.onerror = () => reject(new Error(`Upload of ${file.name} failed. Check your connection.`));
      xhr.send(file);
    });
  }

  const safeName = (name: string) => name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(-80);
  const fail = (error: { message: string } | null) => {
    if (error) throw new Error(error.message);
  };

  async function fetchRows(onlyPublished: boolean): Promise<Piece[]> {
    let q = sb.from("pieces").select(SELECT).order("sort_order");
    if (onlyPublished) q = q.eq("published", true);
    const { data, error } = await q;
    fail(error);
    return ((data ?? []) as PieceRow[]).map(toPiece);
  }

  return {
    connected: true,
    listPublished: () => fetchRows(true),
    listAll: () => fetchRows(false),

    async getBySlug(slug) {
      const { data, error } = await sb.from("pieces").select(SELECT).eq("slug", slug).eq("published", true).maybeSingle();
      fail(error);
      return data ? toPiece(data as PieceRow) : null;
    },

    async save(d: PieceDraft, onProgress?: Progress) {
      const id = d.id ?? crypto.randomUUID();
      const jobs: { label: string; run: (f: (x: number) => void) => Promise<void> }[] = [];
      const patch: Record<string, unknown> = {};
      const stale: { bucket: string; path: string }[] = [];

      let prev: PieceRow | null = null;
      if (d.id) {
        const { data, error } = await sb.from("pieces").select(SELECT).eq("id", d.id).single();
        fail(error);
        prev = data as PieceRow;
      }

      if (d.modelFile) {
        const file = d.modelFile;
        const path = `${id}/${crypto.randomUUID()}-${safeName(file.name)}`;
        patch.model_path = path;
        patch.model_format = file.name.toLowerCase().endsWith(".bbmodel") ? "bbmodel" : "glb";
        jobs.push({ label: file.name, run: (f) => upload("models", path, file, modelContentType(file.name), f) });
        if (prev?.model_path) stale.push({ bucket: "models", path: prev.model_path });
      }
      if (d.posterFile) {
        const file = d.posterFile;
        const path = `${id}/poster-${crypto.randomUUID()}-${safeName(file.name)}`;
        patch.poster_path = path;
        jobs.push({ label: file.name, run: (f) => upload("media", path, file, file.type, f) });
        if (prev?.poster_path) stale.push({ bucket: "media", path: prev.poster_path });
      }
      const mediaRows = d.newMedia.map((file, i) => {
        const path = `${id}/${crypto.randomUUID()}-${safeName(file.name)}`;
        jobs.push({ label: file.name, run: (f) => upload("media", path, file, file.type, f) });
        return {
          piece_id: id,
          kind: file.type.startsWith("video") ? "video" : "image",
          path,
          sort_order: (prev?.piece_media.length ?? 0) + i,
        };
      });
      const textureRows = d.newTextures.map(({ name, file }) => {
        const path = `${id}/tex-${crypto.randomUUID()}-${safeName(file.name)}`;
        jobs.push({ label: file.name, run: (f) => upload("media", path, file, file.type, f) });
        return { piece_id: id, name, path };
      });

      for (let i = 0; i < jobs.length; i++) {
        const job = jobs[i];
        await job.run((f) => onProgress?.(job.label, (i + f) / jobs.length));
      }
      onProgress?.("Saving", 1);

      fail(
        (
          await sb.from("pieces").upsert({
            id,
            slug: d.slug,
            title: d.title,
            description: d.description,
            category: d.category,
            tags: d.tags,
            published: d.published,
            featured: d.featured,
            sort_order: d.sortOrder,
            ...patch,
          })
        ).error,
      );
      if (mediaRows.length) fail((await sb.from("piece_media").insert(mediaRows)).error);
      if (textureRows.length) fail((await sb.from("texture_variants").insert(textureRows)).error);

      if (prev) {
        for (const m of prev.piece_media.filter((m) => d.removeMediaIds.includes(m.id)))
          stale.push({ bucket: "media", path: m.path });
        for (const t of prev.texture_variants.filter((t) => d.removeTextureIds.includes(t.id)))
          stale.push({ bucket: "media", path: t.path });
        if (d.removeMediaIds.length) fail((await sb.from("piece_media").delete().in("id", d.removeMediaIds)).error);
        if (d.removeTextureIds.length)
          fail((await sb.from("texture_variants").delete().in("id", d.removeTextureIds)).error);
      }
      // Los archivos reemplazados se borran al final; si falla, queda un archivo huérfano, no datos rotos.
      for (const bucket of ["models", "media"]) {
        const paths = stale.filter((s) => s.bucket === bucket).map((s) => s.path);
        if (paths.length) await sb.storage.from(bucket).remove(paths);
      }

      const { data, error } = await sb.from("pieces").select(SELECT).eq("id", id).single();
      fail(error);
      return toPiece(data as PieceRow);
    },

    async remove(id) {
      const { data, error } = await sb.from("pieces").select(SELECT).eq("id", id).single();
      fail(error);
      const row = data as PieceRow;
      fail((await sb.from("pieces").delete().eq("id", id)).error);
      if (row.model_path) await sb.storage.from("models").remove([row.model_path]);
      const media = [row.poster_path, ...row.piece_media.map((m) => m.path), ...row.texture_variants.map((t) => t.path)];
      const paths = media.filter((p): p is string => !!p);
      if (paths.length) await sb.storage.from("media").remove(paths);
    },

    async getUserEmail() {
      const { data } = await sb.auth.getSession();
      return data.session?.user.email ?? null;
    },
    async signIn(email, password) {
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw new Error("Wrong email or password.");
    },
    async signOut() {
      await sb.auth.signOut();
    },
  };
}
