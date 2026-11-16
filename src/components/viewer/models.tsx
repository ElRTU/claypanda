import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useAnimations, useGLTF } from "@react-three/drei";
import {
  Box3,
  CanvasTexture,
  type Group,
  type Mesh,
  type MeshStandardMaterial,
  NearestFilter,
  SRGBColorSpace,
  type Texture,
  TextureLoader,
  Vector3,
} from "three";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import type { TextureVariant } from "../../lib/types.ts";

export interface ModelInfo {
  animations: string[];
  variants: string[];
}

export interface ModelProps {
  animation: string | null;
  playing: boolean;
  speed: number;
  variant: number;
  wireframe: boolean;
  onReady: (info: ModelInfo) => void;
}

/** Pixel art nítido: sin suavizado ni mipmaps. */
function pixelate(tex: Texture) {
  tex.magFilter = NearestFilter;
  tex.minFilter = NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
}

/* ---------- Modelo real (GLB / glTF) ---------- */

const TARGET_SIZE = 2.4;

export function GltfModel({
  url,
  textures,
  animation,
  playing,
  speed,
  variant,
  wireframe,
  onReady,
}: ModelProps & { url: string; textures: TextureVariant[] }) {
  const gltf = useGLTF(url);
  const root = useRef<Group>(null);

  // Copia propia: el mismo archivo puede estar en dos visores a la vez.
  const { scene, materials, scale, offset } = useMemo(() => {
    const scene = cloneSkinned(gltf.scene);
    const materials: MeshStandardMaterial[] = [];
    scene.traverse((o) => {
      const mesh = o as Mesh;
      if (!mesh.isMesh) return;
      const own = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).map((m) => {
        const c = m.clone() as MeshStandardMaterial;
        if (c.map) {
          pixelate(c.map);
          c.userData.originalMap = c.map;
        }
        materials.push(c);
        return c;
      });
      mesh.material = Array.isArray(mesh.material) ? own : own[0];
    });
    const box = new Box3().setFromObject(scene);
    const size = box.getSize(new Vector3());
    const center = box.getCenter(new Vector3());
    const scale = TARGET_SIZE / (Math.max(size.x, size.y, size.z) || 1);
    return { scene, materials, scale, offset: center.multiplyScalar(-1) };
  }, [gltf.scene]);

  const { actions, names, mixer } = useAnimations(gltf.animations, root);

  useEffect(() => {
    onReady({ animations: names, variants: ["Original", ...textures.map((t) => t.name)] });
    // onReady es estable; solo cambia con el modelo
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [names, textures]);

  useEffect(() => {
    const action = animation ? actions[animation] : null;
    action?.reset().fadeIn(0.25).play();
    return () => {
      action?.fadeOut(0.25);
    };
  }, [animation, actions]);

  useEffect(() => {
    mixer.timeScale = playing ? speed : 0;
  }, [mixer, playing, speed]);

  useEffect(() => {
    for (const m of materials) m.wireframe = wireframe;
  }, [materials, wireframe]);

  useEffect(() => {
    const picked = variant > 0 ? textures[variant - 1] : null;
    if (!picked) {
      for (const m of materials) {
        if (m.userData.originalMap) m.map = m.userData.originalMap as Texture;
      }
      return;
    }
    let cancelled = false;
    new TextureLoader().load(picked.url, (tex) => {
      if (cancelled) return tex.dispose();
      tex.flipY = false; // convención de glTF
      tex.colorSpace = SRGBColorSpace;
      pixelate(tex);
      for (const m of materials) {
        if (m.userData.originalMap) m.map = tex;
      }
    });
    return () => {
      cancelled = true;
    };
  }, [variant, textures, materials]);

  return (
    <group ref={root} scale={scale}>
      <primitive object={scene} position={offset} />
    </group>
  );
}

/* ---------- Modelo de prueba (mientras no hay archivo) ---------- */

const PALETTES = [
  { name: "Teal", shades: ["#176667", "#1a6f70", "#145c5d", "#1f7a7a"] },
  { name: "Coral", shades: ["#ea6e4a", "#ec7a58", "#dc6340", "#f08663"] },
  { name: "Mustard", shades: ["#d9a34d", "#deab59", "#cd9641", "#e4b566"] },
];
const PLACEHOLDER_ANIMS = ["Idle", "Walk", "Wave"];

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

function pixelTexture(shades: string[], seed: number) {
  const c = document.createElement("canvas");
  c.width = c.height = 16;
  const ctx = c.getContext("2d")!;
  let s = seed || 1;
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      s = (s * 1664525 + 1013904223) >>> 0;
      const r = s / 0xffffffff;
      ctx.fillStyle = shades[r < 0.55 ? 0 : r < 0.75 ? 1 : r < 0.92 ? 2 : 3];
      ctx.fillRect(x, y, 1, 1);
    }
  }
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  pixelate(tex);
  return tex;
}

