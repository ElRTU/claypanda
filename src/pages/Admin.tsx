import { type FormEvent, lazy, Suspense, useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { studio } from "../content.ts";
import { data } from "../lib/data.ts";
import { type Category, LIMITS, type Piece, type PieceDraft, slugify } from "../lib/types.ts";
import "../styles/admin.css";

const Viewer = lazy(() => import("../components/viewer/Viewer.tsx"));

const mb = (bytes: number) => `${Math.round(bytes / 1024 / 1024)} MB`;
const message = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong. Try again.");

export default function Admin() {
  const [email, setEmail] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    document.title = "Dashboard — ClayPanda";
    data.getUserEmail().then(setEmail, () => setEmail(null));
  }, []);

  if (email === undefined) return null;
  if (email === null) return <Login onDone={setEmail} />;
  return (
    <Dashboard
      email={email}
      onSignOut={async () => {
        await data.signOut();
        setEmail(null);
      }}
    />
  );
}

function Login({ onDone }: { onDone: (email: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const email = String(form.get("email"));
    setBusy(true);
    setError("");
    try {
      await data.signIn(email, String(form.get("password")));
      onDone(email);
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="admin admin--login">
      <form className="panel login" onSubmit={submit}>
        <img src={studio.logo} alt="" width={72} height={72} />
        <h1 className="heading">Team login</h1>
        <label>
          Email
          <input name="email" type="email" autoComplete="username" required />
        </label>
        <label>
          Password
          <input name="password" type="password" autoComplete="current-password" required />
        </label>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button className="btn btn--fill" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
        <Link className="caption" to="/">
          ← Back to site
        </Link>
      </form>
    </main>
  );
}

function Dashboard({ email, onSignOut }: { email: string; onSignOut: () => void }) {
  const [pieces, setPieces] = useState<Piece[] | null>(null);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<Piece | "new" | null>(null);

  const reload = () => data.listAll().then(setPieces, (e) => setError(message(e)));
  useEffect(() => {
    reload();
  }, []);

  return (
    <main className="admin">
      <header className="admin__head">
        <Link className="nav__brand" to="/">
          <img src={studio.logo} alt="" width={40} height={40} />
          {studio.name}
        </Link>
        <div className="admin__user">
          {!data.connected && <span className="badge badge--coral">Demo mode · nothing is saved</span>}
          {data.connected && <span className="caption">{email}</span>}
          <Link className="btn btn--sm" to="/">
            View site
          </Link>
          {data.connected && (
            <button className="btn btn--sm" onClick={onSignOut}>
              Sign out
            </button>
          )}
        </div>
      </header>

      {editing ? (
        <Editor
          key={editing === "new" ? "new" : editing.id}
          piece={editing === "new" ? null : editing}
          all={pieces ?? []}
          onClose={(changed) => {
            setEditing(null);
            if (changed) reload();
          }}
        />
      ) : (
        <>
          <div className="admin__title">
            <h1 className="heading">Pieces</h1>
            <button className="btn btn--fill" onClick={() => setEditing("new")}>
              + New piece
            </button>
          </div>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          {!pieces && !error && <p className="caption">Loading…</p>}
          {pieces?.length === 0 && <p>No pieces yet. Add the first one.</p>}
          <ul className="rows">
            {pieces?.map((p) => (
              <li key={p.id} className="panel row">
                <div className="row__main">
                  <strong>{p.title}</strong>
                  <span className="caption">
                    /{p.slug} · order {p.sortOrder}
                  </span>
                </div>
                <span className="badge badge--soft">{p.category}</span>
                {p.featured && <span className="badge badge--coral">Featured</span>}
                <span className={`badge ${p.published ? "" : "badge--soft"}`}>{p.published ? "Published" : "Draft"}</span>
                <span className="badge badge--soft">{p.modelUrl ? (p.modelFormat ?? "model") : "no model"}</span>
                <button className="btn btn--sm" onClick={() => setEditing(p)}>
                  Edit
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </main>
  );
}

function Editor({ piece, all, onClose }: { piece: Piece | null; all: Piece[]; onClose: (changed: boolean) => void }) {
  const [title, setTitle] = useState(piece?.title ?? "");
  const [slug, setSlug] = useState(piece?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(!!piece);
  const [description, setDescription] = useState(piece?.description ?? "");
  const [category, setCategory] = useState<Category>(piece?.category ?? "model");
  const [tags, setTags] = useState(piece?.tags.join(", ") ?? "");
  const [sortOrder, setSortOrder] = useState(piece?.sortOrder ?? all.length);
  const [published, setPublished] = useState(piece?.published ?? false);
  const [featured, setFeatured] = useState(piece?.featured ?? false);
  const [modelFile, setModelFile] = useState<File | null>(null);
  const [posterFile, setPosterFile] = useState<File | null>(null);
  const [newMedia, setNewMedia] = useState<File[]>([]);
  const [newTextures, setNewTextures] = useState<{ name: string; file: File }[]>([]);
  const [removeMediaIds, setRemoveMediaIds] = useState<string[]>([]);
  const [removeTextureIds, setRemoveTextureIds] = useState<string[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [progress, setProgress] = useState<{ label: string; fraction: number } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const busy = progress !== null;
  const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  // Vista previa con los archivos elegidos, antes de subir nada.
  const urls = useMemo(
    () => ({
      model: modelFile ? URL.createObjectURL(modelFile) : null,
      textures: newTextures.map((t) => URL.createObjectURL(t.file)),
    }),
    [modelFile, newTextures],
  );
  useEffect(
    () => () => {
      if (urls.model) URL.revokeObjectURL(urls.model);
      urls.textures.forEach((u) => URL.revokeObjectURL(u));
    },
    [urls],
  );

  const preview: Piece = {
    id: piece?.id ?? "preview",
    slug,
    title,
    description,
    category,
    tags: [],
    modelUrl: urls.model ?? piece?.modelUrl ?? null,
    modelFormat: modelFile
      ? modelFile.name.toLowerCase().endsWith(".bbmodel")
        ? "bbmodel"
        : "glb"
      : (piece?.modelFormat ?? null),
    posterUrl: piece?.posterUrl ?? null,
    published,
    featured,
    sortOrder,
    createdAt: piece?.createdAt ?? "",
    media: [],
    textures: [
      ...(piece?.textures ?? []).filter((t) => !removeTextureIds.includes(t.id)),
      ...newTextures.map((t, i) => ({ id: `new-${i}`, name: t.name, url: urls.textures[i] })),
    ],
  };

  function validate(): string[] {
    const out: string[] = [];
    if (!title.trim()) out.push("Add a title.");
    if (!slug) out.push("Add a URL name.");
    if (all.some((p) => p.slug === slug && p.id !== piece?.id)) out.push(`The URL name "${slug}" is already used by another piece.`);
    if (modelFile) {
      if (!LIMITS.modelExt.some((ext) => modelFile.name.toLowerCase().endsWith(ext)))
        out.push(`Model must be ${LIMITS.modelExt.join(", ")}.`);
      if (modelFile.size > LIMITS.modelBytes) out.push(`Model is larger than ${mb(LIMITS.modelBytes)}.`);
    }
    const images = [...(posterFile ? [posterFile] : []), ...newTextures.map((t) => t.file)];
    for (const f of images) {
      if (!LIMITS.imageTypes.includes(f.type)) out.push(`${f.name}: use PNG, JPG, WebP or GIF.`);
      else if (f.size > LIMITS.imageBytes) out.push(`${f.name} is larger than ${mb(LIMITS.imageBytes)}.`);
    }
    for (const f of newMedia) {
      const video = LIMITS.videoTypes.includes(f.type);
      if (!video && !LIMITS.imageTypes.includes(f.type)) out.push(`${f.name}: use PNG, JPG, WebP, GIF, MP4 or WebM.`);
      else if (f.size > (video ? LIMITS.videoBytes : LIMITS.imageBytes))
        out.push(`${f.name} is larger than ${mb(video ? LIMITS.videoBytes : LIMITS.imageBytes)}.`);
    }
    return out;
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    const found = validate();
    setErrors(found);
    if (found.length) return;
    const draft: PieceDraft = {
      id: piece?.id,
      title: title.trim(),
      slug,
      description: description.trim(),
      category,
      tags: tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      published,
      featured,
      sortOrder,
      modelFile,
      posterFile,
      newMedia,
      newTextures,
      removeMediaIds,
      removeTextureIds,
    };
    setProgress({ label: "Starting", fraction: 0 });
    try {
      await data.save(draft, (label, fraction) => setProgress({ label, fraction }));
      onClose(true);
    } catch (err) {
      setErrors([message(err)]);
      setProgress(null);
    }
  }

  async function remove() {
    if (!piece) return;
    setProgress({ label: "Deleting", fraction: 1 });
    try {
      await data.remove(piece.id);
      onClose(true);
    } catch (err) {
      setErrors([message(err)]);
      setProgress(null);
    }
  }

  return (
    <form className="editor" onSubmit={save} noValidate>
      <div className="admin__title">
        <h1 className="heading">{piece ? "Edit piece" : "New piece"}</h1>
        <button type="button" className="btn btn--sm" onClick={() => onClose(false)} disabled={busy}>
          ← Back
        </button>
      </div>

      <div className="editor__cols">
        <div className="editor__fields">
          <fieldset className="panel">
            <legend className="caption">Details</legend>
            <label>
              Title
              <input
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                  if (!slugTouched) setSlug(slugify(e.target.value));
                }}
              />
            </label>
            <label>
              URL name
              <input
                value={slug}
                onChange={(e) => {
                  setSlugTouched(true);
                  setSlug(slugify(e.target.value));
                }}
              />
              <small>claypanda site / work / {slug || "…"}</small>
            </label>
            <label>
              Category
              <select value={category} onChange={(e) => setCategory(e.target.value as Category)}>
                <option value="model">Model</option>
                <option value="animation">Animation</option>
                <option value="texture">Texture</option>
              </select>
            </label>
            <label>
              Description
              <textarea rows={4} value={description} onChange={(e) => setDescription(e.target.value)} />
            </label>
            <label>
              Tags
              <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="entity, boss" />
              <small>Separate with commas.</small>
            </label>
            <label>
              Order
              <input type="number" value={sortOrder} onChange={(e) => setSortOrder(Number(e.target.value) || 0)} />
              <small>Lower numbers show first.</small>
            </label>
            <label className="check">
              <input type="checkbox" checked={published} onChange={(e) => setPublished(e.target.checked)} />
              Published (visible on the site)
            </label>
            <label className="check">
              <input type="checkbox" checked={featured} onChange={(e) => setFeatured(e.target.checked)} />
              Featured (shown in the hero)
            </label>
          </fieldset>

          <fieldset className="panel">
            <legend className="caption">Files</legend>
            <label>
              3D model
              <input type="file" accept=".glb,.gltf,.bbmodel" onChange={(e) => setModelFile(e.target.files?.[0] ?? null)} />
              <small>
                GLB with animations and textures embedded works best. Up to {mb(LIMITS.modelBytes)}.
                {piece?.modelUrl && !modelFile && " A model is already uploaded; choose a file to replace it."}
              </small>
            </label>
            <label>
              Cover image
              <input type="file" accept="image/*" onChange={(e) => setPosterFile(e.target.files?.[0] ?? null)} />
              <small>
                Shown on the portfolio card. Up to {mb(LIMITS.imageBytes)}.
                {piece?.posterUrl && !posterFile && " A cover is already uploaded."}
              </small>
            </label>
            <label>
              Texture variants
              <input
                type="file"
                accept="image/png,image/webp"
                multiple
                onChange={(e) =>
                  setNewTextures(
                    [...(e.target.files ?? [])].map((file) => ({ name: file.name.replace(/\.[^.]+$/, ""), file })),
                  )
                }
              />
              <small>Same layout as the model's texture. Each file becomes a button in the viewer.</small>
            </label>
            {newTextures.map((t, i) => (
              <label key={t.file.name + i}>
                Variant name ({t.file.name})
                <input
                  value={t.name}
                  onChange={(e) => setNewTextures((list) => list.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
                />
              </label>
            ))}
            {piece && piece.textures.length > 0 && (
              <ul className="chips">
                {piece.textures.map((t) => (
                  <li key={t.id}>
                    <button
                      type="button"
                      className={`btn btn--sm ${removeTextureIds.includes(t.id) ? "is-removed" : ""}`}
                      onClick={() => setRemoveTextureIds((l) => toggle(l, t.id))}
                    >
                      {t.name} {removeTextureIds.includes(t.id) ? "· will be removed (undo)" : "· remove"}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <label>
              Images and videos
              <input
                type="file"
                accept="image/*,video/mp4,video/webm"
                multiple
                onChange={(e) => setNewMedia([...(e.target.files ?? [])])}
              />
              <small>
                Images up to {mb(LIMITS.imageBytes)}, videos (MP4, WebM) up to {mb(LIMITS.videoBytes)}.
              </small>
            </label>
            {piece && piece.media.length > 0 && (
              <ul className="thumbs">
                {piece.media.map((m) => (
                  <li key={m.id} className={removeMediaIds.includes(m.id) ? "is-removed" : ""}>
                    {m.kind === "video" ? <video src={m.url} muted preload="metadata" /> : <img src={m.url} alt="" />}
                    <button type="button" className="btn btn--sm" onClick={() => setRemoveMediaIds((l) => toggle(l, m.id))}>
                      {removeMediaIds.includes(m.id) ? "Undo" : "Remove"}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </fieldset>
        </div>

        <div className="editor__preview">
          <p className="caption">Preview</p>
          <div className="editor__viewer">
            <Suspense fallback={null}>
              <Viewer piece={preview} mode="full" wheelZoom />
            </Suspense>
          </div>
        </div>
      </div>

      {errors.length > 0 && (
        <ul className="form-error" role="alert">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}

      {progress && (
        <div className="progress" role="status">
          <span className="caption">
            {progress.label} · {Math.round(progress.fraction * 100)}%
          </span>
          <div className="progress__bar">
            <div style={{ transform: `scaleX(${progress.fraction})` }} />
          </div>
        </div>
      )}

      <div className="editor__actions">
        <button className="btn btn--fill" disabled={busy}>
          {busy ? "Saving…" : published ? "Save and publish" : "Save draft"}
        </button>
        {piece &&
          (confirmDelete ? (
            <>
              <button type="button" className="btn btn--coral" onClick={remove} disabled={busy}>
                Yes, delete it and its files
              </button>
              <button type="button" className="btn" onClick={() => setConfirmDelete(false)} disabled={busy}>
                Keep it
              </button>
            </>
          ) : (
            <button type="button" className="btn" onClick={() => setConfirmDelete(true)} disabled={busy}>
              Delete piece
            </button>
          ))}
      </div>
    </form>
  );
}
