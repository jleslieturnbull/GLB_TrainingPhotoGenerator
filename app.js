// GLB Screenshot Exporter (vNext2)
// - import map based (three + three/addons)
// - HDRIs loaded per session (folder/zip)
// - POIs (points of interest) based on object names
// - Object visibility toggles respected at export

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { KTX2Loader } from "three/addons/loaders/KTX2Loader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { RGBELoader } from "three/addons/loaders/RGBELoader.js";
import { EXRLoader } from "three/addons/loaders/EXRLoader.js";
import { RectAreaLightUniformsLib } from "three/addons/lights/RectAreaLightUniformsLib.js";
import JSZip from "https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm";

const $ = (id) => document.getElementById(id);

const state = {
  scene: null,
  camera: null,
  renderer: null,
  controls: null,
  root: null,
  loader: null,

  pmrem: null,

  bbox: new THREE.Box3(),
  sphere: new THREE.Sphere(),

  stats: null,
  baseCamPos: new THREE.Vector3(),
  baseTarget: new THREE.Vector3(),

  modelCenter: new THREE.Vector3(),
  modelRadius: 1.0,

  // session HDRIs
  hdri: {
    files: [],        // [{ name, ext, url }]
    cache: new Map(), // url -> { envTex, bgTex, hdrTex, envRT }
    selectedUrl: "",
    useAsBackground: false,
    objectUrls: [],   // urls we created via URL.createObjectURL
  },

  // helix light
  helix: {
    light: null,
    enabled: true,
    intensity: 55,
    turns: 1.5,
  },

  // objects list
  objects: [], // [{ id, name, path, obj }]
  objFilter: "",

  // POI mode
  poi: {
    active: false,
    currentObjectId: null,
    list: [], // [{ id, name, cameraPos, cameraQuat, target, fov }]
    savedViewBefore: null, // { pos, quat, target, fov }
  },
};

function log(msg) {
  const el = $("log");
  const t = new Date().toLocaleTimeString();
  el.textContent += `[${t}] ${msg}\n`;
  el.scrollTop = el.scrollHeight;
  console.log(msg);
}

function setBadge(text) { $("badge").textContent = text; }

function applyBackground() {
  const bg = $("bg").value;
  const view = $("view");
  const renderer = state.renderer;

  if (bg === "transparent") {
    renderer.setClearColor(0x000000, 0);
    view.style.background = "transparent";
  } else {
    let css = "#ffffff";
    let col = 0xffffff;
    if (bg === "lightgray") { css = "#f1f2f4"; col = 0xf1f2f4; }
    if (bg === "darkgray") { css = "#2a2f3a"; col = 0x2a2f3a; }
    renderer.setClearColor(col, 1);
    view.style.background = css;
  }
}

function setupLights() {
  // Remove old non-ambient lights (keep helix separately)
  const toRemove = [];
  state.scene.traverse((o) => {
    if (o.isDirectionalLight || o.isPointLight) toRemove.push(o);
  });
  toRemove.forEach((l) => state.scene.remove(l));

  const mode = $("light").value;
  if (mode === "studio") {
    const key = new THREE.DirectionalLight(0xffffff, 1.2); key.position.set(3, 5, 2);
    const fill = new THREE.DirectionalLight(0xffffff, 0.55); fill.position.set(-4, 3, -2);
    const rim = new THREE.DirectionalLight(0xffffff, 0.65); rim.position.set(-2, 4, 5);
    state.scene.add(key, fill, rim);
  } else if (mode === "hard") {
    const key = new THREE.DirectionalLight(0xffffff, 1.6); key.position.set(5, 6, 2);
    const fill = new THREE.DirectionalLight(0xffffff, 0.25); fill.position.set(-2, 2, -4);
    state.scene.add(key, fill);
  } else {
    const key = new THREE.DirectionalLight(0xffffff, 0.9); key.position.set(2, 5, 1);
    const rim = new THREE.DirectionalLight(0xffffff, 1.0); rim.position.set(-2, 4, 6);
    const fill = new THREE.DirectionalLight(0xffffff, 0.35); fill.position.set(-4, 2.5, -2);
    state.scene.add(key, rim, fill);
  }
}

