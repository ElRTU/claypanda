import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "react-router";
import { about, contact, hero, marquee, showcase, studio, work } from "../content.ts";
import { Footer, Leaf, Nav, Title, Wave } from "../components/bits.tsx";
import { data } from "../lib/data.ts";
import { gsap, prefersReducedMotion, ScrollTrigger, scrollToTarget, useSmoothScroll } from "../lib/scroll.ts";
import type { Piece } from "../lib/types.ts";
import ClickSpark from "../reactbits/ClickSpark.tsx";
import Cubes from "../reactbits/Cubes.tsx";
import DotGrid from "../reactbits/DotGrid.tsx";
import RotatingText from "../reactbits/RotatingText.tsx";
import TiltedCard from "../reactbits/TiltedCard.tsx";
import "../styles/home.css";

// three.js queda fuera del paquete inicial: todo lo que lo usa se carga aparte.
const ColorBends = lazy(() => import("../reactbits/ColorBends.tsx"));
const Viewer = lazy(() => import("../components/viewer/Viewer.tsx"));
const Wordmark3D = lazy(() => import("../components/wordmark/Wordmark3D.tsx"));

const PAGE = 6;
const CATEGORY_LABEL = { model: "Model", animation: "Animation", texture: "Texture" } as const;
const BRAND = ["#ea6e4a", "#d9a34d", "#176667"];

// Mientras el equipo no publique nada, el visor enseña el modelo de prueba.
const STAND_IN: Piece = {
  id: "stand-in",
  slug: "",
  title: "Stand-in",
  description: "",
  category: "model",
  tags: [],
  modelUrl: null,
  modelFormat: null,
  posterUrl: null,
  published: true,
  featured: true,
  sortOrder: 0,
  createdAt: "",
  media: [],
  textures: [],
};

