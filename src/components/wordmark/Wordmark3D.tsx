import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, type ThreeEvent, useFrame, useLoader, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { EdgesGeometry, type Group, type LineSegments, MathUtils, Vector3 } from "three";
import { Font } from "three/examples/jsm/loaders/FontLoader.js";
import { TTFLoader } from "three/examples/jsm/loaders/TTFLoader.js";
import { TextGeometry } from "three/examples/jsm/geometries/TextGeometry.js";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import fontUrl from "@fontsource/fredoka/files/fredoka-latin-700-normal.woff?url";
import "./wordmark.css";

// Logotipo 3D del hero: cada letra es una pieza que se puede elegir e inspeccionar.
// La letra activa pasa a trazo punteado (idea tomada de Tech Text de React Bits).

const WORD = "ClayPanda";
const DEPTH = 0.34;
const FOV = 30;
const TEAL = "#176667";
const CORAL = "#ea6e4a";

interface Letter {
  char: string;
  x: number;
  solid: TextGeometry;
  edges: EdgesGeometry;
}

function buildLetters(font: Font): { letters: Letter[]; width: number } {
  const data = font.data as unknown as { glyphs: Record<string, { ha: number }>; resolution: number };
  let cursor = 0;
  const raw = [...WORD].map((char) => {
    const solid = new TextGeometry(char, { font, size: 1, depth: DEPTH, curveSegments: 10, bevelEnabled: false });
    solid.computeBoundingBox();
    const box = solid.boundingBox!;
    const cx = (box.min.x + box.max.x) / 2;
    // Centrada en su propio eje para que gire sobre sí misma; la línea base se conserva.
    solid.translate(-cx, -0.36, -DEPTH / 2);
    const x = cursor + cx;
    cursor += ((data.glyphs[char]?.ha ?? 600) / data.resolution) * 1.02;
    return { char, x, solid, edges: new EdgesGeometry(solid, 28) };
  });
  return { letters: raw.map((l) => ({ ...l, x: l.x - cursor / 2 })), width: cursor };
}

function LetterMesh({
  letter,
  active,
  selected,
  spin,
  onPick,
  onHover,
}: {
  letter: Letter;
  active: boolean;
  selected: boolean;
  spin: boolean;
  onPick: () => void;
  onHover: (over: boolean) => void;
}) {
  const group = useRef<Group>(null);
  const lines = useRef<LineSegments>(null);

  useEffect(() => {
    lines.current?.computeLineDistances();
  }, [letter]);

  useFrame((_, raw) => {
    const g = group.current;
    if (!g) return;
    const delta = Math.min(raw, 0.1);
    if (selected && spin) g.rotation.y += delta * 0.7;
    else {
      // vuelve al frente por el camino corto
      const y = MathUtils.euclideanModulo(g.rotation.y + Math.PI, Math.PI * 2) - Math.PI;
      g.rotation.y = MathUtils.damp(y, 0, 5, delta);
    }
    const s = MathUtils.damp(g.scale.x, selected ? 1.12 : 1, 6, delta);
    g.scale.setScalar(s);
  });

  return (
    <group ref={group} position={[letter.x, 0, 0]}>
      <mesh
        geometry={letter.solid}
        onClick={(e: ThreeEvent<MouseEvent>) => {
          e.stopPropagation();
          if (e.delta <= 4) onPick();
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          onHover(true);
        }}
        onPointerOut={() => onHover(false)}
      >
        <meshStandardMaterial
          color={TEAL}
          roughness={0.55}
          transparent
          opacity={active ? 0.1 : 1}
          depthWrite={!active}
        />
      </mesh>
      <lineSegments ref={lines} geometry={letter.edges} visible={active}>
        <lineDashedMaterial color={CORAL} dashSize={0.045} gapSize={0.03} />
      </lineSegments>
    </group>
  );
}