function init3D() {
  const view = $("view");
  const canvas = document.createElement("canvas");
  view.appendChild(canvas);

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    preserveDrawingBuffer: true,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 2000);
  camera.position.set(2.2, 1.6, 2.2);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.target.set(0, 0.6, 0);

  scene.add(new THREE.AmbientLight(0xffffff, 0.35));

  // PMREM for environments
  state.pmrem = new THREE.PMREMGenerator(renderer);
  state.pmrem.compileEquirectangularShader();

  // Helix RectAreaLight support
  RectAreaLightUniformsLib.init();
  const helixLight = new THREE.RectAreaLight(0xffffff, state.helix.intensity, 1.0, 1.0);
  state.helix.light = helixLight;
  scene.add(helixLight);

  state.scene = scene;
  state.camera = camera;
  state.renderer = renderer;
  state.controls = controls;

  // GLTF loader config
  const loader = new GLTFLoader();

  const draco = new DRACOLoader();
  draco.setDecoderPath("./three/examples/jsm/libs/draco/");
  loader.setDRACOLoader(draco);

  loader.setMeshoptDecoder(MeshoptDecoder);

  const ktx2 = new KTX2Loader();
  ktx2.setTranscoderPath("./three/examples/jsm/libs/basis/");
  ktx2.detectSupport(renderer);
  loader.setKTX2Loader(ktx2);

  state.loader = loader;

  // Resize
  const onResize = () => {
    const r = view.getBoundingClientRect();
    renderer.setSize(r.width, r.height, false);
    camera.aspect = r.width / r.height;
    camera.updateProjectionMatrix();
  };
  window.addEventListener("resize", onResize);
  onResize();

  // Render loop
  const tick = () => {
    requestAnimationFrame(tick);
    controls.update();
    renderer.render(scene, camera);
  };
  tick();

  log("3D initialized.");
}

function disposeMaterial(mat) {
  if (!mat) return;
  const mats = Array.isArray(mat) ? mat : [mat];
  mats.forEach((m) => {
    for (const k of ["map","normalMap","roughnessMap","metalnessMap","aoMap","emissiveMap","alphaMap"]) {
      if (m[k]) m[k].dispose?.();
    }
    m.dispose?.();
  });
}

function clearModel() {
  if (!state.root) return;
  state.scene.remove(state.root);
  state.root.traverse((o) => {
    if (o.geometry) o.geometry.dispose?.();
    if (o.material) disposeMaterial(o.material);
  });
  state.root = null;
  state.stats = null;
  state.objects = [];
  state.poi.list = [];
  state.poi.active = false;
  state.poi.currentObjectId = null;

  $("objList").innerHTML = "";
  $("poiList").innerHTML = "";
  $("objFilter").value = "";
  $("objFilter").disabled = true;

  setBadge("No model loaded");
}

function computeModelStats(root) {
  let tris = 0;
  const materials = new Map();

  root.traverse((obj) => {
    if (obj.isMesh && obj.geometry) {
      const g = obj.geometry;
      const idx = g.index;
      const triCount = idx ? idx.count / 3 : (g.attributes.position?.count || 0) / 3;
      tris += triCount;

      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      mats.filter(Boolean).forEach((m) => {
        if (!materials.has(m.uuid)) {
          materials.set(m.uuid, {
            name: m.name || "(unnamed)",
            type: m.type,
            maps: ["map","normalMap","roughnessMap","metalnessMap","aoMap","emissiveMap","alphaMap"]
              .filter((k) => !!m[k])
          });
        }
      });
    }
  });

  const bbox = new THREE.Box3().setFromObject(root);
  const size = new THREE.Vector3();
  bbox.getSize(size);

  return {
    triangles: Math.round(tris),
    materials: Array.from(materials.values()),
    bboxMin: bbox.min.toArray(),
    bboxMax: bbox.max.toArray(),
    dimensionsMeters: { x: size.x, y: size.y, z: size.z },
    dimensionsCM: { x: size.x * 100, y: size.y * 100, z: size.z * 100 },
  };
}