export function PlaceholderModel({
  seed,
  animation,
  playing,
  speed,
  variant,
  wireframe,
  onReady,
}: ModelProps & { seed: string }) {
  const h = useMemo(() => hash(seed), [seed]);
  const maps = useMemo(() => PALETTES.map((p, i) => pixelTexture(p.shades, h + i)), [h]);
  useEffect(() => () => maps.forEach((m) => m.dispose()), [maps]);

  // La paleta inicial depende de la pieza, para que las tarjetas no se vean todas iguales.
  const start = h % PALETTES.length;
  const map = maps[(start + variant) % PALETTES.length];

  useEffect(() => {
    const names = PALETTES.map((p) => p.name);
    onReady({ animations: PLACEHOLDER_ANIMS, variants: [...names.slice(start), ...names.slice(0, start)] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [start]);

  const head = useRef<Group>(null);
  const body = useRef<Group>(null);
  const armL = useRef<Group>(null);
  const armR = useRef<Group>(null);
  const legL = useRef<Group>(null);
  const legR = useRef<Group>(null);
  const t = useRef(0);

  useFrame((_, delta) => {
    if (playing) t.current += Math.min(delta, 0.1) * speed;
    const x = t.current;
    const walk = animation === "Walk";
    const wave = animation === "Wave";
    const swing = walk ? Math.sin(x * 6) * 0.7 : 0;
    if (body.current) body.current.position.y = walk ? Math.abs(Math.sin(x * 6)) * 0.06 : Math.sin(x * 2) * 0.025;
    if (head.current) {
      head.current.rotation.y = Math.sin(x * 1.3) * (walk ? 0.1 : 0.3);
      head.current.rotation.z = wave ? Math.sin(x * 4) * 0.12 : 0;
    }
    if (armL.current) armL.current.rotation.x = swing || Math.sin(x * 2) * 0.06;
    if (armR.current) {
      armR.current.rotation.x = wave ? 0 : -swing || -Math.sin(x * 2) * 0.06;
      armR.current.rotation.z = wave ? 2.5 + Math.sin(x * 9) * 0.35 : 0;
    }
    if (legL.current) legL.current.rotation.x = -swing;
    if (legR.current) legR.current.rotation.x = swing;
  });

  const mat = <meshStandardMaterial map={map} wireframe={wireframe} roughness={0.9} />;
  const dark = <meshStandardMaterial color="#0d3536" wireframe={wireframe} />;

  return (
    <group position={[0, -0.05, 0]}>
      <group ref={body}>
        <mesh position={[0, 0.15, 0]}>
          <boxGeometry args={[1, 1, 0.6]} />
          {mat}
        </mesh>
        <group ref={head} position={[0, 0.65, 0]}>
          <mesh position={[0, 0.4, 0]}>
            <boxGeometry args={[0.85, 0.8, 0.75]} />
            {mat}
          </mesh>
          <mesh position={[-0.2, 0.45, 0.38]}>
            <boxGeometry args={[0.14, 0.2, 0.04]} />
            {dark}
          </mesh>
          <mesh position={[0.2, 0.45, 0.38]}>
            <boxGeometry args={[0.14, 0.2, 0.04]} />
            {dark}
          </mesh>
          <mesh position={[-0.32, 0.88, 0]}>
            <boxGeometry args={[0.26, 0.2, 0.2]} />
            {mat}
          </mesh>
          <mesh position={[0.32, 0.88, 0]}>
            <boxGeometry args={[0.26, 0.2, 0.2]} />
            {mat}
          </mesh>
        </group>
        <group ref={armL} position={[-0.66, 0.6, 0]}>
          <mesh position={[0, -0.42, 0]}>
            <boxGeometry args={[0.3, 0.9, 0.3]} />
            {mat}
          </mesh>
        </group>
        <group ref={armR} position={[0.66, 0.6, 0]}>
          <mesh position={[0, -0.42, 0]}>
            <boxGeometry args={[0.3, 0.9, 0.3]} />
            {mat}
          </mesh>
        </group>
      </group>
      <group ref={legL} position={[-0.25, -0.35, 0]}>
        <mesh position={[0, -0.4, 0]}>
          <boxGeometry args={[0.38, 0.8, 0.4]} />
          {mat}
        </mesh>
      </group>
      <group ref={legR} position={[0.25, -0.35, 0]}>
        <mesh position={[0, -0.4, 0]}>
          <boxGeometry args={[0.38, 0.8, 0.4]} />
          {mat}
        </mesh>
      </group>
    </group>
  );
}
