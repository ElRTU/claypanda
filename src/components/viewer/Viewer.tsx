import { Component, type ReactNode, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { type Group, MathUtils } from "three";
import type { Piece } from "../../lib/types.ts";
import { GltfModel, type ModelInfo, PlaceholderModel } from "./models.tsx";
import "../../styles/viewer.css";

type Mode = "hero" | "full";

interface Props {
  piece: Piece;
  /** hero: sin controles, sigue al puntero. full: con barra de herramientas. */
  mode?: Mode;
  /** La rueda hace zoom (solo donde no secuestra el scroll de la página). */
  wheelZoom?: boolean;
}

const SPEEDS = [0.5, 1, 2];
const CAMERA: [number, number, number] = [0, 0.5, 7];

function webglAvailable() {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

function useInView<T extends Element>() {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    if (!ref.current) return;
    const io = new IntersectionObserver(
      ([e]) => {
        setInView(e.isIntersecting);
        if (e.isIntersecting) setSeen(true);
      },
      { rootMargin: "200px" },
    );
    io.observe(ref.current);
    return () => io.disconnect();
  }, []);
  return { ref, inView, seen };
}

class ModelBoundary extends Component<{ onError: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onError();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

/** Movimiento en reposo: flota, gira lento y se inclina hacia el puntero con inercia. No depende del scroll. */
function IdleRig({
  spin,
  follow,
  busy,
  children,
}: {
  spin: boolean;
  follow: boolean;
  busy: React.RefObject<boolean>;
  children: ReactNode;
}) {
  const outer = useRef<Group>(null);
  const inner = useRef<Group>(null);
  const pointer = useRef({ x: 0, y: 0 });
  const t = useRef(0);

  useEffect(() => {
    if (!follow) return;
    const move = (e: PointerEvent) => {
      pointer.current.x = (e.clientX / window.innerWidth) * 2 - 1;
      pointer.current.y = (e.clientY / window.innerHeight) * 2 - 1;
    };
    window.addEventListener("pointermove", move, { passive: true });
    return () => window.removeEventListener("pointermove", move);
  }, [follow]);

  useFrame((_, raw) => {
    const delta = Math.min(raw, 0.1);
    const o = outer.current;
    const i = inner.current;
    if (!o || !i) return;
    if (spin) {
      t.current += delta;
      o.position.y = Math.sin(t.current * 1.1) * 0.07;
      if (!busy.current) o.rotation.y += delta * 0.32;
    }
    const tx = follow && !busy.current ? pointer.current.y * 0.16 : 0;
    const ty = follow && !busy.current ? pointer.current.x * 0.45 : 0;
    i.rotation.x = MathUtils.damp(i.rotation.x, tx, 3, delta);
    i.rotation.y = MathUtils.damp(i.rotation.y, ty, 3, delta);
    i.rotation.z = MathUtils.damp(i.rotation.z, -ty * 0.12, 3, delta);
  });

  return (
    <group ref={outer}>
      <group ref={inner}>{children}</group>
    </group>
  );
}

/** Expone zoom y reinicio de cámara a los botones de fuera del canvas. */
function CameraApi({ api }: { api: React.RefObject<{ zoom: (k: number) => void; reset: () => void } | null> }) {
  const camera = useThree((s) => s.camera);
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    api.current = {
      zoom: (k) => {
        const d = MathUtils.clamp(camera.position.length() * k, 3.2, 11);
        camera.position.setLength(d);
        invalidate();
      },
      reset: () => {
        camera.position.set(...CAMERA);
        camera.lookAt(0, 0, 0);
        invalidate();
      },
    };
  }, [api, camera, invalidate]);
  return null;
}

/** Cada pieza (o archivo nuevo) arranca con estado limpio. */
export default function Viewer(props: Props) {
  return <ViewerInner key={`${props.piece.id}:${props.piece.modelUrl}`} {...props} />;
}