function fitCameraToRoot(root) {
  const padPct = Number($("pad").value) / 100;
  const camera = state.camera;
  const controls = state.controls;

  state.bbox.setFromObject(root);
  const bbox = state.bbox.clone();
  const minY = bbox.min.y;
  root.position.y -= minY;

  state.bbox.setFromObject(root);
  state.bbox.getBoundingSphere(state.sphere);

  const rawRadius = state.sphere.radius;
  const radius = rawRadius * (1 + padPct);
  const center = state.sphere.center.clone();

  state.modelCenter.copy(center);
  state.modelRadius = rawRadius;

  const fov = THREE.MathUtils.degToRad(camera.fov);
  const dist = radius / Math.sin(fov / 2);

  const dir = new THREE.Vector3(1, 0.7, 1).normalize();
  camera.position.copy(center.clone().add(dir.multiplyScalar(dist)));
  camera.near = Math.max(0.001, dist / 200);
  camera.far = Math.max(50, dist * 4);
  camera.updateProjectionMatrix();

  controls.target.copy(center);
  controls.update();

  state.baseCamPos.copy(camera.position);
  state.baseTarget.copy(controls.target);

  setHelixLightPose(0.0, center);

  log(`Camera fit: r=${radius.toFixed(3)}m d=${dist.toFixed(3)}m`);
}

function setCameraToSavedView(view) {
  const cam = state.camera;
  cam.position.fromArray(view.pos);
  cam.quaternion.fromArray(view.quat);
  cam.fov = view.fov;
  cam.updateProjectionMatrix();
  state.controls.target.fromArray(view.target);
  state.controls.update();
}

function saveCurrentView() {
  return {
    pos: state.camera.position.toArray(),
    quat: state.camera.quaternion.toArray(),
    target: state.controls.target.toArray(),
    fov: state.camera.fov,
  };
}

function resetView() {
  if (!state.root) return;
  state.controls.target.copy(state.baseTarget);
  state.camera.position.copy(state.baseCamPos);
  state.camera.lookAt(state.baseTarget);
  state.camera.updateProjectionMatrix();
  state.controls.update();
  setupLights();
  applyBackground();
  log("View reset.");
}

function buildObjectList() {
  state.objects = [];
  const root = state.root;

  const items = [];
  const buildPath = (obj) => {
    const parts = [];
    let cur = obj;
    while (cur && cur !== root) {
      if (cur.name) parts.push(cur.name);
      else if (cur.type) parts.push(cur.type);
      cur = cur.parent;
    }
    return parts.reverse().join(" / ");
  };

  let counter = 0;
  root.traverse((obj) => {
    if (obj === root) return;
    // include all nodes that have children or meshes (for merchant-y layer toggles)
    if (obj.isMesh || obj.children?.length) {
      counter++;
      const name = obj.name?.trim() || `${obj.type}_${counter}`;
      const path = buildPath(obj) || name;
      const id = obj.uuid;
      state.objects.push({ id, name, path, obj });
    }
  });

  $("objFilter").disabled = false;
  renderObjectList();
}

function renderObjectList() {
  const filter = ($("objFilter").value || "").toLowerCase().trim();
  const list = $("objList");
  list.innerHTML = "";

  const shown = state.objects
    .filter(o => !filter || o.path.toLowerCase().includes(filter) || o.name.toLowerCase().includes(filter))
    .slice(0, 4000); // avoid DOM explosions

  for (const item of shown) {
    const row = document.createElement("div");
    row.className = "itemRow";

    const name = document.createElement("div");
    name.className = "name";
    name.title = item.path;
    name.textContent = item.path;

    const eye = document.createElement("div");
    eye.className = "iconBtn" + (item.obj.visible ? "" : " off");
    eye.title = item.obj.visible ? "Hide" : "Show";
    eye.textContent = item.obj.visible ? "👁" : "🚫";
    eye.onclick = () => {
      item.obj.visible = !item.obj.visible;
      renderObjectList();
    };

    const cam = document.createElement("div");
    cam.className = "iconBtn";
    cam.title = "Set POI for this object";
    cam.textContent = "📷";
    cam.onclick = () => enterPOIMode(item.id);

    row.appendChild(name);
    row.appendChild(eye);
    row.appendChild(cam);
    list.appendChild(row);
  }

  log(`Objects listed: ${shown.length}${shown.length !== state.objects.length ? ` (filtered from ${state.objects.length})` : ""}`);
}

function showPOIOverlay(show, title = "") {
  const overlay = $("poiOverlay");
  overlay.style.display = show ? "block" : "none";
  $("poiTitle").textContent = title || "Setting POI";
}

