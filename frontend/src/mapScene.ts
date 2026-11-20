// Escena Three.js del mapa por departamento. Es el único módulo que importa three: Map3D.tsx lo carga con
// import() dinámico, así Three.js va en un paquete aparte que solo se descarga si la tarjeta se acerca a la pantalla.
import { Box2, BufferGeometry, DirectionalLight, ExtrudeGeometry, Group, HemisphereLight, LineBasicMaterial, LineLoop, Mesh, MeshStandardMaterial, PerspectiveCamera, Raycaster, Scene, Shape, Vector2, WebGLRenderer } from "three";
import { ISLAND, ISLAND_ZOOM, project, zoomAround } from "./mapData";

export interface GeoFeature { properties: { name: string }; geometry: { coordinates: [number, number][][][] } }
export interface SceneOpts {
  features: GeoFeature[];
  reduced: boolean; // prefers-reduced-motion: sin transiciones
  small: boolean; // pantalla pequeña: menos resolución
  base: string; // color de los departamentos sin datos
  onHover: (name: string | null, x: number, y: number) => void;
  onPick: (name: string) => void;
}
export interface MapScene {
  setData: (heights: Map<string, number>, colors: Map<string, string>, selected: string | null) => void;
  rotate: (deg: number) => void;
  setTop: (top: boolean) => void;
  dispose: () => void;
}

const MAX_H = 2.6; // altura del departamento con el valor máximo, en las mismas unidades que el mapa (~1 = 111 km)
const MIN_H = 0.06; // altura de un departamento sin datos o con 0: se ve como una losa
const DUR = 700;
const ease = (t: number) => 1 - (1 - t) ** 3;

interface Dept { name: string; meshes: Mesh[]; mat: MeshStandardMaterial; from: number; to: number; h: number; delay: number }