export default function Home() {
  useSmoothScroll();
  const root = useRef<HTMLDivElement>(null);
  const { hash } = useLocation();
  const [pieces, setPieces] = useState<Piece[] | null>(null);
  const [error, setError] = useState(false);
  const [filter, setFilter] = useState<(typeof work.filters)[number]["id"]>("all");
  const [shown, setShown] = useState(PAGE);
  const [step, setStep] = useState(0);

  useEffect(() => {
    data.listPublished().then(setPieces, () => setError(true));
  }, []);

  useEffect(() => {
    if (hash) requestAnimationFrame(() => scrollToTarget(hash));
  }, [hash]);

  useEffect(() => {
    const ctx = gsap.context(() => {
      // El fondo de la página se transforma según la sección que domina la pantalla.
      // Si dos secciones están activas a la vez, manda la que está más abajo.
      const zones: { el: HTMLElement; trigger: ScrollTrigger }[] = [];
      const paint = () => {
        const active = zones.filter((z) => z.trigger.isActive).pop();
        if (active) document.body.style.backgroundColor = active.el.dataset.bg!;
      };
      gsap.utils.toArray<HTMLElement>("[data-bg]").forEach((el) => {
        const trigger = ScrollTrigger.create({
          trigger: el,
          start: el.dataset.bgStart ?? "top 55%",
          end: "bottom 55%",
          onToggle: () => requestAnimationFrame(paint),
        });
        zones.push({ el, trigger });
      });
      paint();
      ScrollTrigger.create({
        trigger: ".showcase",
        start: "top top",
        end: "bottom bottom",
        onUpdate: (self) => setStep(Math.min(showcase.steps.length - 1, Math.floor(self.progress * showcase.steps.length))),
      });
      if (prefersReducedMotion()) return;
      gsap.fromTo(
        ".marquee__track",
        { xPercent: 0 },
        {
          xPercent: -35,
          ease: "none",
          scrollTrigger: { trigger: ".marquee", start: "top bottom", end: "bottom top", scrub: true },
        },
      );
    }, root);
    return () => {
      ctx.revert();
      document.body.style.backgroundColor = "";
    };
  }, []);

  // Las alturas cambian cuando llegan las piezas o se filtra.
  useEffect(() => {
    ScrollTrigger.refresh();
  }, [pieces, filter, shown]);

  const featured = useMemo(() => pieces?.find((p) => p.featured) ?? pieces?.[0] ?? STAND_IN, [pieces]);
  const filtered = useMemo(
    () => (pieces ?? []).filter((p) => filter === "all" || p.category === filter),
    [pieces, filter],
  );

  return (
    <ClickSpark sparkColor={BRAND} sparkCount={5} sparkSize={9} sparkRadius={20} duration={420}>
      <div ref={root}>
        <Nav />
        <main>
          {/* HERO */}
          <section className="hero" id="top" data-bg="#f5e6c9">
            <div className="hero__bends" aria-hidden="true">
              <Suspense fallback={null}>
                <ColorBends
                  colors={["#ea6e4a", "#d9a34d", "#176667", "#fdefd4"]}
                  speed={0.14}
                  mouseInfluence={0.35}
                  parallax={0.3}
                  noise={0}
                  intensity={1.2}
                />
              </Suspense>
            </div>
            <p className="caption hero__eyebrow">{hero.eyebrow}</p>
            <h1 className="heading-lg hero__headline">
              <span>{hero.lead}</span>
              <RotatingText
                texts={hero.rotating}
                mainClassName="hero__rotator"
                rotationInterval={2600}
                staggerDuration={0.02}
              />
            </h1>
            <Suspense fallback={<div className="wordmark" />}>
              <Wordmark3D />
            </Suspense>
            <div className="hero__foot">
              <p className="lead">{hero.body}</p>
              <a className="btn btn--fill" href={hero.cta.href}>
                {hero.cta.label}
              </a>
            </div>
          </section>

          {/* BANDA */}
          <div className="marquee" aria-hidden="true">
            <Wave className="wave--top" />
            <div className="marquee__track heading-lg">
              {[...marquee, ...marquee].map((w, i) => (
                <span key={i}>
                  {w} <i>✦</i>
                </span>
              ))}
            </div>
            <Wave className="wave--bottom" />
          </div>

          {/* WORK */}
          <section className="work section" id="work" data-bg="#fdefd4">
            <div className="section__bg" aria-hidden="true">
              <DotGrid dotSize={4} gap={26} baseColor="#ead9b4" activeColor="#ea6e4a" proximity={130} glow={0} />
            </div>
            <div className="section__inner">
              <p className="caption">{work.eyebrow}</p>
              <Title className="heading-lg" text={work.title} />
              <div className="work__filters" role="group" aria-label="Filter by category">
                {work.filters.map((f) => (
                  <button
                    key={f.id}
                    className={`btn btn--sm ${filter === f.id ? "btn--fill" : ""}`}
                    aria-pressed={filter === f.id}
                    onClick={() => {
                      setFilter(f.id);
                      setShown(PAGE);
                    }}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              {error && <p className="work__empty">The portfolio could not be loaded. Try again in a moment.</p>}
              {pieces && filtered.length === 0 && <p className="work__empty">{work.empty}</p>}

              <ul className="work__grid">
                {filtered.slice(0, shown).map((p) => (
                  <li key={p.id}>
                    <Link className="card" to={`/work/${p.slug}`}>
                      <TiltedCard
                        containerWidth="100%"
                        containerHeight="auto"
                        imageWidth="100%"
                        imageHeight="100%"
                        style={{ aspectRatio: "4 / 3" }}
                        radius={6}
                        rotateAmplitude={10}
                        scaleOnHover={1.03}
                        shadow={0}
                        glare={0.25}
                        showTooltip={false}
                        gyroscope={false}
                        flipOnClick={false}
                      >
                        <div className={`card__cover card__cover--${p.category}`}>
                          {p.posterUrl ? (
                            <img src={p.posterUrl} alt="" loading="lazy" />
                          ) : (
                            <span aria-hidden="true">{p.title.charAt(0)}</span>
                          )}
                        </div>
                      </TiltedCard>
                      <div className="card__meta">
                        <h3>{p.title}</h3>
                        <span className="badge badge--soft">{CATEGORY_LABEL[p.category]}</span>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
              {filtered.length > shown && (
                <button className="btn work__more" onClick={() => setShown((n) => n + PAGE)}>
                  {work.more}
                </button>
              )}
            </div>
          </section>

          {/* VISOR: bloque oscuro con borde de escalón de píxeles */}
          <section className="showcase" id="viewer">
            <div className="steps-edge steps-edge--top" aria-hidden="true" />
            <div className="showcase__pin">
              <div className="showcase__cubes" aria-hidden="true">
                <Cubes
                  gridSize={9}
                  faceColor="#124b4c"
                  edgeColor="#2f7c7d"
                  faceOpacity={0.9}
                  shading={0.35}
                  maxAngle={16}
                  radius={2}
                  speed={0.6}
                  brush={0.4}
                  rippleOnClick={false}
                />
              </div>
              <div className="showcase__copy">
                <p className="caption">{showcase.eyebrow}</p>
                <Title className="heading-lg" text={showcase.title} />
                <ol className="showcase__steps">
                  {showcase.steps.map((s, i) => (
                    <li key={s.title} className={i === step ? "is-active" : ""}>
                      <h3>{s.title}</h3>
                      <p>{s.body}</p>
                    </li>
                  ))}
                </ol>
              </div>
              <div className="showcase__viewer">
                <Suspense fallback={null}>
                  <Viewer piece={featured} mode="full" />
                </Suspense>
              </div>
            </div>
            <div className="steps-edge steps-edge--bottom" aria-hidden="true" />
          </section>

          {/* STUDIO */}
          <section className="about section section--warm" id="studio" data-bg="#e6b461">
            <Leaf className="leaves about__leaf" />
            <div className="section__inner">
              <p className="caption">{about.eyebrow}</p>
              <Title className="heading-lg" text={about.title} />
              <p className="about__body">{about.body}</p>
              <ul className="about__services">
                {about.services.map((s) => (
                  <li key={s.title}>
                    <h3>{s.title}</h3>
                    <p>{s.body}</p>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          {/* CONTACT */}
          <section className="contact section section--warm" id="contact" data-bg="#ea6e4a" data-bg-start="top 88%">
            <div className="section__inner">
              <Title className="display" text={contact.title} />
              <p className="lead">{contact.body}</p>
              <div className="contact__links">
                {studio.discord && (
                  <a className="btn btn--fill" href={studio.discord} target="_blank" rel="noreferrer">
                    Discord
                  </a>
                )}
                {studio.x && (
                  <a className="btn" href={studio.x} target="_blank" rel="noreferrer">
                    X / Twitter
                  </a>
                )}
                {studio.email && (
                  <a className="btn" href={`mailto:${studio.email}`}>
                    Email
                  </a>
                )}
                {!studio.discord && !studio.x && !studio.email && <span className="badge">Links coming soon</span>}
              </div>
            </div>
          </section>
        </main>
        <Footer />
      </div>
    </ClickSpark>
  );
}