function focusOnObject(obj) {
  const box = new THREE.Box3().setFromObject(obj);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);

  const radius = Math.max(size.x, size.y, size.z) * 0.5;

  const cam = state.camera;
  const controls = state.controls;

  const dir = cam.position.clone().sub(controls.target).normalize();
  const fov = THREE.MathUtils.degToRad(cam.fov);
  const dist = (radius / Math.sin(fov / 2)) * 1.15; // slight pad

  cam.position.copy(center.clone().add(dir.multiplyScalar(dist)));
  cam.near = Math.max(0.001, dist / 200);
  cam.far = Math.max(50, dist * 4);
  cam.updateProjectionMatrix();

  controls.target.copy(center);
  controls.update();
}

function enterPOIMode(objectId) {
  if (!state.root) return;
  const found = state.objects.find(o => o.id === objectId);
  if (!found) return;

  state.poi.active = true;
  state.poi.currentObjectId = objectId;
  state.poi.savedViewBefore = saveCurrentView();

  // Focus camera/target on object
  focusOnObject(found.obj);
  showPOIOverlay(true, `Point of Interest: ${found.path}`);
  log(`POI mode: focusing on "${found.path}"`);
}

function exitPOIMode(restore = true) {
  if (!state.poi.active) return;
  state.poi.active = false;
  const prev = state.poi.savedViewBefore;
  state.poi.savedViewBefore = null;
  state.poi.currentObjectId = null;
  showPOIOverlay(false);

  if (restore && prev) {
    setCameraToSavedView(prev);
  } else {
    resetView();
  }
}

function savePOI() {
  const objectId = state.poi.currentObjectId;
  const found = state.objects.find(o => o.id === objectId);
  if (!found) {
    log("POI save failed: object no longer exists.");
    exitPOIMode(true);
    return;
  }

  const id = crypto?.randomUUID?.() || `${Date.now()}_${Math.random()}`;
  const view = saveCurrentView();

  state.poi.list.push({
    id,
    name: found.path,
    view,
  });

  renderPOIList();
  log(`Saved POI: ${found.path}`);
  exitPOIMode(false); // keep current view after saving
}

function renderPOIList() {
  const list = $("poiList");
  list.innerHTML = "";

  for (const poi of state.poi.list) {
    const row = document.createElement("div");
    row.className = "poiRow";

    const name = document.createElement("div");
    name.className = "name";
    name.textContent = poi.name;
    name.title = "Click to preview this POI view";
    name.onclick = (e) => {
      e.stopPropagation();
      setCameraToSavedView(poi.view);
      log(`Preview POI: ${poi.name}`);
    };

    const del = document.createElement("div");
    del.className = "iconBtn";
    del.textContent = "✕";
    del.title = "Remove POI";
    del.onclick = (e) => {
      e.stopPropagation();
      state.poi.list = state.poi.list.filter(p => p.id !== poi.id);
      renderPOIList();
      log(`Removed POI: ${poi.name}`);
    };

    row.appendChild(name);
    row.appendChild(del);
    list.appendChild(row);
  }
}

// ---------------- HDRI session loading ----------------
function revokeObjectUrls() {
  for (const url of state.hdri.objectUrls) {
    try { URL.revokeObjectURL(url); } catch {}
  }
  state.hdri.objectUrls = [];
}

function clearHDRIs() {
  state.hdri.files = [];
  state.hdri.cache.clear();
  state.hdri.selectedUrl = "";
  revokeObjectUrls();

  $("hdriSelect").innerHTML = '<option value="">(none)</option>';
  $("hdriStatus").textContent = "No HDRIs loaded.";
  state.scene.environment = null;
  state.scene.background = null;
  applyBackground();
  log("HDRIs cleared.");
}

function setHDRIUIList() {
  const sel = $("hdriSelect");
  const opts = ['<option value="">(none)</option>']
    .concat(state.hdri.files.map(f => `<option value="${f.url}">${f.name}</option>`));
  sel.innerHTML = opts.join("");
  $("hdriStatus").textContent = `Loaded ${state.hdri.files.length} HDRI(s).`;
}

async function loadEnvTexture(fileRec) {
  const url = fileRec.url;
  if (state.hdri.cache.has(url)) return state.hdri.cache.get(url);

  let tex;
  if (fileRec.ext === "hdr") {
    tex = await new RGBELoader().loadAsync(url);
  } else {
    // exr
    tex = await new EXRLoader().loadAsync(url);
    // EXRLoader returns DataTexture; ensure correct color space for env:
    tex.colorSpace = THREE.LinearSRGBColorSpace;
  }

  tex.mapping = THREE.EquirectangularReflectionMapping;

  const envRT = state.pmrem.fromEquirectangular(tex);
  const envTex = envRT.texture;

  const data = { tex, envRT, envTex };
  state.hdri.cache.set(url, data);
  return data;
}