export function createScene(container: HTMLElement, o: SceneOpts): MapScene {
  // Si el navegador no tiene WebGL, esto lanza un error y Map3D muestra la tabla en su lugar.
  const renderer = new WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, o.small ? 1.5 : 2));
  const canvas = renderer.domElement;
  canvas.style.touchAction = "pan-y"; // el dedo sigue haciendo scroll: el mapa nunca lo bloquea
  container.appendChild(canvas);

  const scene = new Scene();
  const camera = new PerspectiveCamera(32, 1, 0.1, 400);
  scene.add(new HemisphereLight(0xcfe8ff, 0x0b1224, 1.25));
  const sun = new DirectionalLight(0xffffff, 1.7);
  sun.position.set(-6, 12, 8);
  scene.add(sun);

  // pivot gira alrededor del eje vertical; map tumba el plano XY para que la extrusión (z) apunte hacia arriba.
  const pivot = new Group();
  const map = new Group();
  map.rotation.x = -Math.PI / 2;
  pivot.add(map);
  scene.add(pivot);

  // Geometría: anillos proyectados; San Andrés ampliado alrededor de su centro.
  const rings = o.features.map((f) => ({
    name: f.properties.name,
    polys: f.geometry.coordinates.map((poly) => {
      const pts = poly[0].map((p) => project(p));
      return f.properties.name === ISLAND ? zoomAround(pts, ISLAND_ZOOM) : pts;
    }),
  }));
  const box = new Box2();
  rings.forEach((r) => r.polys.forEach((p) => p.forEach(([x, y]) => box.expandByPoint(new Vector2(x, y)))));
  const center = box.getCenter(new Vector2());
  const size = box.getSize(new Vector2());

  const lineMat = new LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.28 });
  const depts: Dept[] = rings.map((r) => {
    const mat = new MeshStandardMaterial({ color: o.base, roughness: 0.6, metalness: 0.05 });
    const meshes = r.polys.map((pts) => {
      const shape = new Shape(pts.map(([x, y]) => new Vector2(x - center.x, y - center.y)));
      const mesh = new Mesh(new ExtrudeGeometry(shape, { depth: 1, bevelEnabled: false }), mat);
      mesh.userData.name = r.name;
      // Contorno de la cara superior: hijo de la malla en z=1, así sube con la escala sin recalcular nada.
      const edge = new LineLoop(new BufferGeometry().setFromPoints(shape.getPoints()), lineMat);
      edge.position.z = 1.002;
      mesh.add(edge);
      mesh.scale.z = MIN_H;
      map.add(mesh);
      return mesh;
    });
    // Entrada escalonada de oeste a este (solo la primera vez y sin reduced-motion).
    const west = (Math.min(...r.polys.flat().map((p) => p[0])) - box.min.x) / (size.x || 1);
    return { name: r.name, meshes, mat, from: MIN_H, to: MIN_H, h: MIN_H, delay: o.reduced ? 0 : west * 450 };
  });
  const meshes = depts.flatMap((d) => d.meshes);

  // Cámara: inclinada (vista por defecto) o cenital; se encuadra al tamaño del contenedor.
  let tilt = 0.95, tiltTo = tilt, rotY = 0, rotTo = 0;
  const fit = () => {
    const w = container.clientWidth || 1, h = container.clientHeight || 1;
    camera.aspect = w / h;
    const fov = (camera.fov * Math.PI) / 180;
    // Inclinada, la profundidad (norte-sur) se ve acortada por sin(tilt): no hace falta encuadrarla entera.
    const fitH = (size.y * 0.5 * Math.sin(tilt) + MAX_H * 0.5 * Math.cos(tilt)) / Math.tan(fov / 2);
    const fitW = (size.x * 0.5) / (Math.tan(fov / 2) * camera.aspect);
    const dist = Math.max(fitH, fitW) * 1.12;
    camera.position.set(0, Math.sin(tilt) * dist, Math.cos(tilt) * dist); // tilt = elevación sobre el horizonte
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
  };

  // Dibujo bajo demanda: un fotograma cuando algo cambia, y seguido solo mientras dura una transición.
  let visible = true, frame = 0, start = 0, intro = true, dirty = true;
  const animating = () => depts.some((d) => d.h !== d.to) || Math.abs(rotY - rotTo) > 1e-4 || Math.abs(tilt - tiltTo) > 1e-4;
  const tick = (now: number) => {
    frame = 0;
    if (!visible || document.hidden) return; // se retoma al volver (IntersectionObserver / visibilitychange)
    const t0 = start || now;
    for (const d of depts) {
      const t = o.reduced ? 1 : Math.min(1, Math.max(0, (now - t0 - (intro ? d.delay : 0)) / DUR));
      d.h = t >= 1 ? d.to : d.from + (d.to - d.from) * ease(t);
      for (const m of d.meshes) m.scale.z = d.h;
    }
    const k = o.reduced ? 1 : 0.16;
    rotY = Math.abs(rotTo - rotY) < 1e-4 ? rotTo : rotY + (rotTo - rotY) * k;
    tilt = Math.abs(tiltTo - tilt) < 1e-4 ? tiltTo : tilt + (tiltTo - tilt) * k;
    pivot.rotation.y = rotY;
    fit();
    renderer.render(scene, camera);
    dirty = false;
    if (animating()) frame = requestAnimationFrame(tick);
    else intro = false;
  };
  const request = () => {
    dirty = true;
    if (!frame) frame = requestAnimationFrame(tick);
  };

  // Puntero: el ratón gira arrastrando; tocar o hacer clic sin arrastrar elige un departamento.
  const ray = new Raycaster();
  const ndc = new Vector2();
  let hovered: string | null = null, selected: string | null = null;
  const pick = (e: PointerEvent): string | null => {
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    return (ray.intersectObjects(meshes, false)[0]?.object.userData.name as string | undefined) ?? null;
  };
  const paint = () => {
    for (const d of depts) d.mat.emissive.setHex(d.name === selected ? 0x2a4a66 : d.name === hovered ? 0x1c2c44 : 0x000000);
    request();
  };
  let drag: { x: number; moved: boolean } | null = null;
  const onDown = (e: PointerEvent) => {
    if (e.pointerType === "mouse" || e.pointerType === "pen") { drag = { x: e.clientX, moved: false }; canvas.setPointerCapture(e.pointerId); }
  };
  const onMove = (e: PointerEvent) => {
    if (drag && e.buttons) {
      const dx = e.clientX - drag.x;
      if (Math.abs(dx) > 3) drag.moved = true;
      drag.x = e.clientX;
      rotTo += dx * 0.008;
      rotY = o.reduced ? rotTo : rotY; // con reduced-motion el giro sigue al ratón sin inercia
      request();
      return;
    }
    const name = pick(e);
    if (name !== hovered) { hovered = name; paint(); }
    canvas.style.cursor = name ? "pointer" : drag ? "grab" : "default";
    o.onHover(name, e.clientX, e.clientY);
  };
  const onUp = (e: PointerEvent) => {
    const moved = drag?.moved;
    drag = null;
    if (moved) return;
    const name = pick(e);
    if (e.pointerType === "touch") { hovered = name; paint(); o.onHover(name, e.clientX, e.clientY); }
    if (name) o.onPick(name);
  };
  const onLeave = () => { if (hovered) { hovered = null; paint(); } o.onHover(null, 0, 0); };
  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerup", onUp);
  canvas.addEventListener("pointerleave", onLeave);

  const io = new IntersectionObserver(([en]) => { visible = en.isIntersecting; if (visible && (dirty || animating())) request(); });
  io.observe(container);
  const onVis = () => { if (!document.hidden) request(); };
  document.addEventListener("visibilitychange", onVis);
  const ro = new ResizeObserver(request);
  ro.observe(container);

  return {
    setData(heights, colors, sel) {
      start = performance.now();
      for (const d of depts) {
        d.from = d.h;
        d.to = MIN_H + (heights.get(d.name) ?? 0) * MAX_H;
        d.mat.color.set(colors.get(d.name) ?? o.base);
      }
      selected = sel;
      paint();
    },
    rotate(deg) { rotTo += (deg * Math.PI) / 180; request(); },
    setTop(top) { tiltTo = top ? 1.5 : 0.95; request(); },
    dispose() {
      cancelAnimationFrame(frame);
      io.disconnect(); ro.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointerleave", onLeave);
      map.traverse((obj) => { if (obj instanceof Mesh || obj instanceof LineLoop) obj.geometry.dispose(); });
      depts.forEach((d) => d.mat.dispose());
      lineMat.dispose();
      renderer.dispose();
      canvas.remove();
    },
  };
}