function ViewerInner({ piece, mode = "full", wheelZoom = false }: Props) {
  const hero = mode === "hero";
  const { ref, inView, seen } = useInView<HTMLDivElement>();
  const supported = useMemo(webglAvailable, []);
  const reduced = useMemo(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches, []);
  const finePointer = useMemo(() => window.matchMedia("(pointer: fine)").matches, []);

  const [info, setInfo] = useState<ModelInfo | null>(null);
  const [failed, setFailed] = useState(false);
  const [animation, setAnimation] = useState<string | null>(null);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [variant, setVariant] = useState(0);
  const [wireframe, setWireframe] = useState(false);
  const [grid, setGrid] = useState(false);
  const [spin, setSpin] = useState(!reduced);

  const busy = useRef(false);
  const resume = useRef<number>(undefined);
  const camApi = useRef<{ zoom: (k: number) => void; reset: () => void } | null>(null);

  const onReady = useCallback((next: ModelInfo) => {
    setInfo(next);
    setAnimation((cur) => cur ?? next.animations[0] ?? null);
  }, []);

  const unsupportedFormat = piece.modelFormat === "bbmodel";
  const useFile = piece.modelUrl && !unsupportedFormat;

  const modelProps = { animation, playing: playing && !reduced, speed, variant, wireframe, onReady };

  const fallback = (
    <div className="viewer__fallback">
      {piece.posterUrl ? <img src={piece.posterUrl} alt={piece.title} /> : <p>3D preview is not available on this device.</p>}
    </div>
  );

  return (
    <div ref={ref} className={`viewer viewer--${mode}`} {...(wheelZoom ? { "data-lenis-prevent": true } : {})}>
      {!supported || failed ? (
        failed && !piece.posterUrl ? (
          <div className="viewer__fallback">
            <p>This model could not be loaded.</p>
          </div>
        ) : (
          fallback
        )
      ) : (
        seen && (
          <Canvas
            className="viewer__canvas"
            dpr={[1, 2]}
            frameloop={inView ? "always" : "never"}
            camera={{ position: CAMERA, fov: 32 }}
            style={{ touchAction: hero && !finePointer ? "pan-y" : "none" }}
          >
            <ambientLight intensity={1.5} />
            <directionalLight position={[4, 6, 5]} intensity={2} />
            <directionalLight position={[-5, 2, -4]} intensity={0.7} />
            <CameraApi api={camApi} />
            <IdleRig spin={spin} follow={hero && finePointer && !reduced} busy={busy}>
              <ModelBoundary key={`${piece.id}:${piece.modelUrl}`} onError={() => setFailed(true)}>
                <Suspense fallback={null}>
                  {useFile ? (
                    <GltfModel url={piece.modelUrl!} textures={piece.textures} {...modelProps} />
                  ) : (
                    <PlaceholderModel seed={piece.id} {...modelProps} />
                  )}
                </Suspense>
              </ModelBoundary>
            </IdleRig>
            {grid && <gridHelper args={[8, 16, "#fdefd4", "#2a7a7b"]} position={[0, -1.3, 0]} />}
            {(finePointer || !hero) && (
              <OrbitControls
                makeDefault
                enablePan={false}
                enableZoom={wheelZoom}
                enableDamping
                minDistance={3.2}
                maxDistance={11}
                onStart={() => {
                  busy.current = true;
                  window.clearTimeout(resume.current);
                }}
                onEnd={() => {
                  resume.current = window.setTimeout(() => (busy.current = false), 1800);
                }}
              />
            )}
          </Canvas>
        )
      )}

      {supported && !failed && !info && <p className="viewer__status">Loading model…</p>}

      {!hero && (
        <>
          {unsupportedFormat && (
            <p className="viewer__note">Preview for .bbmodel files is coming soon. Showing a stand-in model.</p>
          )}
          {!piece.modelUrl && <p className="viewer__note">Stand-in model. The real asset has not been uploaded yet.</p>}

          <div className="viewer__bar" role="toolbar" aria-label="Viewer controls">
            {info && info.animations.length > 0 && (
              <div className="viewer__group">
                <span className="caption">Animation</span>
                {info.animations.map((name) => (
                  <button type="button"
                    key={name}
                    className="btn btn--sm btn--on-deep"
                    aria-pressed={animation === name}
                    onClick={() => {
                      setAnimation(name);
                      setPlaying(true);
                    }}
                  >
                    {name}
                  </button>
                ))}
                <button type="button" className="btn btn--sm btn--on-deep" onClick={() => setPlaying((p) => !p)}>
                  {playing ? "Pause" : "Play"}
                </button>
                <button type="button"
                  className="btn btn--sm btn--on-deep"
                  aria-label={`Speed ${speed}×, change`}
                  onClick={() => setSpeed((s) => SPEEDS[(SPEEDS.indexOf(s) + 1) % SPEEDS.length])}
                >
                  {speed}×
                </button>
              </div>
            )}
            {info && info.variants.length > 1 && (
              <div className="viewer__group">
                <span className="caption">Texture</span>
                {info.variants.map((name, i) => (
                  <button type="button"
                    key={name + i}
                    className="btn btn--sm btn--on-deep"
                    aria-pressed={variant === i}
                    onClick={() => setVariant(i)}
                  >
                    {name}
                  </button>
                ))}
              </div>
            )}
            <div className="viewer__group">
              <span className="caption">View</span>
              <button type="button" className="btn btn--sm btn--on-deep" aria-pressed={spin} onClick={() => setSpin((v) => !v)}>
                Spin
              </button>
              <button type="button" className="btn btn--sm btn--on-deep" aria-pressed={grid} onClick={() => setGrid((v) => !v)}>
                Grid
              </button>
              <button type="button"
                className="btn btn--sm btn--on-deep"
                aria-pressed={wireframe}
                onClick={() => setWireframe((v) => !v)}
              >
                Wire
              </button>
              <button type="button" className="btn btn--sm btn--on-deep" aria-label="Zoom out" onClick={() => camApi.current?.zoom(1.2)}>
                −
              </button>
              <button type="button" className="btn btn--sm btn--on-deep" aria-label="Zoom in" onClick={() => camApi.current?.zoom(0.83)}>
                +
              </button>
              <button type="button" className="btn btn--sm btn--on-deep" onClick={() => camApi.current?.reset()}>
                Reset
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