async function applyHDRI(url) {
  if (!url) {
    state.hdri.selectedUrl = "";
    state.scene.environment = null;
    state.scene.background = null;
    applyBackground();
    return;
  }

  const fileRec = state.hdri.files.find(f => f.url === url);
  if (!fileRec) return;

  const data = await loadEnvTexture(fileRec);
  state.hdri.selectedUrl = url;
  state.scene.environment = data.envTex;

  if (state.hdri.useAsBackground) {
    state.scene.background = data.tex;
  } else {
    state.scene.background = null;
    applyBackground();
  }
}

function validateHdriFiles(files) {
  const good = [];
  for (const f of files) {
    const name = f.name || "";
    const lower = name.toLowerCase();
    if (lower.endsWith(".hdr")) good.push({ file: f, ext: "hdr" });
    else if (lower.endsWith(".exr")) good.push({ file: f, ext: "exr" });
  }
  return good;
}

async function loadHdriFromFolderPicker() {
  // Prefer File System Access API when available and in secure context; fallback to <input webkitdirectory>.
  try {
    if ("showDirectoryPicker" in window) {
      const dirHandle = await window.showDirectoryPicker();
      const entries = [];
      for await (const [name, handle] of dirHandle.entries()) {
        if (handle.kind === "file") {
          const file = await handle.getFile();
          entries.push(file);
        }
      }
      const valid = validateHdriFiles(entries);
      if (!valid.length) {
        log("No .hdr/.exr files found in selected folder.");
        return;
      }
      ingestHdriFileRecords(valid.map(v => v.file));
      return;
    }
  } catch (e) {
    log(`Folder picker error (falling back): ${e?.message || e}`);
  }

  $("hdriFolderInput").click();
}

async function loadHdriFromZip(file) {
  const buf = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(buf);

  const found = [];
  for (const [path, entry] of Object.entries(zip.files)) {
    if (entry.dir) continue;
    const lower = path.toLowerCase();
    if (lower.endsWith(".hdr") || lower.endsWith(".exr")) {
      found.push(entry);
    }
  }

  if (!found.length) {
    log("ZIP contains no .hdr/.exr files.");
    return;
  }

  // Extract as blobs
  const blobs = [];
  for (const entry of found) {
    const blob = await entry.async("blob");
    // Create a File-like with name
    blobs.push(new File([blob], entry.name.split("/").pop(), { type: "application/octet-stream" }));
  }

  ingestHdriFileRecords(blobs);
}

function ingestHdriFileRecords(fileList) {
  // Clear existing session HDRIs
  clearHDRIs();

  const valid = validateHdriFiles(fileList);
  if (!valid.length) {
    log("No valid .hdr/.exr files to ingest.");
    return;
  }

  for (const v of valid) {
    const url = URL.createObjectURL(v.file);
    state.hdri.objectUrls.push(url);
    state.hdri.files.push({ name: v.file.name, ext: v.ext, url });
  }

  // Sort alpha for stability
  state.hdri.files.sort((a,b) => a.name.localeCompare(b.name));
  setHDRIUIList();
  log(`HDRIs ingested: ${state.hdri.files.length}`);
}
// ------------------------------------------------------

// ---------------- Helix light ----------------
function smoothstep(t) { return t * t * (3 - 2 * t); }