function Scene({
  selected,
  onSelect,
  reduced,
  orbit,
}: {
  selected: number | null;
  onSelect: (i: number | null) => void;
  reduced: boolean;
  orbit: boolean;
}) {
  const json = useLoader(TTFLoader, fontUrl);
  const { letters, width } = useMemo(() => buildLetters(new Font(json as never)), [json]);
  useEffect(
    () => () =>
      letters.forEach((l) => {
        l.solid.dispose();
        l.edges.dispose();
      }),
    [letters],
  );

  const [hovered, setHovered] = useState<number | null>(null);
  const word = useRef<Group>(null);
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const controls = useThree((s) => s.controls) as OrbitControlsImpl | null;
  const gl = useThree((s) => s.gl);

  const pointer = useRef({ x: 0, y: 0 });
  const moving = useRef(1.6); // segundos de transición de cámara que quedan
  const t = useRef(0);
  const goal = useRef({ target: new Vector3(), position: new Vector3() });

  useEffect(() => {
    gl.domElement.style.cursor = hovered !== null ? "pointer" : orbit ? "grab" : "";
  }, [hovered, orbit, gl]);

  useEffect(() => {
    if (reduced) return;
    const move = (e: PointerEvent) => {
      pointer.current.x = (e.clientX / window.innerWidth) * 2 - 1;
      pointer.current.y = (e.clientY / window.innerHeight) * 2 - 1;
    };
    window.addEventListener("pointermove", move, { passive: true });
    return () => window.removeEventListener("pointermove", move);
  }, [reduced]);

  // Encuadre: palabra completa o primer plano de la letra elegida.
  useEffect(() => {
    const half = Math.tan(MathUtils.degToRad(FOV / 2));
    const aspect = size.width / size.height;
    const fit = Math.max((width * 1.3) / (2 * half * aspect), 1.5 / (2 * half));
    if (selected === null) {
      goal.current.target.set(0, 0, 0);
      goal.current.position.set(0, 0.15, fit);
    } else {
      const x = letters[selected].x;
      goal.current.target.set(x, 0.02, 0);
      goal.current.position.set(x + 0.9, 0.45, Math.min(fit, 3.4));
    }
    moving.current = 1.6;
  }, [selected, size.width, size.height, width, letters]);

  useFrame((_, raw) => {
    const delta = Math.min(raw, 0.1);
    t.current += delta;
    const w = word.current;
    if (w) {
      const free = selected === null && !reduced;
      w.position.y = free ? Math.sin(t.current * 1.1) * 0.05 : MathUtils.damp(w.position.y, 0, 4, delta);
      const sway = free ? Math.sin(t.current * 0.45) * 0.16 + pointer.current.x * 0.22 : 0;
      const tilt = free ? pointer.current.y * 0.12 : 0;
      w.rotation.y = MathUtils.damp(w.rotation.y, sway, 3, delta);
      w.rotation.x = MathUtils.damp(w.rotation.x, tilt, 3, delta);
    }
    if (moving.current > 0) {
      moving.current -= delta;
      const k = 1 - Math.exp(-5 * delta);
      camera.position.lerp(goal.current.position, k);
      if (controls) {
        controls.target.lerp(goal.current.target, k);
        controls.update();
      } else camera.lookAt(goal.current.target);
    }
  });

  return (
    <>
      <ambientLight intensity={1.6} />
      <directionalLight position={[3, 5, 6]} intensity={2.2} />
      <directionalLight position={[-4, -1, 3]} intensity={0.5} />
      <group ref={word}>
        {letters.map((letter, i) => (
          <LetterMesh
            key={i}
            letter={letter}
            selected={selected === i}
            active={selected === i || hovered === i}
            spin={!reduced}
            onPick={() => onSelect(selected === i ? null : i)}
            onHover={(over) => setHovered((cur) => (over ? i : cur === i ? null : cur))}
          />
        ))}
      </group>
      {orbit && (
        <OrbitControls
          makeDefault
          enablePan={false}
          enableZoom={false}
          enableDamping
          minPolarAngle={Math.PI * 0.25}
          maxPolarAngle={Math.PI * 0.75}
          onStart={() => (moving.current = 0)}
        />
      )}
    </>
  );
}

function webglAvailable() {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

export default function Wordmark3D() {
  const [selected, setSelected] = useState<number | null>(null);
  const supported = useMemo(webglAvailable, []);
  const reduced = useMemo(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches, []);
  const finePointer = useMemo(() => window.matchMedia("(pointer: fine)").matches, []);
  const wrap = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(true);

  useEffect(() => {
    if (!wrap.current) return;
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting));
    io.observe(wrap.current);
    return () => io.disconnect();
  }, []);

  if (!supported) {
    return (
      <div className="wordmark wordmark--flat" aria-hidden="true">
        {WORD}
      </div>
    );
  }

  return (
    <div className="wordmark" ref={wrap}>
      <div className="wordmark__stage">
        <Canvas
          dpr={[1, 2]}
          frameloop={inView ? "always" : "never"}
          camera={{ position: [0, 0.15, 9], fov: FOV }}
          style={{ touchAction: finePointer ? "none" : "pan-y" }}
          onPointerMissed={() => setSelected(null)}
          aria-label="ClayPanda in 3D. Use the letter buttons below to inspect each letter."
          role="img"
        >
          <Suspense fallback={null}>
            <Scene selected={selected} onSelect={setSelected} reduced={reduced} orbit={finePointer} />
          </Suspense>
        </Canvas>
      </div>

      <div className="wordmark__picker" role="group" aria-label="Inspect a letter">
        <button type="button" className="btn btn--sm" aria-pressed={selected === null} onClick={() => setSelected(null)}>
          All
        </button>
        {[...WORD].map((char, i) => (
          <button
            key={i}
            type="button"
            className="btn btn--sm wordmark__key"
            aria-pressed={selected === i}
            aria-label={`Letter ${char}, ${i + 1} of ${WORD.length}`}
            onClick={() => setSelected(selected === i ? null : i)}
          >
            {char}
          </button>
        ))}
      </div>
    </div>
  );
}
