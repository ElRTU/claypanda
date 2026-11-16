import { lazy, Suspense, useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { Footer, Lines, Nav } from "../components/bits.tsx";
import { data } from "../lib/data.ts";
import { useSmoothScroll } from "../lib/scroll.ts";
import type { Piece } from "../lib/types.ts";
import "../styles/home.css";

const Viewer = lazy(() => import("../components/viewer/Viewer.tsx"));

export default function PiecePage() {
  useSmoothScroll();
  const { slug = "" } = useParams();
  const [state, setState] = useState<{ piece: Piece | null; next: Piece | null; status: "loading" | "ok" | "missing" }>({
    piece: null,
    next: null,
    status: "loading",
  });

  useEffect(() => {
    let alive = true;
    window.scrollTo(0, 0);
    setState((s) => ({ ...s, status: "loading" }));
    data.listPublished().then(
      (all) => {
        if (!alive) return;
        const i = all.findIndex((p) => p.slug === slug);
        setState(
          i < 0
            ? { piece: null, next: null, status: "missing" }
            : { piece: all[i], next: all.length > 1 ? all[(i + 1) % all.length] : null, status: "ok" },
        );
      },
      () => alive && setState({ piece: null, next: null, status: "missing" }),
    );
    return () => {
      alive = false;
    };
  }, [slug]);

  const { piece, next, status } = state;

  useEffect(() => {
    if (piece) document.title = `${piece.title} — ClayPanda`;
  }, [piece]);

  return (
    <>
      <Nav />
      <main className="piece">
        <Link className="btn btn--sm piece__back" to="/#work">
          ← All work
        </Link>

        {status === "loading" && <p className="caption">Loading…</p>}
        {status === "missing" && (
          <>
            <h1 className="heading-lg">Not found</h1>
            <p className="lead">This piece does not exist or is no longer published.</p>
          </>
        )}

        {piece && (
          <>
            <div className="piece__head">
              <div>
                <div className="piece__tags">
                  <span className="badge">{piece.category}</span>
                  {piece.tags.map((t) => (
                    <span key={t} className="badge badge--soft">
                      {t}
                    </span>
                  ))}
                </div>
                <Lines key={piece.id} as="h1" className="heading-lg" lines={[piece.title]} />
              </div>
              <p>{piece.description}</p>
            </div>

            <div className="piece__viewer">
              <Suspense fallback={null}>
                <Viewer piece={piece} mode="full" wheelZoom />
              </Suspense>
            </div>

            {piece.media.length > 0 && (
              <div className="piece__media">
                {piece.media.map((m) =>
                  m.kind === "video" ? (
                    <video key={m.id} src={m.url} controls playsInline preload="metadata" />
                  ) : (
                    <img key={m.id} src={m.url} alt={`${piece.title} detail`} loading="lazy" />
                  ),
                )}
              </div>
            )}

            {next && (
              <div className="piece__next">
                <span className="caption">Next</span>
                <Link className="btn btn--fill" to={`/work/${next.slug}`}>
                  {next.title} →
                </Link>
              </div>
            )}
          </>
        )}
      </main>
      <Footer />
    </>
  );
}