function setHelixLightPose(t, center) {
  const light = state.helix.light;
  if (!light) return;

  light.intensity = state.helix.intensity;
  light.visible = state.helix.enabled && light.intensity > 0.001;

  const radius = Math.max(0.001, state.modelRadius);

  const turns = state.helix.turns;
  const theta0 = Math.PI * 0.25;
  const theta = theta0 + turns * Math.PI * 2 * t;

  const r = radius * 2.2 * (1.0 + 0.12 * Math.sin(Math.PI * 2 * t));
  const yStart = center.y + radius * 2.0;
  const yEnd   = center.y + radius * 0.35;
  const y = THREE.MathUtils.lerp(yStart, yEnd, smoothstep(t));

  const x = center.x + r * Math.cos(theta);
  const z = center.z + r * Math.sin(theta);

  light.position.set(x, y, z);
  light.lookAt(center);

  light.width = radius * 1.6;
  light.height = radius * 1.0;
}
// --------------------------------------------

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function renderToBlob(sizePx) {
  const renderer = state.renderer;
  const camera = state.camera;

  const prevPixelRatio = renderer.getPixelRatio();

  renderer.setPixelRatio(1);
  renderer.setSize(sizePx, sizePx, false);
  camera.aspect = 1;
  camera.updateProjectionMatrix();

  // settle
  for (let i=0;i<2;i++) {
    state.controls.update();
    renderer.render(state.scene, camera);
    await sleep(10);
  }

  const blob = await new Promise((resolve) => renderer.domElement.toBlob(resolve, "image/png"));

  // restore to view size
  const view = $("view");
  const r = view.getBoundingClientRect();
  renderer.setPixelRatio(prevPixelRatio);
  renderer.setSize(r.width, r.height, false);
  camera.aspect = r.width / r.height;
  camera.updateProjectionMatrix();

  return blob;
}

function buildBaseShotList(count) {
  const shots = [];

  const addTT = (n) => {
    for (let i=0;i<n;i++) shots.push({ type:"tt", name:`tt_${String(i).padStart(2,"0")}`, yaw:(i/n)*Math.PI*2, pitch:0.20 });
  };

  if (count === 12) {
    addTT(8);
    shots.push({ type:"fixed", name:"front", yaw:0, pitch:0.20 });
    shots.push({ type:"fixed", name:"back", yaw:Math.PI, pitch:0.20 });
    shots.push({ type:"fixed", name:"top", yaw:0, pitch:Math.PI/2 - 0.05 });
    shots.push({ type:"fixed", name:"bottom", yaw:0, pitch:-Math.PI/2 + 0.05 });
  } else if (count === 15) {
    addTT(12);
    shots.push({ type:"fixed", name:"front", yaw:0, pitch:0.20 });
    shots.push({ type:"fixed", name:"top", yaw:0, pitch:Math.PI/2 - 0.05 });
    shots.push({ type:"fixed", name:"bottom", yaw:0, pitch:-Math.PI/2 + 0.05 });
  } else { // 18
    addTT(12);
    shots.push({ type:"fixed", name:"front", yaw:0, pitch:0.20 });
    shots.push({ type:"fixed", name:"back", yaw:Math.PI, pitch:0.20 });
    shots.push({ type:"fixed", name:"left", yaw:-Math.PI/2, pitch:0.20 });
    shots.push({ type:"fixed", name:"right", yaw:Math.PI/2, pitch:0.20 });
    shots.push({ type:"fixed", name:"top", yaw:0, pitch:Math.PI/2 - 0.05 });
    shots.push({ type:"fixed", name:"bottom", yaw:0, pitch:-Math.PI/2 + 0.05 });
  }

  return shots;
}

function setSphericalAround(center, dist, yaw, pitch) {
  const cam = state.camera;
  const x = Math.cos(pitch) * Math.sin(yaw);
  const y = Math.sin(pitch);
  const z = Math.cos(pitch) * Math.cos(yaw);
  cam.position.copy(center.clone().add(new THREE.Vector3(x,y,z).multiplyScalar(dist)));
  cam.lookAt(center);
  state.controls.target.copy(center);
  state.controls.update();
}

async function exportZip() {
  if (!state.root || !state.stats) return;

  const baseName = ($("fileName").textContent.split(" (")[0] || "product").replace(/\.[^/.]+$/, "");
  const ts = new Date().toISOString().replace(/[:.]/g,"-");
  const zipName = `export_${baseName}_${ts}.zip`;

  const count = Number($("count").value);
  const sizePx = Number($("imgSize").value);

  const baseShots = buildBaseShotList(count);
  const poiShots = state.poi.list.map((p, idx) => ({ type:"poi", name:`poi_${String(idx).padStart(2,"0")}`, poi: p }));
  const shots = baseShots.concat(poiShots);

  log(`Export started: ${zipName} (${shots.length} shots)`);

  setBadge("Exporting…");
  $("export").disabled = true;

  // sync toggles
  state.hdri.useAsBackground = $("hdriUseAsBg").checked;
  state.helix.enabled = $("helixEnabled").checked;
  state.helix.intensity = Number($("helixIntensity").value);
  state.helix.turns = Number($("helixTurns").value);

  const cycleHdris = $("exportCycleHdris").checked && state.hdri.files.length > 0;
  const shotsPer = Math.max(1, Number($("shotsPerHdri").value || 1));

  // Save current view to restore after export
  const restore = saveCurrentView();
  const restoreBg = { env: state.scene.environment, bg: state.scene.background, hdri: state.hdri.selectedUrl, useBg: state.hdri.useAsBackground };

  // Fit camera first
  setupLights();
  if (!state.hdri.selectedUrl) applyBackground();
  fitCameraToRoot(state.root);

  const zip = new JSZip();
  const imgFolder = zip.folder("images");

  const cam = state.camera;
  const target = state.controls.target.clone();
  const dist = cam.position.distanceTo(target);

  for (let i=0; i<shots.length; i++) {
    const shot = shots[i];

    // HDRI selection for this shot
    if (cycleHdris) {
      const hdriIndex = Math.floor(i / shotsPer) % state.hdri.files.length;
      await applyHDRI(state.hdri.files[hdriIndex].url);
    } else if (state.hdri.selectedUrl) {
      await applyHDRI(state.hdri.selectedUrl);
    } else {
      state.scene.environment = null;
      state.scene.background = null;
      applyBackground();
    }

    // Pose camera for shot
    if (shot.type === "poi") {
      setCameraToSavedView(shot.poi.view);
    } else {
      setSphericalAround(state.modelCenter, dist, shot.yaw, shot.pitch);
    }

    // Helix light (over all shots)
    if (state.helix.enabled) {
      const t = shots.length === 1 ? 0 : i / (shots.length - 1);
      const center = state.controls.target.clone();
      setHelixLightPose(t, center);
    } else if (state.helix.light) {
      state.helix.light.visible = false;
    }

    const blob = await renderToBlob(sizePx);
    if (!blob) {
      log(`ERROR: render failed for ${shot.name}`);
      continue;
    }

    imgFolder.file(`${shot.name}.png`, blob);
    log(`Rendered ${shot.name}.png`);
  }

  // metadata
  const metadata = {
    version: "vNext2",
    createdAt: new Date().toISOString(),
    sourceFile: baseName,
    export: {
      shotCount: shots.length,
      baseShots: baseShots.map(s => ({ name: s.name, yaw: s.yaw, pitch: s.pitch })),
      poiShots: state.poi.list.map(p => ({ name: p.name, view: p.view })),
      imageSize: sizePx,
      exportCountSetting: count,
      paddingPercent: Number($("pad").value),
      background: $("bg").value,
      lighting: $("light").value,
      hdri: {
        cycle: cycleHdris,
        shotsPerHdri: shotsPer,
        useAsBackground: state.hdri.useAsBackground,
        loadedCount: state.hdri.files.length,
      },
      helix: {
        enabled: state.helix.enabled,
        intensity: state.helix.intensity,
        turns: state.helix.turns,
      }
    },
    model: state.stats,
  };
  zip.file("metadata.json", JSON.stringify(metadata, null, 2));

  const outBlob = await zip.generateAsync({ type:"blob", compression:"DEFLATE", compressionOptions:{ level:6 }});
  const a = document.createElement("a");
  a.href = URL.createObjectURL(outBlob);
  a.download = zipName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);

  // restore
  state.hdri.useAsBackground = restoreBg.useBg;
  if (restoreBg.hdri) await applyHDRI(restoreBg.hdri);
  else { state.scene.environment = restoreBg.env; state.scene.background = restoreBg.bg; applyBackground(); }
  setCameraToSavedView(restore);

  setBadge("Ready");
  $("export").disabled = false;
  log("Export complete.");
}

async function loadGLBFile(file) {
  if (!file) return;
  $("fileName").textContent = `${file.name} (${Math.round(file.size/1024)} KB)`;
  log(`Selected file: ${file.name}`);

  clearModel();
  setBadge("Loading…");

  const url = URL.createObjectURL(file);

  const gltf = await new Promise((resolve, reject) => {
    state.loader.load(url, resolve, undefined, reject);
  }).catch((err) => {
    log(`ERROR loading GLB: ${err?.message || err}`);
    setBadge("Load failed (see log)");
    throw err;
  }).finally(() => {
    URL.revokeObjectURL(url);
  });

  const root = gltf.scene || gltf.scenes?.[0];
  if (!root) {
    log("ERROR: No scene found in glTF.");
    setBadge("Load failed (no scene)");
    return;
  }

  root.position.set(0, 0, 0);
  root.rotation.set(0, 0, 0);

  let meshCount = 0;
  root.traverse((o) => { if (o.isMesh) meshCount++; });
  log(`Mesh count: ${meshCount}`);

  state.scene.add(root);
  state.root = root;

  setupLights();
  applyBackground();
  fitCameraToRoot(root);

  state.stats = computeModelStats(root);
  $("dims").textContent = `${state.stats.dimensionsCM.x.toFixed(1)}cm × ${state.stats.dimensionsCM.y.toFixed(1)}cm × ${state.stats.dimensionsCM.z.toFixed(1)}cm`;
  $("tris").textContent = `${state.stats.triangles.toLocaleString()}`;
  $("mats").textContent = `${state.stats.materials.length}`;

  buildObjectList();
  renderPOIList();

  $("export").disabled = false;
  $("reset").disabled = false;

  setBadge("Ready");
  log("Model loaded.");
}

function wireUI() {
  // Defaults (match UI)
  $("padVal").textContent = $("pad").value;
  $("helixIntensityVal").textContent = $("helixIntensity").value;
  $("helixTurnsVal").textContent = Number($("helixTurns").value).toFixed(2);

  $("pad").addEventListener("input", () => {
    $("padVal").textContent = $("pad").value;
    if (state.root) fitCameraToRoot(state.root);
  });

  $("bg").addEventListener("change", () => {
    if (!state.hdri.selectedUrl || !state.hdri.useAsBackground) applyBackground();
  });

  $("light").addEventListener("change", () => { if (state.root) setupLights(); });

  $("file").addEventListener("change", (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    loadGLBFile(f).catch(() => {});
  });

  $("export").addEventListener("click", () => exportZip().catch((e) => {
    log(`ERROR during export: ${e?.message || e}`);
    setBadge("Export failed (see log)");
    $("export").disabled = false;
  }));

  $("reset").addEventListener("click", () => resetView());

  // HDRI UI
  $("hdriUseAsBg").addEventListener("change", () => {
    state.hdri.useAsBackground = $("hdriUseAsBg").checked;
    if (state.hdri.selectedUrl) applyHDRI(state.hdri.selectedUrl).catch(() => {});
    else applyBackground();
  });

  $("hdriSelect").addEventListener("change", () => {
    const url = $("hdriSelect").value || "";
    applyHDRI(url).catch((e) => log(`HDRI apply error: ${e?.message || e}`));
  });

  $("hdriLoadFolder").addEventListener("click", () => loadHdriFromFolderPicker().catch((e) => log(`HDRI folder error: ${e?.message || e}`)));
  $("hdriLoadZip").addEventListener("click", () => $("hdriZipInput").click());
  $("hdriClear").addEventListener("click", () => clearHDRIs());

  $("hdriFolderInput").addEventListener("change", (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    ingestHdriFileRecords(files);
    e.target.value = "";
  });

  $("hdriZipInput").addEventListener("change", (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    loadHdriFromZip(f).catch((err) => log(`ZIP load error: ${err?.message || err}`));
    e.target.value = "";
  });

  // Helix UI
  const syncHelixUI = () => {
    state.helix.enabled = $("helixEnabled").checked;
    state.helix.intensity = Number($("helixIntensity").value);
    state.helix.turns = Number($("helixTurns").value);
    $("helixIntensityVal").textContent = String(state.helix.intensity);
    $("helixTurnsVal").textContent = String(state.helix.turns.toFixed(2));
    setHelixLightPose(0.0, state.controls.target.clone());
  };

  $("helixEnabled").addEventListener("change", syncHelixUI);
  $("helixIntensity").addEventListener("input", syncHelixUI);
  $("helixTurns").addEventListener("input", syncHelixUI);

  // Objects filter
  $("objFilter").addEventListener("input", () => renderObjectList());

  // POI overlay buttons
  $("poiDone").addEventListener("click", () => savePOI());
  $("poiCancel").addEventListener("click", () => exitPOIMode(true));

  // Clicking outside overlay should not do anything; overlay is pointer-events:none except buttons.

  log("UI wired.");
}

init3D();
wireUI();
applyBackground();

log("Tip: HDRI folder picker uses showDirectoryPicker when supported; otherwise falls back to a folder file input.");
log("Tip: EXRLoader supports several EXR compressions; huge EXRs can be slow to load.");
