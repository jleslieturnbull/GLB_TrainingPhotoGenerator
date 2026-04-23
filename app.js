
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { TransformControls } from "three/addons/controls/TransformControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { KTX2Loader } from "three/addons/loaders/KTX2Loader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { RGBELoader } from "three/addons/loaders/RGBELoader.js";
import { EXRLoader } from "three/addons/loaders/EXRLoader.js";
import { RectAreaLightUniformsLib } from "three/addons/lights/RectAreaLightUniformsLib.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import JSZip from "https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm";

const $ = (id) => document.getElementById(id);

const SENSOR_PRESETS = {
  super16: { label: "Super 16 · 12.52 × 7.41 mm", width: 12.52, height: 7.41 },
  mft: { label: "Micro Four Thirds · 17.3 × 13.0 mm", width: 17.3, height: 13.0 },
  apsc: { label: "APS-C · 23.6 × 15.7 mm", width: 23.6, height: 15.7 },
  super35: { label: "Super 35 · 24.89 × 18.66 mm", width: 24.89, height: 18.66 },
  fullframe: { label: "Full Frame / 35mm · 36 × 24 mm", width: 36, height: 24 },
  vistavision: { label: "VistaVision · 37.72 × 24.92 mm", width: 37.72, height: 24.92 },
  medium44: { label: "Medium Format · 44 × 33 mm", width: 44, height: 33 },
  sixtyfive: { label: "65mm · 52.63 × 23.01 mm", width: 52.63, height: 23.01 },
  seventymm: { label: "70mm · 48.56 × 22.1 mm", width: 48.56, height: 22.1 },
  imax1570: { label: "IMAX 15/70 · 70.41 × 52.63 mm", width: 70.41, height: 52.63 },
};

const SPARK_MODULE_URL = "https://sparkjs.dev/releases/spark/0.1.10/spark.module.js";
const SPARK_BUTTERFLY_URL = "https://sparkjs.dev/assets/splats/butterfly.spz";
const LUMA_MODULE_URL = "https://cdn.jsdelivr.net/npm/@lumaai/luma-web@0.2.2/+esm";
const LUMA_SAMPLE_URL = "https://lumalabs.ai/capture/ca9ea966-ca24-4ec1-ab0f-af665cb546ff";

const TMP = {
  v1: new THREE.Vector3(),
  v2: new THREE.Vector3(),
  v3: new THREE.Vector3(),
  q1: new THREE.Quaternion(),
  q2: new THREE.Quaternion(),
  up: new THREE.Vector3(0, 1, 0),
  box: new THREE.Box3(),
  sphere: new THREE.Sphere(),
};

const state = {
  scene: null,
  camera: null,
  renderer: null,
  controls: null,
  transformControls: null,
  transformHelper: null,
  loader: null,
  pmrem: null,
  clock: (typeof THREE.Timer === "function" ? new THREE.Timer() : new THREE.Clock()),
  raycaster: new THREE.Raycaster(),
  pointer: new THREE.Vector2(),

  root: null,
  floor: { mesh: null },
  stats: null,
  modelCenter: new THREE.Vector3(),
  modelRadius: 1,
  baseView: null,

  selection: {
    object: null,
    type: "",
    mode: "translate",
    space: "world",
    pointerDown: null,
  },

  cameraRig: {
    sensorPreset: "fullframe",
    sensorWidth: SENSOR_PRESETS.fullframe.width,
    sensorHeight: SENSOR_PRESETS.fullframe.height,
    focalLength: 45,
    apertureF: 8.0,
    focalDistance: 6.0,
    dofEnabled: true,
    blurScaleRatio: 1.0,
    focusWorldPoint: null,
    rollDeg: 0,
  },

  keyboard: {
    pressed: new Set(),
    moveSpeed: 1.8,
    verticalSpeed: 1.5,
    movedThisFrame: false,
  },

  ui: {
    cameraSyncPending: false,
    lastCameraSyncAt: 0,
  },

  focusPick: {
    active: false,
  },

  hdri: {
    files: [],
    cache: new Map(),
    objectUrls: [],
    selectedUrl: "",
    useAsBackground: false,
  },

  preview: {
    enabled: false,
    renderer: null,
    composer: null,
    camera: null,
    bloomPass: null,
    surface: null,
    lastW: 0,
    lastH: 0,
    busy: false,
    dirty: true,
    nextAt: 0,
  },

  lighting: {
    bloom: 0,
    aoEnabled: false,
  },

  lights: {
    rigs: [],
    nextId: 1,
  },

  exportConfig: {
    advancedColor: false,
  },

  colorCorrection: {
    mode: "levels",
    levels: { inBlack: 0, gamma: 1, inWhite: 255, outBlack: 0, outWhite: 255 },
    curves: {
      points: [
        { x: 0, y: 255 },
        { x: 64, y: 192 },
        { x: 128, y: 128 },
        { x: 192, y: 64 },
        { x: 255, y: 0 },
      ],
      dragging: -1,
    },
  },

  bootstrapDirectionalRig: null,

  look: {
    smartStage: false,
    style: "warm",
    strength: 72,
  },

  helix: {
    light: null,
    helper: null,
    shadowLight: null,
    shadowTarget: null,
    enabled: true,
    shadowEnabled: true,
    intensity: 55,
    turns: 1.5,
    lightSize: 1.0,
    manual: false,
  },

  gsplat: {
    module: null,
    lumaModule: null,
    object: null,
    sparkRenderer: null,
    envMap: null,
    kind: "",
    loading: false,
    activeUrl: "",
    selectable: false,
    useForLighting: true,
    quality: "medium",
    fileUrl: "",
  },

  objects: [],
  poi: {
    active: false,
    currentObjectId: null,
    savedViewBefore: null,
    list: [],
  },
};

function log(msg) {
  const el = $("log");
  const t = new Date().toLocaleTimeString();
  el.textContent += `[${t}] ${msg}\n`;
  el.scrollTop = el.scrollHeight;
  console.log(msg);
}

function setBadge(text) {
  $("badge").textContent = text;
}

function make2DContext(canvas, opts = { willReadFrequently: true }) {
  if (!canvas || typeof canvas.getContext !== "function") return null;
  try { return canvas.getContext("2d", opts) || canvas.getContext("2d"); } catch { return null; }
}

function updatePreviewFrameAspect() {
  const surface = $("previewSurface");
  const view = $("view");
  if (!surface || !view) return;
  const r = view.getBoundingClientRect();
  const aspect = Math.max(0.25, r.width / Math.max(1, r.height));
  surface.style.aspectRatio = `${r.width} / ${Math.max(1, r.height)}`;
  surface.style.width = aspect >= 1 ? `min(360px, 34vw)` : `min(260px, 24vw)`;
  surface.style.height = "auto";
}

function getViewportFrameDims(longEdge = null) {
  const view = $("view");
  const r = view?.getBoundingClientRect?.() || { width: state.camera?.aspect || 1, height: 1 };
  let width = Math.max(2, Math.round(r.width || 2));
  let height = Math.max(2, Math.round(r.height || 2));
  if (longEdge && Number.isFinite(longEdge) && longEdge > 0) {
    const currentLong = Math.max(width, height);
    const scale = longEdge / Math.max(1, currentLong);
    width = Math.max(2, Math.round(width * scale));
    height = Math.max(2, Math.round(height * scale));
  }
  return { width, height };
}

const COLOR_SPACE_OPTIONS = ["srgb","linear","aces","agx","rec709","displayp3","log","raw"];

function getColorPipelineConfig() {
  const advanced = !!$("advancedColorMode")?.checked;
  return {
    advanced,
    basic: $("colorSpaceBasic")?.value || "srgb",
    input: $("inputColorSpace")?.value || "srgb",
    output: $("outputColorSpace")?.value || "srgb",
    lut: $("lutSelect")?.value || "standard",
  };
}

function getActiveDisplayColorSpace() {
  const cfg = getColorPipelineConfig();
  return cfg.advanced ? (cfg.output || "srgb") : (cfg.basic || "srgb");
}

function getRendererColorProfile(space = getActiveDisplayColorSpace()) {
  const linearSpace = ("LinearSRGBColorSpace" in THREE) ? THREE.LinearSRGBColorSpace : THREE.SRGBColorSpace;
  const agxTone = THREE.AgXToneMapping ?? THREE.ACESFilmicToneMapping;
  const neutralTone = THREE.NeutralToneMapping ?? THREE.ACESFilmicToneMapping;
  switch (space) {
    case "linear":
      return { outputColorSpace: linearSpace, toneMapping: THREE.NoToneMapping, exposure: 1.0, cssFilter: "brightness(1.02) contrast(0.98)", canvasFilter: "brightness(102%) contrast(98%)" };
    case "aces":
      return { outputColorSpace: THREE.SRGBColorSpace, toneMapping: THREE.ACESFilmicToneMapping, exposure: 1.0, cssFilter: "none", canvasFilter: "none" };
    case "agx":
      return { outputColorSpace: THREE.SRGBColorSpace, toneMapping: agxTone, exposure: 1.0, cssFilter: "saturate(0.98) contrast(1.01)", canvasFilter: "saturate(98%) contrast(101%)" };
    case "rec709":
      return { outputColorSpace: THREE.SRGBColorSpace, toneMapping: neutralTone, exposure: 1.0, cssFilter: "contrast(0.99) saturate(0.97)", canvasFilter: "contrast(99%) saturate(97%)" };
    case "displayp3":
      return { outputColorSpace: THREE.SRGBColorSpace, toneMapping: THREE.ACESFilmicToneMapping, exposure: 1.0, cssFilter: "saturate(1.06) contrast(1.01)", canvasFilter: "saturate(106%) contrast(101%)" };
    case "log":
      return { outputColorSpace: THREE.SRGBColorSpace, toneMapping: THREE.NoToneMapping, exposure: 1.0, cssFilter: "contrast(0.78) saturate(0.92) brightness(1.05)", canvasFilter: "contrast(78%) saturate(92%) brightness(105%)" };
    case "raw":
      return { outputColorSpace: linearSpace, toneMapping: THREE.NoToneMapping, exposure: 1.0, cssFilter: "none", canvasFilter: "none" };
    case "srgb":
    default:
      return { outputColorSpace: THREE.SRGBColorSpace, toneMapping: THREE.ACESFilmicToneMapping, exposure: 1.0, cssFilter: "none", canvasFilter: "none" };
  }
}

function cloneCanvasWithFilter(canvas, filter) {
  if (!canvas || !filter || filter === "none") return canvas;
  const out = document.createElement("canvas");
  out.width = canvas.width;
  out.height = canvas.height;
  const ctx = make2DContext(out);
  if (!ctx) return canvas;
  ctx.filter = filter;
  ctx.drawImage(canvas, 0, 0);
  ctx.filter = "none";
  return out;
}

function combineCssFilters(...filters) {
  return filters.filter((v) => !!v && v !== "none").join(" ") || "none";
}

function getInputColorProfile(space = getColorPipelineConfig().input || "srgb") {
  switch (space) {
    case "linear":
      return { cssFilter: "brightness(0.99) contrast(0.97)", canvasFilter: "brightness(99%) contrast(97%)" };
    case "aces":
      return { cssFilter: "contrast(1.03) saturate(1.02)", canvasFilter: "contrast(103%) saturate(102%)" };
    case "agx":
      return { cssFilter: "contrast(0.98) saturate(0.96)", canvasFilter: "contrast(98%) saturate(96%)" };
    case "rec709":
      return { cssFilter: "contrast(1.01) saturate(0.99)", canvasFilter: "contrast(101%) saturate(99%)" };
    case "displayp3":
      return { cssFilter: "saturate(1.08)", canvasFilter: "saturate(108%)" };
    case "log":
      return { cssFilter: "contrast(0.84) brightness(1.07) saturate(0.92)", canvasFilter: "contrast(84%) brightness(107%) saturate(92%)" };
    case "raw":
      return { cssFilter: "contrast(0.95) brightness(1.01)", canvasFilter: "contrast(95%) brightness(101%)" };
    case "srgb":
    default:
      return { cssFilter: "none", canvasFilter: "none" };
  }
}

function getColorCorrectionConfig() {
  return {
    mode: state.colorCorrection.mode,
    levels: { ...state.colorCorrection.levels },
    curves: {
      points: state.colorCorrection.curves.points.map((p) => ({ x: p.x, y: p.y })),
    },
  };
}

function buildLevelsLUT(levels = state.colorCorrection.levels) {
  const inBlack = THREE.MathUtils.clamp(Number(levels.inBlack ?? 0), 0, 254);
  const inWhite = THREE.MathUtils.clamp(Number(levels.inWhite ?? 255), inBlack + 1, 255);
  const gamma = THREE.MathUtils.clamp(Number(levels.gamma ?? 1), 0.1, 3.0);
  const outBlack = THREE.MathUtils.clamp(Number(levels.outBlack ?? 0), 0, 254);
  const outWhite = THREE.MathUtils.clamp(Number(levels.outWhite ?? 255), outBlack + 1, 255);
  const lut = new Uint8ClampedArray(256);
  for (let i = 0; i < 256; i++) {
    let v = (i - inBlack) / Math.max(1, inWhite - inBlack);
    v = THREE.MathUtils.clamp(v, 0, 1);
    v = Math.pow(v, 1 / gamma);
    const out = outBlack + v * (outWhite - outBlack);
    lut[i] = Math.round(THREE.MathUtils.clamp(out, 0, 255));
  }
  return lut;
}

function getSortedCurvePoints() {
  return state.colorCorrection.curves.points
    .map((p) => ({ x: THREE.MathUtils.clamp(Number(p.x), 0, 255), y: THREE.MathUtils.clamp(Number(p.y), 0, 255) }))
    .sort((a, b) => a.x - b.x);
}

function buildCurvesLUT(points = getSortedCurvePoints()) {
  const lut = new Uint8ClampedArray(256);
  const pts = points.slice().sort((a, b) => a.x - b.x);
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const span = Math.max(1, b.x - a.x);
    for (let x = a.x; x <= b.x; x++) {
      const t = (x - a.x) / span;
      const y = THREE.MathUtils.lerp(a.y, b.y, t);
      lut[x] = Math.round(THREE.MathUtils.clamp(255 - y, 0, 255));
    }
  }
  for (let x = 0; x < pts[0].x; x++) lut[x] = Math.round(THREE.MathUtils.clamp(255 - pts[0].y, 0, 255));
  for (let x = pts[pts.length - 1].x; x < 256; x++) lut[x] = Math.round(THREE.MathUtils.clamp(255 - pts[pts.length - 1].y, 0, 255));
  return lut;
}

function applyLUTToImageData(imageData, lut) {
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    data[i] = lut[data[i]];
    data[i + 1] = lut[data[i + 1]];
    data[i + 2] = lut[data[i + 2]];
  }
  return imageData;
}

function applyPixelLUT(canvas, lut) {
  if (!canvas || !lut) return canvas;
  const out = document.createElement("canvas");
  out.width = canvas.width;
  out.height = canvas.height;
  const ctx = make2DContext(out);
  if (!ctx) return canvas;
  ctx.drawImage(canvas, 0, 0);
  const imageData = ctx.getImageData(0, 0, out.width, out.height);
  ctx.putImageData(applyLUTToImageData(imageData, lut), 0, 0);
  return out;
}

function isNeutralColorCorrection() {
  if (state.colorCorrection.mode === "levels") {
    const l = state.colorCorrection.levels;
    return Number(l.inBlack) === 0 && Number(l.gamma) === 1 && Number(l.inWhite) === 255 && Number(l.outBlack) === 0 && Number(l.outWhite) === 255;
  }
  const pts = getSortedCurvePoints();
  const defaults = [0, 64, 128, 192, 255];
  return pts.every((p, i) => Math.round(p.x) === defaults[i] && Math.round(p.y) === 255 - defaults[i]);
}

function applyColorCorrection(canvas) {
  if (!canvas || isNeutralColorCorrection()) return canvas;
  if (state.colorCorrection.mode === "curves") return applyPixelLUT(canvas, buildCurvesLUT());
  return applyPixelLUT(canvas, buildLevelsLUT());
}

function getApproxViewportCorrectionFilter() {
  if (state.colorCorrection.mode === "levels") {
    const levels = state.colorCorrection.levels;
    const inputSpan = Math.max(1, Number(levels.inWhite) - Number(levels.inBlack));
    const outputSpan = Math.max(1, Number(levels.outWhite) - Number(levels.outBlack));
    const contrast = THREE.MathUtils.clamp(outputSpan / inputSpan, 0.7, 1.6);
    const lift = ((Number(levels.outBlack) - Number(levels.inBlack)) / 255) * 0.45;
    const gain = ((Number(levels.outWhite) - Number(levels.inWhite)) / 255) * 0.35;
    const brightness = THREE.MathUtils.clamp(1 + lift + gain, 0.78, 1.22);
    const gamma = THREE.MathUtils.clamp(Number(levels.gamma || 1), 0.5, 2.0);
    const gammaBoost = gamma < 1 ? 1 + (1 - gamma) * 0.18 : 1 - (gamma - 1) * 0.08;
    return combineCssFilters(`brightness(${brightness.toFixed(3)})`, `contrast(${contrast.toFixed(3)})`, `saturate(${gammaBoost.toFixed(3)})`);
  }
  const lut = buildCurvesLUT();
  const black = lut[0] / 255;
  const mid = lut[128] / 128;
  const white = lut[255] / 255;
  const contrast = THREE.MathUtils.clamp((white - black) + 0.65, 0.75, 1.45);
  const brightness = THREE.MathUtils.clamp(0.92 + (mid - 1) * 0.35 + (black * 0.08), 0.8, 1.18);
  return combineCssFilters(`brightness(${brightness.toFixed(3)})`, `contrast(${contrast.toFixed(3)})`);
}

function syncBasicColorToAdvanced() {
  const basic = $("colorSpaceBasic")?.value || "srgb";
  if ($("inputColorSpace")) $("inputColorSpace").value = basic;
  if ($("outputColorSpace")) $("outputColorSpace").value = basic;
}

function syncAdvancedColorToBasic() {
  const fallback = $("outputColorSpace")?.value || $("inputColorSpace")?.value || "srgb";
  if ($("colorSpaceBasic")) $("colorSpaceBasic").value = fallback;
}

function refreshColorModeUI() {
  const advanced = !!$("advancedColorMode")?.checked;
  if ($("advancedColorPanel")) $("advancedColorPanel").style.display = advanced ? "block" : "none";
  const basicWrap = $("colorSpaceBasic")?.parentElement;
  if (basicWrap) basicWrap.style.display = advanced ? "none" : "block";
}

function updateDisplayColorPipeline() {
  if (!state.renderer) return;
  const cfg = getColorPipelineConfig();
  const outputProfile = getRendererColorProfile(getActiveDisplayColorSpace());
  const inputProfile = cfg.advanced ? getInputColorProfile(cfg.input || "srgb") : { cssFilter: "none", canvasFilter: "none" };
  state.renderer.outputColorSpace = outputProfile.outputColorSpace;
  state.renderer.toneMapping = outputProfile.toneMapping;
  state.renderer.toneMappingExposure = outputProfile.exposure;
  if (state.renderer.domElement) state.renderer.domElement.style.filter = combineCssFilters(inputProfile.cssFilter, outputProfile.cssFilter, getApproxViewportCorrectionFilter());
  state.preview.dirty = true;
}

function applyLUTToCanvas(canvas, lutName) {
  if (!canvas || lutName === "standard") return canvas;
  const out = document.createElement("canvas");
  out.width = canvas.width; out.height = canvas.height;
  const ctx = make2DContext(out);
  if (!ctx) return canvas;
  ctx.drawImage(canvas, 0, 0);
  ctx.save();
  const filters = {
    cinematicWarm: 'contrast(108%) saturate(110%) sepia(10%)',
    cinematicCool: 'contrast(108%) saturate(105%) hue-rotate(-8deg)',
    tealOrange: 'contrast(112%) saturate(118%) hue-rotate(-6deg)',
    bleachBypass: 'contrast(126%) saturate(72%) brightness(102%)',
    silverRetention: 'contrast(118%) saturate(82%)',
    blackWhite: 'grayscale(100%) contrast(112%)',
    matrix: 'contrast(112%) saturate(82%) hue-rotate(38deg)',
    kodak2393: 'contrast(116%) saturate(108%) sepia(8%)',
    fujiF125: 'contrast(110%) saturate(122%) hue-rotate(-4deg)',
    dayForNight: 'brightness(82%) saturate(78%) hue-rotate(12deg)',
    vintageFade: 'contrast(94%) saturate(88%) sepia(12%)',
    highContrastMono: 'grayscale(100%) contrast(138%)',
  };
  ctx.filter = filters[lutName] || 'none';
  ctx.drawImage(canvas, 0, 0);
  ctx.restore();
  return out;
}

function applyColorPipeline(canvas) {
  const cfg = getColorPipelineConfig();
  let out = canvas;
  if (cfg.advanced) out = cloneCanvasWithFilter(out, getInputColorProfile(cfg.input || "srgb").canvasFilter);
  out = cloneCanvasWithFilter(out, getRendererColorProfile(getActiveDisplayColorSpace()).canvasFilter);
  out = applyLUTToCanvas(out, cfg.advanced ? cfg.lut : 'standard');
  out = applyColorCorrection(out);
  return out;
}

function updateBackgroundControlState() {
  const lockBg = ((!!state.gsplat.object) || ((!!state.hdri.selectedUrl) && $("hdriUseAsBg")?.checked));
  const bg = $("bg");
  if (bg) bg.disabled = lockBg;
}

function getUseRealBackground() {
  return !!state.gsplat.object || ((!!state.hdri.selectedUrl) && $("hdriUseAsBg")?.checked);
}

function clamp01(v) {
  return Math.min(1, Math.max(0, v));
}

function getCurrentSensor() {
  return { width: state.cameraRig.sensorWidth, height: state.cameraRig.sensorHeight };
}

function getLookConfig() {
  const style = $("lookStyle")?.value || state.look.style || "warm";
  const strength = Number($("lookStrength")?.value || state.look.strength || 72);
  const styles = {
    warm: {
      label: "Warm Studio",
      skyTop: "#10131b",
      skyMid: "#384454",
      floorTop: "#8d735d",
      floorBottom: "#201e21",
      glowA: "rgba(255,186,120,0.35)",
      glowB: "rgba(128,170,255,0.16)",
      haze: "rgba(255,236,208,0.10)",
      vignette: 0.18,
    },
    editorial: {
      label: "Cool Editorial",
      skyTop: "#121821",
      skyMid: "#34465f",
      floorTop: "#7b8899",
      floorBottom: "#161c24",
      glowA: "rgba(176,215,255,0.26)",
      glowB: "rgba(110,150,255,0.12)",
      haze: "rgba(214,235,255,0.08)",
      vignette: 0.16,
    },
    sunset: {
      label: "Sunset Glow",
      skyTop: "#22131b",
      skyMid: "#6f3f53",
      floorTop: "#ba835b",
      floorBottom: "#25181f",
      glowA: "rgba(255,165,92,0.38)",
      glowB: "rgba(255,92,126,0.14)",
      haze: "rgba(255,214,194,0.10)",
      vignette: 0.20,
    },
  };
  return { strength: clamp01(strength / 100), ...(styles[style] || styles.warm) };
}

function updatePreviewShell() {
  const surface = $("previewSurface");
  const hint = $("previewHint");
  if (!surface || !hint) return;

  const useHdriBg = $("hdriUseAsBg")?.checked && !!state.hdri.selectedUrl;
  hint.textContent = useHdriBg ? "HDRI backdrop" : "Local polish only";
  surface.style.background = useHdriBg
    ? "rgba(8, 10, 14, 0.42)"
    : "linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0.02))";
}


function updateTransformSpaceButton() {
  const btn = $("spaceToggle");
  if (!btn) return;
  const local = state.selection.space === "local";
  btn.textContent = local ? "✣" : "🌐";
  btn.title = local ? "Gizmo aligned to local object axes" : "Gizmo aligned to world axes";
  btn.classList.toggle("active", local);
}

function toggleTransformSpace() {
  state.selection.space = state.selection.space === "world" ? "local" : "world";
  if (state.transformControls) state.transformControls.setSpace(state.selection.space);
  updateTransformSpaceButton();
  state.preview.dirty = true;
}

function getBackgroundConfig() {
  const bg = $("bg").value;
  if (bg === "transparent") return { css: "transparent", color: 0x000000, alpha: 0 };
  if (bg === "lightgray") return { css: "#f1f2f4", color: 0xf1f2f4, alpha: 1 };
  if (bg === "darkgray") return { css: "#2a2f3a", color: 0x2a2f3a, alpha: 1 };
  return { css: "#ffffff", color: 0xffffff, alpha: 1 };
}

function setRendererClear(renderer, transparent = false) {
  if (!renderer) return;
  if (transparent) {
    renderer.setClearColor(0x000000, 0);
    return;
  }
  const cfg = getBackgroundConfig();
  renderer.setClearColor(cfg.color, cfg.alpha);
}

function updateFolderIcons() {
  document.querySelectorAll(".folder").forEach((el) => {
    el.classList.toggle("open", el.open);
  });
}

function applyLensSettings() {
  state.cameraRig.focalLength = THREE.MathUtils.clamp(state.cameraRig.focalLength, 10, 250);
  const sensor = getCurrentSensor();
  state.camera.filmGauge = sensor.width;
  if (state.camera.setFocalLength) state.camera.setFocalLength(state.cameraRig.focalLength);
  state.camera.focus = state.cameraRig.focalDistance;
  state.camera.updateProjectionMatrix();
  $("sensorSummary").textContent = `${sensor.width.toFixed(2)} × ${sensor.height.toFixed(2)} mm · ${state.camera.fov.toFixed(1)}° vertical FOV`;
}

function setSensorPreset(key) {
  const preset = SENSOR_PRESETS[key] || SENSOR_PRESETS.fullframe;
  state.cameraRig.sensorPreset = key in SENSOR_PRESETS ? key : "fullframe";
  state.cameraRig.sensorWidth = preset.width;
  state.cameraRig.sensorHeight = preset.height;
  $("sensorPreset").value = state.cameraRig.sensorPreset;
  applyLensSettings();
}

function syncPairedInput(rangeId, numId, value, digits = 1) {
  $(rangeId).value = Number(value).toFixed(digits);
  $(numId).value = Number(value).toFixed(digits);
}

function getCameraAngles() {
  const dir = TMP.v1.copy(state.camera.position).sub(state.controls.target).normalize();
  const pitch = THREE.MathUtils.radToDeg(Math.asin(dir.y));
  const yaw = THREE.MathUtils.radToDeg(Math.atan2(dir.x, dir.z));
  return { yaw, pitch };
}

function applyRoll(camera = state.camera, target = state.controls.target, rollDeg = state.cameraRig.rollDeg) {
  camera.lookAt(target);
  const axis = TMP.v1.copy(target).sub(camera.position).normalize();
  TMP.q1.setFromAxisAngle(axis, THREE.MathUtils.degToRad(rollDeg));
  camera.quaternion.multiply(TMP.q1);
}

function syncCameraUIFromView() {
  if (!state.camera) return;
  const { yaw, pitch } = getCameraAngles();
  syncPairedInput("focalLength", "focalLengthNum", state.cameraRig.focalLength, 1);
  syncPairedInput("yaw", "yawNum", yaw, 1);
  syncPairedInput("pitch", "pitchNum", pitch, 1);
  syncPairedInput("roll", "rollNum", state.cameraRig.rollDeg, 1);
  $("sensorPreset").value = state.cameraRig.sensorPreset;
  if ($("apertureF")) $("apertureF").value = Number(state.cameraRig.apertureF).toFixed(1);
  if ($("focalDistance")) $("focalDistance").value = Number(state.cameraRig.focalDistance).toFixed(1);
  if ($("focalDistanceVal")) $("focalDistanceVal").textContent = Number(state.cameraRig.focalDistance).toFixed(1);
  if ($("dofEnabled")) $("dofEnabled").checked = !!state.cameraRig.dofEnabled;
  if ($("blurScaleRatio")) $("blurScaleRatio").value = Number(state.cameraRig.blurScaleRatio || 1).toFixed(2);
  if ($("blurScaleRatioNum")) $("blurScaleRatioNum").value = Number(state.cameraRig.blurScaleRatio || 1).toFixed(2);
  applyLensSettings();
}

function getFocusWorldPoint() {
  if (state.cameraRig.focusWorldPoint && state.cameraRig.focusWorldPoint.isVector3) return state.cameraRig.focusWorldPoint.clone();
  if (Array.isArray(state.cameraRig.focusWorldPoint)) return new THREE.Vector3().fromArray(state.cameraRig.focusWorldPoint);
  return state.controls?.target?.clone?.() || state.modelCenter.clone();
}

function updateFocusPickButton() {
  const btn = $("pickFocusPoint");
  if (!btn) return;
  btn.classList.toggle("active", !!state.focusPick.active);
  btn.textContent = state.focusPick.active ? "×" : "+";
  btn.title = state.focusPick.active ? "Cancel focus picking" : "Pick a point on the model to set exact focus";
}

function setFocusDistanceMeters(value) {
  state.cameraRig.focalDistance = THREE.MathUtils.clamp(Number(value || 6), 0.2, 50);
  if ($("focalDistance")) $("focalDistance").value = state.cameraRig.focalDistance.toFixed(1);
  if ($("focalDistanceVal")) $("focalDistanceVal").textContent = state.cameraRig.focalDistance.toFixed(1);
  state.camera.focus = state.cameraRig.focalDistance;
  if (state.gsplat.sparkRenderer) state.gsplat.sparkRenderer.focalDistance = state.cameraRig.focalDistance;
  copyMainCameraToPreview();
}

function setFocusWorldPoint(point, syncDistance = true) {
  if (!point) return;
  state.cameraRig.focusWorldPoint = point.clone ? point.clone() : new THREE.Vector3().fromArray(point);
  if (syncDistance && state.camera) setFocusDistanceMeters(state.camera.position.distanceTo(getFocusWorldPoint()));
}

function setFocusPickActive(active) {
  state.focusPick.active = !!active;
  updateFocusPickButton();
  if (state.focusPick.active) {
    setBadge("Click model point to set focus");
  } else if (state.root) {
    setBadge("Ready");
  }
}

function pickFocusPointFromViewport(clientX, clientY) {
  if (!state.root) return false;
  const rect = state.renderer.domElement.getBoundingClientRect();
  state.pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  state.pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
  state.raycaster.setFromCamera(state.pointer, state.camera);
  const targets = [];
  state.root.traverse((o) => { if (o.isMesh && o.visible) targets.push(o); });
  const hits = state.raycaster.intersectObjects(targets, true);
  if (!hits.length) {
    log("Focus pick missed the model.");
    setFocusPickActive(false);
    return true;
  }
  const hit = hits[0];
  setFocusWorldPoint(hit.point, true);
  setFocusPickActive(false);
  log(`Focus distance set to ${state.cameraRig.focalDistance.toFixed(2)}m.`);
  return true;
}

const CURVE_EDITOR = { x: 18, y: 18, w: 264, h: 204 };

function curvePointToCanvas(point) {
  return {
    x: CURVE_EDITOR.x + (point.x / 255) * CURVE_EDITOR.w,
    y: CURVE_EDITOR.y + (point.y / 255) * CURVE_EDITOR.h,
  };
}

function curveCanvasToPoint(x, y, index) {
  const prev = state.colorCorrection.curves.points[index - 1];
  const next = state.colorCorrection.curves.points[index + 1];
  const minX = prev ? prev.x + 8 : 0;
  const maxX = next ? next.x - 8 : 255;
  return {
    x: THREE.MathUtils.clamp(((x - CURVE_EDITOR.x) / CURVE_EDITOR.w) * 255, minX, maxX),
    y: THREE.MathUtils.clamp(((y - CURVE_EDITOR.y) / CURVE_EDITOR.h) * 255, 0, 255),
  };
}

function renderCurveEditor() {
  const canvas = $("curveEditorCanvas");
  if (!canvas) return;
  const ctx = make2DContext(canvas, { willReadFrequently: false });
  if (!ctx) return;
  const { width, height } = canvas;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "rgba(13,18,28,0.95)";
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const x = CURVE_EDITOR.x + (CURVE_EDITOR.w / 4) * i;
    const y = CURVE_EDITOR.y + (CURVE_EDITOR.h / 4) * i;
    ctx.beginPath(); ctx.moveTo(x, CURVE_EDITOR.y); ctx.lineTo(x, CURVE_EDITOR.y + CURVE_EDITOR.h); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(CURVE_EDITOR.x, y); ctx.lineTo(CURVE_EDITOR.x + CURVE_EDITOR.w, y); ctx.stroke();
  }
  ctx.strokeStyle = "rgba(255,255,255,0.16)";
  ctx.strokeRect(CURVE_EDITOR.x, CURVE_EDITOR.y, CURVE_EDITOR.w, CURVE_EDITOR.h);

  const points = getSortedCurvePoints();
  ctx.strokeStyle = "#6ae2ff";
  ctx.lineWidth = 2;
  ctx.beginPath();
  points.forEach((p, i) => {
    const c = curvePointToCanvas(p);
    if (i === 0) ctx.moveTo(c.x, c.y);
    else ctx.lineTo(c.x, c.y);
  });
  ctx.stroke();

  points.forEach((p, i) => {
    const c = curvePointToCanvas(p);
    ctx.fillStyle = i === 0 || i === points.length - 1 ? "#c6d4f4" : "#6ae2ff";
    ctx.beginPath();
    ctx.arc(c.x, c.y, 5.5, 0, Math.PI * 2);
    ctx.fill();
  });
}

function refreshColorCorrectionUI() {
  const levels = state.colorCorrection.levels;
  const bind = (a, b, val) => { if ($(a)) $(a).value = String(val); if ($(b)) $(b).value = String(val); };
  bind("ccInputBlack", "ccInputBlackVal", levels.inBlack);
  bind("ccGamma", "ccGammaVal", Number(levels.gamma).toFixed(2));
  bind("ccInputWhite", "ccInputWhiteVal", levels.inWhite);
  bind("ccOutputBlack", "ccOutputBlackVal", levels.outBlack);
  bind("ccOutputWhite", "ccOutputWhiteVal", levels.outWhite);
  $("ccTabLevels")?.classList.toggle("active", state.colorCorrection.mode === "levels");
  $("ccTabCurves")?.classList.toggle("active", state.colorCorrection.mode === "curves");
  $("ccLevelsPanel")?.classList.toggle("active", state.colorCorrection.mode === "levels");
  $("ccCurvesPanel")?.classList.toggle("active", state.colorCorrection.mode === "curves");
  renderCurveEditor();
}

function updateColorCorrection() {
  updateDisplayColorPipeline();
  renderCurveEditor();
  copyMainCameraToPreview();
}

function resetColorCorrection() {
  state.colorCorrection.mode = "levels";
  state.colorCorrection.levels = { inBlack: 0, gamma: 1, inWhite: 255, outBlack: 0, outWhite: 255 };
  state.colorCorrection.curves.points = [
    { x: 0, y: 255 },
    { x: 64, y: 192 },
    { x: 128, y: 128 },
    { x: 192, y: 64 },
    { x: 255, y: 0 },
  ];
  state.colorCorrection.curves.dragging = -1;
  refreshColorCorrectionUI();
  updateColorCorrection();
}

function bindLevelsControl(rangeId, numId, key, parser = Number) {
  const apply = (raw) => {
    let v = parser(raw);
    if (key === "inBlack") v = THREE.MathUtils.clamp(v, 0, state.colorCorrection.levels.inWhite - 1);
    if (key === "inWhite") v = THREE.MathUtils.clamp(v, state.colorCorrection.levels.inBlack + 1, 255);
    if (key === "outBlack") v = THREE.MathUtils.clamp(v, 0, state.colorCorrection.levels.outWhite - 1);
    if (key === "outWhite") v = THREE.MathUtils.clamp(v, state.colorCorrection.levels.outBlack + 1, 255);
    if (key === "gamma") v = THREE.MathUtils.clamp(v, 0.1, 3.0);
    state.colorCorrection.levels[key] = v;
    refreshColorCorrectionUI();
    updateColorCorrection();
  };
  $(rangeId)?.addEventListener("input", () => apply($(rangeId).value));
  $(numId)?.addEventListener("input", () => apply($(numId).value));
}

function wireCurveEditor() {
  const canvas = $("curveEditorCanvas");
  if (!canvas) return;
  const getPos = (e) => {
    const rect = canvas.getBoundingClientRect();
    const sx = canvas.width / Math.max(1, rect.width);
    const sy = canvas.height / Math.max(1, rect.height);
    return { x: (e.clientX - rect.left) * sx, y: (e.clientY - rect.top) * sy };
  };
  canvas.addEventListener("pointerdown", (e) => {
    const pos = getPos(e);
    let best = -1;
    let bestDist = 14;
    state.colorCorrection.curves.points.forEach((p, idx) => {
      if (idx === 0 || idx === state.colorCorrection.curves.points.length - 1) return;
      const c = curvePointToCanvas(p);
      const d = Math.hypot(pos.x - c.x, pos.y - c.y);
      if (d < bestDist) { best = idx; bestDist = d; }
    });
    state.colorCorrection.curves.dragging = best;
    if (best >= 0) canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener("pointermove", (e) => {
    const idx = state.colorCorrection.curves.dragging;
    if (idx < 0) return;
    const pos = getPos(e);
    state.colorCorrection.curves.points[idx] = curveCanvasToPoint(pos.x, pos.y, idx);
    renderCurveEditor();
    updateColorCorrection();
  });
  const release = () => { state.colorCorrection.curves.dragging = -1; };
  canvas.addEventListener("pointerup", release);
  canvas.addEventListener("pointercancel", release);
}

function setOrbitAngles(yawDeg, pitchDeg) {
  if (!state.root) return;
  const target = state.controls.target.clone();
  const dist = state.camera.position.distanceTo(target);
  const yaw = THREE.MathUtils.degToRad(yawDeg);
  const pitch = THREE.MathUtils.degToRad(THREE.MathUtils.clamp(pitchDeg, -89, 89));
  const x = Math.cos(pitch) * Math.sin(yaw);
  const y = Math.sin(pitch);
  const z = Math.cos(pitch) * Math.cos(yaw);
  state.camera.position.copy(target.clone().add(new THREE.Vector3(x, y, z).multiplyScalar(dist)));
  applyRoll(state.camera, target, state.cameraRig.rollDeg);
  state.controls.update();
  copyMainCameraToPreview();
}

function saveCurrentView() {
  return {
    pos: state.camera.position.toArray(),
    quat: state.camera.quaternion.toArray(),
    target: state.controls.target.toArray(),
    focalLength: state.cameraRig.focalLength,
    apertureF: state.cameraRig.apertureF,
    focalDistance: state.cameraRig.focalDistance,
    blurScaleRatio: state.cameraRig.blurScaleRatio,
    dofEnabled: state.cameraRig.dofEnabled,
    focusWorldPoint: getFocusWorldPoint().toArray(),
    sensorPreset: state.cameraRig.sensorPreset,
    sensorWidth: state.cameraRig.sensorWidth,
    sensorHeight: state.cameraRig.sensorHeight,
    rollDeg: state.cameraRig.rollDeg,
  };
}

function setCameraToSavedView(view) {
  state.cameraRig.sensorPreset = view.sensorPreset || state.cameraRig.sensorPreset;
  state.cameraRig.sensorWidth = view.sensorWidth || state.cameraRig.sensorWidth;
  state.cameraRig.sensorHeight = view.sensorHeight || state.cameraRig.sensorHeight;
  state.cameraRig.focalLength = view.focalLength ?? state.cameraRig.focalLength;
  state.cameraRig.apertureF = view.apertureF ?? state.cameraRig.apertureF;
  state.cameraRig.focalDistance = view.focalDistance ?? state.cameraRig.focalDistance;
  state.cameraRig.blurScaleRatio = view.blurScaleRatio ?? state.cameraRig.blurScaleRatio;
  state.cameraRig.dofEnabled = view.dofEnabled ?? state.cameraRig.dofEnabled;
  state.cameraRig.focusWorldPoint = Array.isArray(view.focusWorldPoint) ? new THREE.Vector3().fromArray(view.focusWorldPoint) : state.cameraRig.focusWorldPoint;
  state.cameraRig.rollDeg = view.rollDeg ?? state.cameraRig.rollDeg;
  applyLensSettings();

  state.camera.position.fromArray(view.pos);
  state.camera.quaternion.fromArray(view.quat);
  state.controls.target.fromArray(view.target);
  state.camera.updateProjectionMatrix();
  state.controls.update();
  syncCameraUIFromView();
}

function applyBackground() {
  const useHdriBg = $("hdriUseAsBg")?.checked && !!state.hdri.selectedUrl;
  if (!useHdriBg && !state.gsplat.object) setRendererClear(state.renderer, false);
  const view = $("view");
  const cfg = getBackgroundConfig();
  view.style.background = cfg.css === "transparent" ? "transparent" : cfg.css;

  if (useHdriBg && state.hdri.selectedUrl) {
    const tex = state.hdri.cache.get(state.hdri.selectedUrl)?.tex;
    if (tex) state.scene.background = tex;
  } else if (!state.gsplat.object) {
    state.scene.background = null;
  }
  updateBackgroundControlState();
  updatePreviewShell();
}

function setupLights() {
  const toRemove = [];
  state.scene.traverse((o) => {
    if (o.userData && o.userData.appLight && !o.userData.internalLight && o !== state.helix.light) toRemove.push(o);
  });
  toRemove.forEach((o) => state.scene.remove(o));

  const mode = $("light").value;
  const addDir = (x, y, z, intensity) => {
    const light = new THREE.DirectionalLight(0xffffff, intensity);
    light.position.set(x, y, z);
    light.userData.appLight = true;
    state.scene.add(light);
  };

  if (mode === "hard") {
    addDir(5, 6, 2, 1.55);
    addDir(-2, 2, -4, 0.30);
  } else if (mode === "rim") {
    addDir(2, 5, 1, 0.95);
    addDir(-2, 4, 6, 1.05);
    addDir(-4, 2.5, -2, 0.38);
  } else {
    addDir(3, 5, 2, 1.18);
    addDir(-4, 3, -2, 0.55);
    addDir(-2, 4, 5, 0.68);
  }
}

function buildHelixHelper() {
  const group = new THREE.Group();
  group.name = "Helix Light Helper";
  group.userData.selectableType = "helix";
  group.userData.overlayOnly = true;

  const ringGeo = new THREE.TorusGeometry(0.18, 0.012, 10, 28);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xffd39b, transparent: true, opacity: 0.95, depthTest: false });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.rotation.x = Math.PI / 2;
  group.add(ring);

  const core = new THREE.Mesh(
    new THREE.SphereGeometry(0.045, 10, 10),
    new THREE.MeshBasicMaterial({ color: 0xffefcf, depthTest: false })
  );
  group.add(core);

  const line = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, -0.35)]),
    new THREE.LineBasicMaterial({ color: 0xffcc8a, transparent: true, opacity: 0.9, depthTest: false })
  );
  group.add(line);

  group.renderOrder = 1000;
  return group;
}

function syncHelixHelperFromLight() {
  if (!state.helix.helper || !state.helix.light) return;
  state.helix.helper.position.copy(state.helix.light.position);
  state.helix.helper.quaternion.copy(state.helix.light.quaternion);
}

function syncHelixLightFromHelper() {
  if (!state.helix.helper || !state.helix.light) return;
  state.helix.light.position.copy(state.helix.helper.position);
  state.helix.light.quaternion.copy(state.helix.helper.quaternion);
  updateHelixShadowLight();
}

function updateHelixShadowLight() {
  if (!state.helix.shadowLight || !state.helix.shadowTarget || !state.helix.light) return;
  const on = state.helix.enabled && state.helix.shadowEnabled && !!state.floor.mesh && !!state.root;
  const light = state.helix.shadowLight;
  light.visible = on;
  light.castShadow = on;
  if (!on) {
    light.intensity = 0;
    return;
  }
  const center = state.controls?.target ? state.controls.target.clone() : new THREE.Vector3();
  const radius = Math.max(0.2, state.modelRadius || 1);
  light.intensity = Math.max(1.4, state.helix.intensity * 0.09);
  light.position.copy(state.helix.light.position);
  const target = center.clone();
  if (state.floor.mesh) target.y = state.floor.mesh.position.y + 0.01;
  state.helix.shadowTarget.position.copy(target);
  light.angle = THREE.MathUtils.degToRad(22 + state.helix.lightSize * 2.8);
  light.penumbra = THREE.MathUtils.clamp(0.08 + state.helix.lightSize * 0.07, 0.08, 1);
  light.distance = 0;
  light.decay = 1.0;
  light.shadow.radius = THREE.MathUtils.clamp(0.5 + state.helix.lightSize * 2.0, 0.5, 24);
  light.shadow.blurSamples = Math.round(4 + state.helix.lightSize);
  light.shadow.bias = -0.0003;
  light.shadow.camera.near = 0.1;
  light.shadow.camera.far = Math.max(20, radius * 16);
  light.shadow.mapSize.set(4096, 4096);
  light.target.updateMatrixWorld();
}

function setHelixLightPose(t = 0) {
  if (!state.helix.light || !state.root) return;
  state.helix.light.visible = state.helix.enabled && state.helix.intensity > 0.001;
  state.helix.light.intensity = state.helix.intensity;

  if (state.helix.manual) {
    syncHelixLightFromHelper();
    return;
  }

  const center = state.controls.target.clone();
  const radius = Math.max(0.1, state.modelRadius);
  const turns = state.helix.turns;
  const theta0 = Math.PI * 0.25;
  const theta = theta0 + turns * Math.PI * 2 * t;
  const r = radius * 2.1 * (1.0 + 0.12 * Math.sin(Math.PI * 2 * t));
  const y = THREE.MathUtils.lerp(center.y + radius * 2.0, center.y + radius * 0.4, t);
  const x = center.x + r * Math.cos(theta);
  const z = center.z + r * Math.sin(theta);

  state.helix.light.position.set(x, y, z);
  state.helix.light.lookAt(center);
  state.helix.light.width = radius * (1.2 + state.helix.lightSize * 0.4);
  state.helix.light.height = radius * (0.8 + state.helix.lightSize * 0.25);
  syncHelixHelperFromLight();
  updateHelixShadowLight();
}

function initPreviewRenderer() {
  const canvas = $("previewCanvas");
  state.preview.canvas = canvas;
  state.preview.ctx = canvas.getContext("2d", { alpha: true, willReadFrequently: false });
  state.preview.surface = $("previewSurface");
}

function updatePreviewSize() {
  if (!state.preview.canvas || !state.preview.surface) return;
  const r = state.preview.surface.getBoundingClientRect();
  const w = Math.max(2, Math.floor(r.width));
  const h = Math.max(2, Math.floor(r.height));
  if (w === state.preview.lastW && h === state.preview.lastH) return;
  state.preview.lastW = w;
  state.preview.lastH = h;
  state.preview.canvas.width = w;
  state.preview.canvas.height = h;
}


function makeCanvasFromPixels(pixels, w, h) {
  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  const ctx = make2DContext(out);
  if (!ctx) return out;
  const img = ctx.createImageData(w, h);
  const row = w * 4;
  for (let y = 0; y < h; y++) {
    const srcY = h - 1 - y;
    img.data.set(pixels.subarray(srcY * row, srcY * row + row), y * row);
  }
  ctx.putImageData(img, 0, 0);
  return out;
}

function copyMainCameraToPreview() {
  state.preview.dirty = true;
}

function drawPreviewBackdrop(ctx, w, h) {
  const cfg = getLookConfig();
  const bg = ctx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, cfg.skyTop);
  bg.addColorStop(0.56, cfg.skyMid);
  bg.addColorStop(0.78, cfg.floorTop);
  bg.addColorStop(1, cfg.floorBottom);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  const glowA = ctx.createRadialGradient(w * 0.72, h * 0.26, 0, w * 0.72, h * 0.26, Math.max(w, h) * 0.42);
  glowA.addColorStop(0, cfg.glowA);
  glowA.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = glowA;
  ctx.fillRect(0, 0, w, h);
}

async function renderPreview() {
  if (!state.preview.enabled || !state.root || !state.preview.ctx || state.preview.busy) return;
  if (!state.preview.dirty && performance.now() < state.preview.nextAt) return;
  state.preview.busy = true;
  try {
    updatePreviewSize();

    const previewW = Math.max(2, state.preview.canvas.width);
    const previewH = Math.max(2, state.preview.canvas.height);
    const viewportDims = getViewportFrameDims(Math.max(640, Math.max(previewW, previewH) * 1.75));
    const frame = await renderStyledStillCanvas(viewportDims, true);
    const ctx = state.preview.ctx;
    if (!ctx) throw new Error("Preview canvas 2D context unavailable.");
    ctx.clearRect(0, 0, previewW, previewH);
    ctx.imageSmoothingEnabled = true;

    const scale = Math.min(previewW / frame.width, previewH / frame.height);
    const drawW = Math.max(1, Math.round(frame.width * scale));
    const drawH = Math.max(1, Math.round(frame.height * scale));
    const drawX = Math.round((previewW - drawW) * 0.5);
    const drawY = Math.round((previewH - drawH) * 0.5);
    ctx.drawImage(frame, drawX, drawY, drawW, drawH);

    state.preview.dirty = false;
    state.preview.nextAt = performance.now() + 160;
  } catch (e) {
    log(`Preview failed: ${e?.message || e}`);
    state.preview.nextAt = performance.now() + 450;
  } finally {
    state.preview.busy = false;
  }
}

function updatePreviewButtons() {
  $("togglePreview").textContent = state.preview.enabled ? "Hide Preview" : "Live Preview";
  $("togglePreview").classList.toggle("active", state.preview.enabled);
  $("previewDock").style.display = state.root ? "flex" : "none";
  $("previewSurface").style.display = state.preview.enabled ? "block" : "none";
  updatePreviewFrameAspect();
  $("captureStill").disabled = !state.root;
  $("recenter").disabled = !state.root || state.poi.active;
  $("transformToolbar").style.display = state.selection.object ? "flex" : "none";
  updateTransformSpaceButton();
}


function setOverlayObjectsVisible(visible) {
  const restore = [];
  const overlays = [];
  if (state.transformHelper) overlays.push(state.transformHelper);
  if (state.helix.helper) overlays.push(state.helix.helper);
  overlays.forEach((obj) => {
    restore.push([obj, obj.visible]);
    obj.visible = visible && obj.visible;
  });
  return restore;
}

function restoreOverlayVisibility(restore) {
  restore.forEach(([obj, value]) => obj.visible = value);
}

function init3D() {
  const view = $("view");
  const canvas = document.createElement("canvas");
  canvas.className = "mainCanvas";
  view.appendChild(canvas);

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    preserveDrawingBuffer: true,
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 4000);
  camera.position.set(2.2, 1.6, 2.2);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.target.set(0, 0.6, 0);
  controls.addEventListener("change", () => {
    copyMainCameraToPreview();
    state.ui.cameraSyncPending = true;
  });
  controls.addEventListener("end", () => {
    syncCameraUIFromView();
  });

  const transformControls = new TransformControls(camera, renderer.domElement);
  const transformHelper = typeof transformControls.getHelper === "function" ? transformControls.getHelper() : transformControls;
  transformHelper.visible = false;
  transformControls.enabled = true;
  transformControls.setSpace("world");
  transformControls.setSize(1.1);
  transformControls.addEventListener("dragging-changed", (e) => {
    controls.enabled = !e.value;
    if (!e.value) {
      state.ui.cameraSyncPending = true;
    }
  });
  transformControls.addEventListener("mouseDown", () => {
    state.selection.interactingTransform = true;
  });
  transformControls.addEventListener("mouseUp", () => {
    setTimeout(() => {
      state.selection.interactingTransform = false;
    }, 0);
  });
  transformControls.addEventListener("objectChange", () => {
    if (state.selection.type === "helix") {
      state.helix.manual = true;
      syncHelixLightFromHelper();
    }
    if (state.selection.type === "model") {
      computeLiveModelBounds();
      updateHelixShadowLight();
    }
    if (state.selection.type === "floor") {
      updateHelixShadowLight();
    }
    if (state.selection.type === "sceneLight") {
      syncSelectedSceneLightFromTransform();
    }
    state.ui.cameraSyncPending = true;
  });
  transformHelper.traverse?.((child) => {
    child.renderOrder = 10000;
    if (child.material) {
      child.material.depthTest = false;
      child.material.depthWrite = false;
      child.material.transparent = true;
      child.material.toneMapped = false;
    }
  });
  scene.add(transformHelper);

  scene.add(new THREE.AmbientLight(0xffffff, 0.35));
  RectAreaLightUniformsLib.init();

  const helixLight = new THREE.RectAreaLight(0xffffff, state.helix.intensity, 1.0, 1.0);
  helixLight.userData.appLight = true;
  scene.add(helixLight);
  state.helix.light = helixLight;

  const shadowLight = new THREE.SpotLight(0xffffff, 0.0, 0, Math.PI / 5, 0.25, 1.0);
  shadowLight.castShadow = true;
  shadowLight.shadow.mapSize.set(1024, 1024);
  shadowLight.shadow.bias = -0.0002;
  shadowLight.userData.appLight = true;
  const shadowTarget = new THREE.Object3D();
  shadowTarget.position.set(0, 0, 0);
  scene.add(shadowTarget);
  shadowLight.target = shadowTarget;
  scene.add(shadowLight);
  state.helix.shadowLight = shadowLight;
  state.helix.shadowTarget = shadowTarget;

  const helixHelper = buildHelixHelper();
  scene.add(helixHelper);
  state.helix.helper = helixHelper;
  state.helix.enabled = false;
  helixLight.visible = false;
  helixHelper.visible = false;

  state.pmrem = new THREE.PMREMGenerator(renderer);
  state.pmrem.compileEquirectangularShader();

  const loader = new GLTFLoader();
  const draco = new DRACOLoader();
  draco.setDecoderPath("./three/examples/jsm/libs/draco/");
  loader.setDRACOLoader(draco);
  loader.setMeshoptDecoder(MeshoptDecoder);
  const ktx2 = new KTX2Loader();
  ktx2.setTranscoderPath("./three/examples/jsm/libs/basis/");
  ktx2.detectSupport(renderer);
  loader.setKTX2Loader(ktx2);

  state.scene = scene;
  state.camera = camera;
  state.renderer = renderer;
  state.controls = controls;
  state.transformControls = transformControls;
  state.transformHelper = transformHelper;
  state.loader = loader;

  initPreviewRenderer();

  const onResize = () => {
    const r = view.getBoundingClientRect();
    renderer.setSize(r.width, r.height, false);
    camera.aspect = r.width / r.height;
    camera.updateProjectionMatrix();
    updatePreviewFrameAspect();
    updatePreviewSize();
  };
  window.addEventListener("resize", onResize);
  onResize();

  renderer.domElement.addEventListener("pointerdown", onViewportPointerDown);
  renderer.domElement.addEventListener("pointerup", onViewportPointerUp);

  const tick = () => {
    requestAnimationFrame(tick);
    const dt = Math.min(0.05, state.clock.getDelta());

    state.keyboard.movedThisFrame = false;
    updateKeyboardMovement(dt);
    controls.update();

    if (state.ui.cameraSyncPending && performance.now() - state.ui.lastCameraSyncAt > 120) {
      syncCameraUIFromView();
      state.ui.cameraSyncPending = false;
      state.ui.lastCameraSyncAt = performance.now();
    }

    renderMain();
    renderPreview();
  };
  tick();

  setupLights();
  spawnBootstrapDirectionalLight();
  applyBackground();
  updateDisplayColorPipeline();
  updatePreviewShell();
  updatePreviewButtons();
  updateTransformSpaceButton();
  log("3D initialized.");
}

function renderMain() {
  try {
    state.renderer.render(state.scene, state.camera);
  } catch (e) {
    // Keep app alive if experimental gsplats break a frame.
  }
}

function computeLiveModelBounds() {
  if (!state.root) return;
  const box = new THREE.Box3().setFromObject(state.root);
  const sphere = new THREE.Sphere();
  box.getBoundingSphere(sphere);
  state.modelCenter.copy(sphere.center);
  state.modelRadius = Math.max(0.01, sphere.radius);
  if (!state.helix.manual) setHelixLightPose(0);
}

function disposeMaterial(mat) {
  const mats = Array.isArray(mat) ? mat : [mat];
  mats.filter(Boolean).forEach((m) => {
    ["map", "normalMap", "roughnessMap", "metalnessMap", "aoMap", "emissiveMap", "alphaMap"].forEach((key) => m[key]?.dispose?.());
    m.dispose?.();
  });
}

function clearModel() {
  if (state.root) {
    state.scene.remove(state.root);
    state.root.traverse((o) => {
      o.geometry?.dispose?.();
      if (o.material) disposeMaterial(o.material);
    });
  }
  state.root = null;
  state.stats = null;
  state.poi.list = [];
  state.poi.active = false;
  state.poi.currentObjectId = null;
  state.cameraRig.focusWorldPoint = null;
  setFocusPickActive(false);
  clearSelection();
  renderPOIList();
  buildObjectList();
  updateFloorButton();
  $("fileName").textContent = "—";
  $("dims").textContent = "—";
  $("tris").textContent = "—";
  $("mats").textContent = "—";
  setBadge("No model loaded");
}

function computeModelStats(root) {
  let tris = 0;
  const materials = new Map();
  root.traverse((obj) => {
    if (obj.isMesh && obj.geometry) {
      const g = obj.geometry;
      const idx = g.index;
      tris += idx ? idx.count / 3 : (g.attributes.position?.count || 0) / 3;
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      mats.filter(Boolean).forEach((m) => {
        if (!materials.has(m.uuid)) {
          materials.set(m.uuid, { name: m.name || "(unnamed)", type: m.type });
        }
      });
    }
  });

  const box = new THREE.Box3().setFromObject(root);
  const size = new THREE.Vector3();
  box.getSize(size);
  return {
    triangles: Math.round(tris),
    materials: [...materials.values()],
    dimensionsCM: { x: size.x * 100, y: size.y * 100, z: size.z * 100 },
  };
}

function normalizeModelToGround(root) {
  const box = new THREE.Box3().setFromObject(root);
  root.position.y -= box.min.y;
}

function fitCameraToRoot(root, preserveDirection = false) {
  if (!root) return;
  const padPct = Number($("pad").value) / 100;
  const camera = state.camera;
  const controls = state.controls;

  computeLiveModelBounds();
  const center = state.modelCenter.clone();
  const radius = state.modelRadius * (1 + padPct);
  const fov = THREE.MathUtils.degToRad(camera.fov);
  const dist = radius / Math.sin(fov / 2);

  let dir = new THREE.Vector3(1, 0.7, 1).normalize();
  if (preserveDirection) {
    dir.copy(camera.position).sub(controls.target).normalize();
    if (dir.lengthSq() < 0.0001) dir.set(1, 0.7, 1).normalize();
  }

  camera.position.copy(center.clone().add(dir.multiplyScalar(dist)));
  camera.near = Math.max(0.001, dist / 300);
  camera.far = Math.max(50, dist * 6);
  camera.updateProjectionMatrix();
  controls.target.copy(center);
  state.cameraRig.rollDeg = 0;
  applyRoll(camera, controls.target, 0);
  controls.update();

  state.baseView = saveCurrentView();
  syncCameraUIFromView();
  if (!state.helix.manual) setHelixLightPose(0);
  updateHelixShadowLight();

  log("View recentered.");
}

function resetView() {
  if (!state.root || !state.baseView) return;
  setCameraToSavedView(state.baseView);
  if (!state.helix.manual) setHelixLightPose(0);
  updateHelixShadowLight();
  log("View reset.");
}

function onViewportPointerDown(e) {
  state.selection.pointerDown = { x: e.clientX, y: e.clientY };
}

function onViewportPointerUp(e) {
  if (state.transformControls.dragging || state.selection.interactingTransform) return;
  const p = state.selection.pointerDown;
  if (!p) return;
  const dx = e.clientX - p.x;
  const dy = e.clientY - p.y;
  if (Math.hypot(dx, dy) > 4) return;
  if (state.focusPick.active) {
    pickFocusPointFromViewport(e.clientX, e.clientY);
    return;
  }
  pickSelectable(e.clientX, e.clientY);
}

function collectPickTargets() {
  const list = [];
  if (state.root) {
    state.root.traverse((o) => {
      if (o.isMesh && o.visible) list.push(o);
    });
  }
  if (state.floor.mesh?.visible) list.push(state.floor.mesh);
  if (state.gsplat.selectable && state.gsplat.object?.visible) list.push(state.gsplat.object);
  state.lights.rigs.forEach((rig) => {
    if (rig.group?.visible) {
      rig.group.traverse((o) => { if ((o.isMesh || o.isLine) && o.visible) list.push(o); });
    }
  });
  if (state.helix.helper?.visible) {
    state.helix.helper.traverse((o) => {
      if ((o.isMesh || o.isLine) && o.visible) list.push(o);
    });
  }
  return list;
}

function pickSelectable(clientX, clientY) {
  const rect = state.renderer.domElement.getBoundingClientRect();
  state.pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  state.pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
  state.raycaster.setFromCamera(state.pointer, state.camera);
  const hits = state.raycaster.intersectObjects(collectPickTargets(), true);
  if (!hits.length) {
    clearSelection();
    return;
  }

  const byPriority = [
    (hit) => state.root && isDescendantOf(hit, state.root) ? [state.root, "model"] : null,
    (hit) => state.floor.mesh && (hit === state.floor.mesh || isDescendantOf(hit, state.floor.mesh)) ? [state.floor.mesh, "floor"] : null,
    (hit) => state.gsplat.selectable && state.gsplat.object && (hit === state.gsplat.object || isDescendantOf(hit, state.gsplat.object)) ? [state.gsplat.object, "gsplat"] : null,
    (hit) => {
      const rig = state.lights.rigs.find((r) => r.group && isDescendantOf(hit, r.group));
      return rig ? [rig.group, "sceneLight"] : null;
    },
    (hit) => state.helix.helper && isDescendantOf(hit, state.helix.helper) ? [state.helix.helper, "helix"] : null,
  ];

  for (const test of byPriority) {
    for (const entry of hits) {
      const found = test(entry.object);
      if (found) {
        selectObject(found[0], found[1]);
        return;
      }
    }
  }

  clearSelection();
}

function isDescendantOf(child, parent) {
  let cur = child;
  while (cur) {
    if (cur === parent) return true;
    cur = cur.parent;
  }
  return false;
}

function selectObject(object, type) {
  if (!object) return;
  state.selection.object = object;
  state.selection.type = type;
  state.transformControls.attach(object);
  state.transformControls.setMode(state.selection.mode);
  state.transformHelper.visible = true;
  const scaleHint = Math.max(0.75, state.modelRadius * 0.65);
  state.transformControls.setSize(scaleHint);
  copyMainCameraToPreview();
  updatePreviewButtons();
  refreshLightUI();
  log(`Selected: ${type === "model" ? "Loaded model" : object.name || type}`);
}

function clearSelection() {
  state.selection.object = null;
  state.selection.type = "";
  state.transformControls.detach();
  if (state.transformHelper) state.transformHelper.visible = false;
  updatePreviewButtons();
  refreshLightUI();
}

function setTransformMode(mode) {
  state.selection.mode = mode;
  state.transformControls.setMode(mode);
  state.transformControls.setSpace(state.selection.space);
  ["translate", "rotate", "scale"].forEach((m) => $(`mode_${m}`).classList.toggle("active", m === mode));
}


function lightWattsToIntensity(type, watts) {
  const w = Math.max(0, watts || 0);
  const map = { directional: 0.012, spot: 0.014, point: 0.018, rectarea: 0.02, hemisphere: 0.008, helix: 0.02 };
  return w * (map[type] || 0.012);
}

function createGenericLightHelper(type, color = 0xffffff) {
  const group = new THREE.Group();
  group.name = `${type} helper`;
  const lineMat = new THREE.LineBasicMaterial({ color, depthTest: false, transparent: true, opacity: 0.9 });
  if (type === 'rectarea') {
    const pts = [new THREE.Vector3(-0.5,0.3,0), new THREE.Vector3(0.5,0.3,0), new THREE.Vector3(0.5,-0.3,0), new THREE.Vector3(-0.5,-0.3,0), new THREE.Vector3(-0.5,0.3,0)];
    group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), lineMat));
  } else if (type === 'point') {
    group.add(new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 10), new THREE.MeshBasicMaterial({ color, wireframe: true, depthTest: false })));
  } else if (type === 'spot') {
    const pts = [new THREE.Vector3(0,0,0), new THREE.Vector3(-0.3,-0.8,-0.3), new THREE.Vector3(0.3,-0.8,-0.3), new THREE.Vector3(0.3,-0.8,0.3), new THREE.Vector3(-0.3,-0.8,0.3), new THREE.Vector3(-0.3,-0.8,-0.3)];
    group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), lineMat));
  } else if (type === 'directional' || type === 'helix') {
    group.add(new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.03, 8, 24), new THREE.MeshBasicMaterial({ color, wireframe: false, depthTest: false })));
    group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0,-0.6,0)]), lineMat));
  } else if (type === 'hemisphere') {
    group.add(new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 10), new THREE.MeshBasicMaterial({ color, wireframe: true, depthTest: false })));
  }
  group.renderOrder = 1000;
  group.traverse((o) => { if (o.material) { o.material.depthTest = false; o.material.depthWrite = false; o.material.toneMapped = false; }});
  return group;
}

function getSpawnPointAboveModel() {
  const c = state.root ? state.modelCenter.clone() : new THREE.Vector3();
  const r = Math.max(0.5, state.modelRadius || 1);
  return c.add(new THREE.Vector3(0, r * 1.8, r * 1.2));
}

function configureLightShadowDefaults(light, type) {
  if (!light || !light.shadow) return;
  const radius = Math.max(1, state.modelRadius || 1);
  if (type === 'directional') {
    light.shadow.mapSize.set(2048, 2048);
    light.shadow.camera.near = 0.1;
    light.shadow.camera.far = Math.max(40, radius * 18);
    light.shadow.camera.left = -radius * 4;
    light.shadow.camera.right = radius * 4;
    light.shadow.camera.top = radius * 4;
    light.shadow.camera.bottom = -radius * 4;
    light.shadow.bias = -0.00015;
    light.shadow.normalBias = 0.04;
    light.shadow.radius = 1.2;
  } else if (type === 'spot') {
    light.shadow.mapSize.set(2048, 2048);
    light.shadow.bias = -0.00012;
    light.shadow.normalBias = 0.02;
    light.shadow.radius = 1.5;
  } else if (type === 'point') {
    light.shadow.mapSize.set(1024, 1024);
    light.shadow.bias = -0.0001;
    light.shadow.normalBias = 0.015;
    light.shadow.radius = 1.2;
  }
}

function buildLightRig(type, existing = null) {
  const rig = existing || { id: `light_${state.lights.nextId++}` };
  rig.type = type;
  rig.internal = !!existing?.internal;
  rig.name = rig.internal && existing?.name ? existing.name : `${type[0].toUpperCase()}${type.slice(1)} Light`; 
  const watts = existing?.watts ?? 1000;
  const color = existing?.color ?? '#FFFFFF';
  const size = existing?.size ?? 1;
  const radius = existing?.radius ?? 0;
  const shadows = existing?.shadows ?? false;
  const position = existing?.group?.position?.clone() || getSpawnPointAboveModel();
  const quaternion = existing?.group?.quaternion?.clone() || new THREE.Quaternion();
  if (rig.group && rig.group.parent) rig.group.parent.remove(rig.group);
  const group = new THREE.Group();
  group.position.copy(position); group.quaternion.copy(quaternion);
  group.name = rig.name;
  group.userData.sceneLight = !rig.internal;
  group.userData.lightRigId = rig.id;
  group.userData.internalLight = rig.internal;
  const clr = new THREE.Color(color);
  let light = null;
  if (type === 'directional') {
    light = new THREE.DirectionalLight(clr, lightWattsToIntensity(type, watts));
    const target = new THREE.Object3D(); target.position.set(0, -1, 0); group.add(target); light.target = target;
    light.castShadow = shadows;
    configureLightShadowDefaults(light, type);
  } else if (type === 'spot') {
    light = new THREE.SpotLight(clr, lightWattsToIntensity(type, watts), radius || 0, Math.PI/6, 0.25, 2);
    const target = new THREE.Object3D(); target.position.set(0, -1, 0); group.add(target); light.target = target; light.castShadow = shadows;
    configureLightShadowDefaults(light, type);
  } else if (type === 'point') {
    light = new THREE.PointLight(clr, lightWattsToIntensity(type, watts), radius || 0, 2); light.castShadow = shadows;
    configureLightShadowDefaults(light, type);
  } else if (type === 'rectarea' || type === 'helix') {
    light = new THREE.RectAreaLight(clr, lightWattsToIntensity(type, watts), Math.max(0.1,size), Math.max(0.1,size));
  } else if (type === 'hemisphere') {
    light = new THREE.HemisphereLight(clr, 0x202020, lightWattsToIntensity(type, watts));
  }
  light.userData.appLight = true;
  light.userData.internalLight = rig.internal;
  light.position.set(0,0,0);
  group.add(light);
  const helper = createGenericLightHelper(type, clr);
  helper.visible = !rig.internal;
  helper.userData.internalLight = rig.internal;
  group.add(helper);
  rig.group = group; rig.light = light; rig.helper = helper; rig.watts = watts; rig.color = `#${clr.getHexString().toUpperCase()}`; rig.size = size; rig.radius = radius; rig.shadows = shadows;
  state.scene.add(group);
  syncLightRigProperties(rig);
  return rig;
}

function spawnBootstrapDirectionalLight() {
  if (state.bootstrapDirectionalRig || !state.scene) return;
  const rig = buildLightRig('directional', {
    id: 'bootstrap_directional',
    name: 'Bootstrap Directional',
    internal: true,
    watts: 0,
    color: '#FFFFFF',
    size: 1,
    radius: 0,
    shadows: true,
    group: { position: new THREE.Vector3(4, 6, 3), quaternion: new THREE.Quaternion() },
  });
  rig.group.position.set(4, 6, 3);
  rig.group.lookAt(state.controls?.target || new THREE.Vector3());
  rig.helper.visible = false;
  rig.group.userData.internalLight = true;
  rig.light.castShadow = true;
  rig.light.visible = true;
  rig.light.intensity = 0;
  configureLightShadowDefaults(rig.light, 'directional');
  state.bootstrapDirectionalRig = rig;
  clearSelection();
}

function syncLightRigProperties(rig) {
  if (!rig || !rig.light) return;
  const type = rig.type;
  const clr = new THREE.Color(rig.color || '#FFFFFF');
  if (rig.light.color) rig.light.color.copy(clr);
  if (rig.light.groundColor && rig.light.groundColor.isColor) rig.light.groundColor.set(0x202020);
  rig.light.intensity = lightWattsToIntensity(type, rig.watts);
  if ('distance' in rig.light) rig.light.distance = Math.max(0, rig.radius || 0);
  if (type === 'rectarea' || type === 'helix') {
    rig.light.width = Math.max(0.1, rig.size || 1);
    rig.light.height = Math.max(0.1, rig.size || 1);
  }
  if (rig.light.isSpotLight) {
    rig.light.angle = THREE.MathUtils.degToRad(20 + (rig.size || 1) * 2);
    rig.light.penumbra = THREE.MathUtils.clamp(0.1 + (rig.size || 0) * 0.02, 0, 1);
  }
  if (rig.light.isDirectionalLight || rig.light.isSpotLight || rig.light.isPointLight) {
    rig.light.castShadow = !!rig.shadows;
    configureLightShadowDefaults(rig.light, type);
  }
  if (rig.helper) {
    rig.helper.visible = !rig.internal;
    rig.helper.traverse((o) => { if (o.material?.color) o.material.color.copy(clr); });
    rig.helper.scale.setScalar(1);
    if (type === 'rectarea' || type === 'helix' || type === 'spot') rig.helper.scale.setScalar(Math.max(0.5, rig.size || 1));
    if (type === 'point' || type === 'hemisphere') rig.helper.scale.setScalar(Math.max(0.5, rig.size || 1));
  }
  if (rig.group) rig.group.name = rig.name;
  state.preview.dirty = true;
}

function syncSelectedSceneLightFromTransform() {
  const rig = state.lights.rigs.find((r) => r.group === state.selection.object);
  if (!rig) return;
  syncLightRigProperties(rig);
}

function getSelectedLightRig() {
  return state.selection.type === 'sceneLight' ? state.lights.rigs.find((r) => r.group === state.selection.object) || null : null;
}

function refreshLightUI() {
  const rig = getSelectedLightRig();
  const addBtn = $("addLight"), delBtn = $("deleteLight"), updBtn = $("updateLightType"), tip = $("lightActionTip");
  if (addBtn) { addBtn.disabled = !!rig; addBtn.title = rig ? 'cannot create a new light when one is selected' : 'Add selected light type'; }
  if (delBtn) { delBtn.disabled = !rig; delBtn.title = rig ? 'Delete selected light' : 'Select a light to delete.'; }
  const selectedType = $("lightTypeSelect")?.value || 'directional';
  if (updBtn) { updBtn.disabled = !rig || rig.type === selectedType; updBtn.title = rig ? (rig.type === selectedType ? 'pick a new light type to update.' : 'Update selected light type') : 'Select a light to update.'; }
  if (tip) tip.textContent = rig ? `Selected ${rig.name}` : 'Add a light to begin.';
  $("lightSettingsEmpty").style.display = rig ? 'none' : 'block';
  $("lightSettingsPanel").style.display = rig ? 'block' : 'none';
  const sizeWrap = $("selectedLightSizeWrap");
  if (!rig) {
    if (sizeWrap) sizeWrap.style.display = 'none';
    return;
  }
  const allowSize = ["spot", "rectarea", "helix"].includes(rig.type);
  if (sizeWrap) sizeWrap.style.display = allowSize ? 'grid' : 'none';
  $("selectedLightIntensity").value = String(rig.watts);
  $("selectedLightIntensityVal").value = String(rig.watts);
  $("selectedLightColor").value = rig.color;
  $("selectedLightColorHex").value = rig.color.replace('#','');
  $("selectedLightSize").value = String(rig.size);
  $("selectedLightSizeVal").value = String(rig.size);
  $("selectedLightRadius").value = String(rig.radius);
  $("selectedLightRadiusVal").value = String(rig.radius);
  $("selectedLightShadows").checked = !!rig.shadows;
}

function addLightFromUI() {
  if (getSelectedLightRig()) return;
  const type = $("lightTypeSelect")?.value || 'directional';
  const rig = buildLightRig(type);
  state.lights.rigs.push(rig);
  buildObjectList();
  selectObject(rig.group, 'sceneLight');
  refreshLightUI();
}

function deleteSelectedLight() {
  const rig = getSelectedLightRig();
  if (!rig) return;
  if (rig.group?.parent) rig.group.parent.remove(rig.group);
  state.lights.rigs = state.lights.rigs.filter((r) => r !== rig);
  clearSelection();
  buildObjectList();
  refreshLightUI();
}

function updateSelectedLightType() {
  const rig = getSelectedLightRig();
  if (!rig) return;
  const type = $("lightTypeSelect")?.value || rig.type;
  if (type === rig.type) return;
  const updated = buildLightRig(type, rig);
  const idx = state.lights.rigs.findIndex((r) => r.id === rig.id);
  if (idx >= 0) state.lights.rigs[idx] = updated;
  buildObjectList();
  selectObject(updated.group, 'sceneLight');
  refreshLightUI();
}

function updateSelectedLightSetting(which, value) {
  const rig = getSelectedLightRig();
  if (!rig) return;
  if (which === 'watts') rig.watts = Number(value);
  if (which === 'color') rig.color = value.startsWith('#') ? value : `#${value.replace(/^#?/,'')}`;
  if (which === 'size') rig.size = Number(value);
  if (which === 'radius') rig.radius = Number(value);
  if (which === 'shadows') rig.shadows = !!value;
  syncLightRigProperties(rig);
  refreshLightUI();
}

function makeFloorPlane() {
  const size = Math.max(4, state.modelRadius * 6);
  const geo = new THREE.PlaneGeometry(size, size, 1, 1);
  const mat = new THREE.MeshStandardMaterial({
    color: 0xa7aeb6,
    roughness: 0.92,
    metalness: 0.02,
    transparent: true,
    opacity: 0.98,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = "Floor Plane";
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0;
  mesh.receiveShadow = true;
  mesh.renderOrder = 5;
  mesh.material.polygonOffset = true;
  mesh.material.polygonOffsetFactor = 1;
  mesh.material.polygonOffsetUnits = 1;
  return mesh;
}

function updateFloorButton() {
  $("toggleFloor").textContent = state.floor.mesh ? "Delete Floor Plane" : "Spawn Floor Plane";
}

function toggleFloorPlane() {
  if (state.floor.mesh) {
    if (state.selection.object === state.floor.mesh) clearSelection();
    state.scene.remove(state.floor.mesh);
    state.floor.mesh.geometry.dispose?.();
    disposeMaterial(state.floor.mesh.material);
    state.floor.mesh = null;
    buildObjectList();
    updateFloorButton();
    updateHelixShadowLight();
    log("Floor plane removed.");
    return;
  }

  const floor = makeFloorPlane();
  state.floor.mesh = floor;
  state.scene.add(floor);
  selectObject(floor, "floor");
  buildObjectList();
  updateFloorButton();
  updateHelixShadowLight();
  log("Floor plane added.");
}

function buildObjectList() {
  state.objects = [];
  if (state.root) {
    state.objects.push({ id: "model_root", name: "Loaded Model", path: "Loaded Model", obj: state.root, special: true });
    state.root.traverse((obj) => {
      if (obj === state.root) return;
      if (obj.isMesh || obj.children?.length) {
        state.objects.push({ id: obj.uuid, name: obj.name?.trim() || obj.type, path: getObjectPath(obj), obj, special: false });
      }
    });
  }
  state.lights.rigs.forEach((rig) => state.objects.unshift({ id: rig.id, name: rig.name, path: rig.name, obj: rig.group, special: true, kind: 'light' }));
  if (state.floor.mesh) state.objects.unshift({ id: "floor", name: "Floor Plane", path: "Floor Plane", obj: state.floor.mesh, special: true });
  if (state.gsplat.object) state.objects.unshift({ id: "gsplat", name: "GSplat Scene (WIP)", path: "GSplat Scene (WIP)", obj: state.gsplat.object, special: true });
  renderObjectList();
}

function getObjectPath(obj) {
  const parts = [];
  let cur = obj;
  while (cur && cur !== state.root) {
    parts.push(cur.name || cur.type);
    cur = cur.parent;
  }
  return parts.reverse().join(" / ");
}

function renderObjectList() {
  const filter = ($("objFilter").value || "").toLowerCase().trim();
  const list = $("objList");
  list.innerHTML = "";

  const shown = state.objects
    .filter((item) => !filter || item.path.toLowerCase().includes(filter) || item.name.toLowerCase().includes(filter))
    .slice(0, 3500);

  shown.forEach((item) => {
    const row = document.createElement("div");
    row.className = "itemRow";

    const name = document.createElement("div");
    name.className = "name";
    name.textContent = item.path;
    name.title = item.path;
    name.onclick = () => {
      if (item.special) {
        if (item.id === "floor") selectObject(state.floor.mesh, "floor");
        else if (item.id === "model_root") selectObject(state.root, "model");
        else if (item.id === "gsplat") selectObject(state.gsplat.object, "gsplat");
        else if (item.kind === "light") { const rig = state.lights.rigs.find((r) => r.id === item.id); if (rig) selectObject(rig.group, "sceneLight"); }
      } else {
        selectObject(state.root, "model");
      }
    };

    const eye = document.createElement("div");
    eye.className = `iconBtn${item.obj.visible ? "" : " off"}`;
    eye.textContent = item.obj.visible ? "👁" : "🚫";
    eye.title = item.obj.visible ? "Hide" : "Show";
    eye.onclick = () => {
      item.obj.visible = !item.obj.visible;
      renderObjectList();
    };

    const cam = document.createElement("div");
    cam.className = "iconBtn";
    cam.textContent = "📷";
    cam.title = "Set POI";
    cam.onclick = () => {
      if (item.id === "floor" || item.id === "gsplat" || item.kind === "light") return;
      enterPOIMode(item.id === "model_root" ? state.root.uuid : item.id);
    };

    if (item.id === "floor" || item.id === "gsplat" || item.kind === "light") cam.style.visibility = "hidden";

    row.appendChild(name);
    row.appendChild(eye);
    row.appendChild(cam);
    list.appendChild(row);
  });
}

function showPOIOverlay(show, title = "") {
  $("poiOverlay").style.display = show ? "block" : "none";
  $("poiTitle").textContent = title || "Setting POI";
}

function focusOnObject(obj) {
  const box = new THREE.Box3().setFromObject(obj);
  const center = new THREE.Vector3();
  const size = new THREE.Vector3();
  box.getCenter(center);
  box.getSize(size);
  const radius = Math.max(size.x, size.y, size.z) * 0.5 || 0.25;

  const cam = state.camera;
  const controls = state.controls;
  const dir = cam.position.clone().sub(controls.target).normalize();
  const fov = THREE.MathUtils.degToRad(cam.fov);
  const dist = (radius / Math.sin(fov / 2)) * 1.15;
  cam.position.copy(center.clone().add(dir.multiplyScalar(dist)));
  controls.target.copy(center);
  state.cameraRig.rollDeg = 0;
  applyRoll(cam, controls.target, 0);
  controls.update();
  syncCameraUIFromView();
}

function enterPOIMode(objectId) {
  if (!state.root) return;
  const found = objectId === state.root.uuid ? { id: state.root.uuid, path: "Loaded Model", obj: state.root } : state.objects.find((o) => o.id === objectId);
  if (!found) return;
  state.poi.active = true;
  state.poi.currentObjectId = found.id;
  state.poi.savedViewBefore = saveCurrentView();
  focusOnObject(found.obj);
  showPOIOverlay(true, `Point of Interest: ${found.path}`);
  updatePreviewButtons();
  log(`POI mode: ${found.path}`);
}

function exitPOIMode(restore = true) {
  if (!state.poi.active) return;
  const saved = state.poi.savedViewBefore;
  state.poi.active = false;
  state.poi.currentObjectId = null;
  state.poi.savedViewBefore = null;
  showPOIOverlay(false);
  updatePreviewButtons();
  if (restore && saved) setCameraToSavedView(saved);
}

function savePOI() {
  let found = null;
  if (state.poi.currentObjectId === state.root.uuid) {
    found = { path: "Loaded Model" };
  } else {
    found = state.objects.find((o) => o.id === state.poi.currentObjectId);
  }
  if (!found) {
    exitPOIMode(true);
    return;
  }
  state.poi.list.push({
    id: crypto?.randomUUID?.() || `${Date.now()}_${Math.random()}`,
    name: found.path,
    view: saveCurrentView(),
  });
  renderPOIList();
  exitPOIMode(false);
  log(`Saved POI: ${found.path}`);
}

function renderPOIList() {
  const list = $("poiList");
  list.innerHTML = "";
  state.poi.list.forEach((poi) => {
    const row = document.createElement("div");
    row.className = "poiRow";

    const name = document.createElement("div");
    name.className = "name";
    name.textContent = poi.name;
    name.onclick = () => setCameraToSavedView(poi.view);

    const del = document.createElement("div");
    del.className = "iconBtn";
    del.textContent = "✕";
    del.onclick = (e) => {
      e.stopPropagation();
      state.poi.list = state.poi.list.filter((p) => p.id !== poi.id);
      renderPOIList();
    };

    row.appendChild(name);
    row.appendChild(del);
    list.appendChild(row);
  });
}

function revokeObjectUrls() {
  state.hdri.objectUrls.forEach((url) => {
    try { URL.revokeObjectURL(url); } catch {}
  });
  state.hdri.objectUrls = [];
}

function clearHDRIs() {
  state.hdri.files = [];
  state.hdri.cache.clear();
  state.hdri.selectedUrl = "";
  revokeObjectUrls();
  $("hdriSelect").innerHTML = '<option value="">(none)</option>';
  $("hdriStatus").textContent = "No HDRIs loaded.";
  state.scene.environment = state.gsplat.envMap || null;
  state.scene.background = null;
  applyBackground();
  updateBackgroundControlState();
  log("HDRIs cleared.");
}

function setHDRIUIList() {
  const sel = $("hdriSelect");
  sel.innerHTML = ['<option value="">(none)</option>', ...state.hdri.files.map((f) => `<option value="${f.url}">${f.name}</option>`)].join("");
  $("hdriStatus").textContent = `Loaded ${state.hdri.files.length} HDRI(s).`;
}

function validateHdriFiles(files) {
  const out = [];
  files.forEach((f) => {
    const name = f.name.toLowerCase();
    if (name.endsWith(".hdr")) out.push({ file: f, ext: "hdr" });
    else if (name.endsWith(".exr")) out.push({ file: f, ext: "exr" });
  });
  return out;
}

function ingestHdriFiles(files) {
  clearHDRIs();
  const valid = validateHdriFiles(files);
  if (!valid.length) {
    log("No .hdr or .exr files found.");
    return;
  }
  valid.forEach((entry) => {
    const url = URL.createObjectURL(entry.file);
    state.hdri.objectUrls.push(url);
    state.hdri.files.push({ name: entry.file.name, ext: entry.ext, url });
  });
  state.hdri.files.sort((a, b) => a.name.localeCompare(b.name));
  setHDRIUIList();
  log(`HDRIs loaded: ${state.hdri.files.length}`);
}

async function loadHdriFromFolderPicker() {
  try {
    if ("showDirectoryPicker" in window) {
      const dir = await window.showDirectoryPicker();
      const files = [];
      for await (const [, handle] of dir.entries()) {
        if (handle.kind === "file") files.push(await handle.getFile());
      }
      ingestHdriFiles(files);
      return;
    }
  } catch (e) {
    log(`Folder picker fallback: ${e?.message || e}`);
  }
  $("hdriFolderInput").click();
}

async function loadEnvTexture(fileRec) {
  const url = fileRec.url;
  if (state.hdri.cache.has(url)) return state.hdri.cache.get(url);

  let tex;
  if (fileRec.ext === "hdr") tex = await new RGBELoader().loadAsync(url);
  else {
    tex = await new EXRLoader().loadAsync(url);
    tex.colorSpace = THREE.LinearSRGBColorSpace;
  }

  tex.mapping = THREE.EquirectangularReflectionMapping;
  const envRT = state.pmrem.fromEquirectangular(tex);
  const data = { tex, envRT, envTex: envRT.texture };
  state.hdri.cache.set(url, data);
  return data;
}

async function applyHDRI(url) {
  if (!url) {
    state.hdri.selectedUrl = "";
    state.scene.environment = state.gsplat.envMap || null;
    state.scene.background = null;
    applyBackground();
    updateBackgroundControlState();
    return;
  }
  const fileRec = state.hdri.files.find((f) => f.url === url);
  if (!fileRec) return;
  const data = await loadEnvTexture(fileRec);
  state.hdri.selectedUrl = url;
  state.scene.environment = data.envTex;
  if (state.hdri.useAsBackground) state.scene.background = data.tex;
  else {
    state.scene.background = null;
    applyBackground();
  }
  updateBackgroundControlState();
}

function shouldIgnoreKeyboardShortcut() {
  const el = document.activeElement;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT");
}

function updateKeyboardMovement(dt) {
  if (!state.root || shouldIgnoreKeyboardShortcut() || state.transformControls.dragging) return;
  const keys = state.keyboard.pressed;
  if (!keys.size) return;

  const turbo = keys.has("ShiftLeft") || keys.has("ShiftRight");
  const speed = state.keyboard.moveSpeed * (turbo ? 2.1 : 1.0);
  const verticalSpeed = state.keyboard.verticalSpeed * (turbo ? 2.1 : 1.0);

  const forward = TMP.v1;
  state.camera.getWorldDirection(forward);
  forward.y = 0;
  if (forward.lengthSq() < 1e-6) forward.set(0, 0, -1);
  forward.normalize();

  const right = TMP.v2.setFromMatrixColumn(state.camera.matrixWorld, 0);
  right.y = 0;
  if (right.lengthSq() < 1e-6) right.set(1, 0, 0);
  right.normalize();
  const delta = TMP.v3.set(0, 0, 0);

  if (keys.has("KeyW")) delta.add(forward);
  if (keys.has("KeyS")) delta.sub(forward);
  if (keys.has("KeyA")) delta.sub(right);
  if (keys.has("KeyD")) delta.add(right);
  if (keys.has("KeyQ")) delta.y += 1;
  if (keys.has("KeyE")) delta.y -= 1;

  if (delta.lengthSq() < 1e-7) return;
  delta.normalize();
  delta.x *= speed * dt;
  delta.z *= speed * dt;
  delta.y *= verticalSpeed * dt;

  state.camera.position.add(delta);
  state.controls.target.add(delta);
  applyRoll(state.camera, state.controls.target, state.cameraRig.rollDeg);
  state.controls.update();
  copyMainCameraToPreview();
  state.keyboard.movedThisFrame = true;
  state.ui.cameraSyncPending = true;
}


function detectSceneSource(url) {
  const trimmed = (url || "").trim();
  const luma = trimmed.match(/https?:\/\/lumalabs\.ai\/capture\/[0-9a-f-]+/i);
  if (luma) return { kind: "luma", url: luma[0] };
  if (/https?:\/\/(www\.)?superspl\.at\//i.test(trimmed)) return { kind: "supersplat", url: trimmed };
  if (/\.(spz|splat|ksplat|ply|sog|compressed\.ply)(?:[?#].*)?$/i.test(trimmed)) return { kind: "spark", url: trimmed };
  return { kind: "spark", url: trimmed };
}

async function ensureLumaModule() {
  if (!state.gsplat.lumaModule) {
    state.gsplat.lumaModule = await import(LUMA_MODULE_URL);
  }
  return state.gsplat.lumaModule;
}

async function ensureSparkModule() {
  if (!state.gsplat.module) {
    state.gsplat.module = await import(SPARK_MODULE_URL);
  }
  return state.gsplat.module;
}

async function loadSparkSplatFromSource(source) {
  const spark = await ensureSparkModule();
  const { SplatMesh, SparkRenderer, SplatFileType } = spark;

  const sparkRenderer = new SparkRenderer({
    renderer: state.renderer,
    autoUpdate: true,
    pagedExtSplats: true,
    focalDistance: state.cameraRig.focalDistance,
    focalAdjustment: state.gsplat.quality === "high" ? 2.2 : state.gsplat.quality === "low" ? 1.4 : 1.8,
    apertureAngle: Math.max(0, (50 / Math.max(0.7, state.cameraRig.apertureF)) * 0.002),
    transparent: true,
    depthTest: true,
    depthWrite: false,
    sortRadial: true,
  });
  sparkRenderer.renderOrder = -1000;
  state.scene.add(sparkRenderer);
  state.gsplat.sparkRenderer = sparkRenderer;

  const options = {
    lod: true,
    extSplats: true,
    enableLod: true,
    lodScale: state.gsplat.quality === "low" ? 0.75 : state.gsplat.quality === "high" ? 1.7 : 1.15,
    raycastable: !!state.gsplat.selectable,
    focalAdjustment: state.gsplat.quality === "high" ? 2.2 : state.gsplat.quality === "low" ? 1.4 : 1.8,
  };
  if (source.url) options.url = source.url;
  if (source.fileBytes) {
    options.fileBytes = source.fileBytes;
    options.fileName = source.fileName;
    const lower = (source.fileName || '').toLowerCase();
    if (lower.endsWith('.splat') && SplatFileType?.SPLAT) options.fileType = SplatFileType.SPLAT;
    if (lower.endsWith('.ksplat') && SplatFileType?.KSPLAT) options.fileType = SplatFileType.KSPLAT;
  }

  const mesh = new SplatMesh(options);
  mesh.name = source.fileName ? `GSplat · ${source.fileName}` : "GSplat Scene";
  mesh.userData.selectableType = "gsplat";
  mesh.frustumCulled = false;
  mesh.renderOrder = -900;
  state.scene.add(mesh);
  normalizeGsplatPlacement(mesh);
  state.gsplat.object = mesh;
  state.gsplat.kind = "spark";
  state.gsplat.activeUrl = source.url || source.fileName || "";
  state.gsplat.fileUrl = source.objectUrl || "";

  try {
    await state.gsplat.sparkRenderer.update?.({ scene: state.scene, camera: state.camera });
  } catch {}

  try {
    if (state.gsplat.useForLighting) {
      const envMap = await sparkRenderer.renderEnvMap?.({ renderer: state.renderer, scene: state.scene, worldCenter: state.controls?.target || new THREE.Vector3() });
      if (envMap) {
        state.gsplat.envMap = envMap;
        if (!state.hdri.selectedUrl) state.scene.environment = envMap;
      }
    }
  } catch (e) {
    log(`GSplat env-map skipped: ${e?.message || e}`);
  }
}

async function loadSparkSplatFromUrl(url) {
  return loadSparkSplatFromSource({ url });
}

async function loadSparkSplatFromFile(file) {
  const bytes = await file.arrayBuffer();
  const objectUrl = URL.createObjectURL(file);
  await loadSparkSplatFromSource({ fileBytes: bytes, fileName: file.name, objectUrl });
}

async function loadLumaCaptureFromUrl(url) {
  const mod = await ensureLumaModule();
  const { LumaSplatsThree, LumaSplatsSemantics } = mod;
  const splat = new LumaSplatsThree({
    source: url,
    loadingAnimationEnabled: false,
    particleRevealEnabled: false,
    enableThreeShaderIntegration: true,
  });
  splat.name = "Luma Capture";
  splat.userData.selectableType = "gsplat";
  splat.frustumCulled = false;
  splat.renderOrder = -900;
  if (LumaSplatsSemantics) {
    const fg = LumaSplatsSemantics.FOREGROUND ?? 0;
    const bg = LumaSplatsSemantics.BACKGROUND ?? 0;
    if (fg || bg) splat.semanticsMask = fg | bg;
  }
  splat.onLoad = async () => {
    try {
      const tex = await splat.captureCubemap(state.renderer);
      if (tex) {
        state.gsplat.envMap = tex;
        if (!state.hdri.selectedUrl) state.scene.environment = tex;
      }
    } catch (e) {
      log(`Luma env-map skipped: ${e?.message || e}`);
    }
  };
  state.scene.add(splat);
  state.gsplat.object = splat;
  state.gsplat.kind = "luma";
  state.gsplat.activeUrl = url;
}

function normalizeGsplatPlacement(obj) {
  if (!obj) return;
  // Preserve authored origin/orientation when possible; only update camera clipping for usability.
  try {
    const box = new THREE.Box3().setFromObject(obj);
    if (Number.isFinite(box.max.x)) {
      const sphere = new THREE.Sphere();
      box.getBoundingSphere(sphere);
      state.camera.far = Math.max(state.camera.far, sphere.radius * 20, 5000);
      state.camera.updateProjectionMatrix();
    }
  } catch {}
}

function applyGsplatOffsets() {
  if (!state.gsplat.object) return;
  const x = Number($("gsplatOffsetX")?.value || 0);
  const y = Number($("gsplatOffsetY")?.value || 0);
  const z = Number($("gsplatOffsetZ")?.value || 0);
  state.gsplat.object.position.set(x, y, z);
  copyMainCameraToPreview();
}

function resetGsplatOffsets() {
  if ($("gsplatOffsetX")) $("gsplatOffsetX").value = '0';
  if ($("gsplatOffsetY")) $("gsplatOffsetY").value = '0';
  if ($("gsplatOffsetZ")) $("gsplatOffsetZ").value = '0';
  applyGsplatOffsets();
}

async function loadGsplatFromUrl(url) {
  if (!url || state.gsplat.loading) return;
  state.gsplat.loading = true;
  setBadge("Loading scene layer…");
  try {
    await clearGsplat();
    const source = detectSceneSource(url);
    if (source.kind === "supersplat") {
      throw new Error("SuperSplat share URLs are viewer pages. Export a raw .compressed.ply, .sog, .ply, .splat, .spz, or .ksplat file and paste that URL instead.");
    }
    if (source.kind === "luma") await loadLumaCaptureFromUrl(source.url);
    else await loadSparkSplatFromUrl(source.url);
    resetGsplatOffsets();
    buildObjectList();
    updateBackgroundControlState();
    applyBackground();
    copyMainCameraToPreview();
    log(`${source.kind === "luma" ? "Luma capture" : "GSplat"} loaded: ${source.url}`);
    setBadge("Ready");
  } catch (e) {
    log(`Scene layer load failed: ${e?.message || e}`);
    setBadge("Scene layer failed (see log)");
  } finally {
    state.gsplat.loading = false;
  }
}

async function loadGsplatFromFile(file) {
  if (!file || state.gsplat.loading) return;
  state.gsplat.loading = true;
  setBadge("Loading scene layer…");
  try {
    await clearGsplat();
    await loadSparkSplatFromFile(file);
    resetGsplatOffsets();
    resetGsplatOffsets();
    buildObjectList();
    updateBackgroundControlState();
    applyBackground();
    copyMainCameraToPreview();
    log(`GSplat file loaded: ${file.name}`);
    setBadge("Ready");
  } catch (e) {
    log(`Scene layer file load failed: ${e?.message || e}`);
    setBadge("Scene layer failed (see log)");
  } finally {
    state.gsplat.loading = false;
  }
}

async function clearGsplat() {
  if (state.selection.object === state.gsplat.object) clearSelection();
  if (state.gsplat.object) {
    try { state.gsplat.object.dispose?.(); } catch {}
    state.scene.remove(state.gsplat.object);
    state.gsplat.object = null;
  }
  if (state.gsplat.sparkRenderer) {
    try { state.gsplat.sparkRenderer.dispose?.(); } catch {}
    state.scene.remove(state.gsplat.sparkRenderer);
    state.gsplat.sparkRenderer = null;
  }
  if (state.gsplat.fileUrl) {
    try { URL.revokeObjectURL(state.gsplat.fileUrl); } catch {}
  }
  state.gsplat.kind = "";
  state.gsplat.activeUrl = "";
  state.gsplat.fileUrl = "";
  state.gsplat.envMap = null;
  if (!state.hdri.selectedUrl) state.scene.environment = null;
  buildObjectList();
  updateBackgroundControlState();
  applyBackground();
  copyMainCameraToPreview();
  log("Scene layer cleared.");
}

function downloadBlob(blob, filename) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}


function isAdditionalMetadataEnabled() {
  return !!$("addExtraMetadata")?.checked;
}

function getAdditionalMetadataText() {
  if (!isAdditionalMetadataEnabled()) return "";
  return ($("additionalMetadataText")?.value || "").trim();
}

function getObjectTransformSnapshot(object) {
  if (!object) return null;
  object.updateWorldMatrix?.(true, false);
  return {
    name: object.name || "",
    position: object.position?.toArray?.() || [0, 0, 0],
    rotation: object.rotation ? [object.rotation.x, object.rotation.y, object.rotation.z] : [0, 0, 0],
    quaternion: object.quaternion?.toArray?.() || [0, 0, 0, 1],
    scale: object.scale?.toArray?.() || [1, 1, 1],
    worldPosition: object.getWorldPosition ? object.getWorldPosition(new THREE.Vector3()).toArray() : null,
    worldQuaternion: object.getWorldQuaternion ? object.getWorldQuaternion(new THREE.Quaternion()).toArray() : null,
    worldScale: object.getWorldScale ? object.getWorldScale(new THREE.Vector3()).toArray() : null,
  };
}

function getSceneSnapshotMetadata() {
  return {
    camera: {
      position: state.camera.position.toArray(),
      quaternion: state.camera.quaternion.toArray(),
      target: state.controls.target.toArray(),
      focalLength: state.cameraRig.focalLength,
      apertureF: state.cameraRig.apertureF,
      focalDistance: state.cameraRig.focalDistance,
      blurScaleRatio: state.cameraRig.blurScaleRatio,
      focusWorldPoint: getFocusWorldPoint().toArray(),
      sensorPreset: state.cameraRig.sensorPreset,
      sensorWidth: state.cameraRig.sensorWidth,
      sensorHeight: state.cameraRig.sensorHeight,
      rollDeg: state.cameraRig.rollDeg,
      dofEnabled: state.cameraRig.dofEnabled,
    },
    transforms: {
      model: getObjectTransformSnapshot(state.root),
      floor: getObjectTransformSnapshot(state.floor.mesh),
      gsplat: getObjectTransformSnapshot(state.gsplat.object),
      helix: getObjectTransformSnapshot(state.helix.light),
      sceneLights: state.lights.rigs.map((rig) => ({
        id: rig.id,
        name: rig.name,
        type: rig.type,
        watts: rig.watts,
        color: rig.color,
        size: rig.size,
        radius: rig.radius,
        shadows: !!rig.shadows,
        transform: getObjectTransformSnapshot(rig.group),
      })),
    },
    environment: {
      hdriSelectedUrl: state.hdri.selectedUrl || "",
      hdriUsedAsBackground: !!$("hdriUseAsBg")?.checked,
      background: $("bg")?.value || "transparent",
      lightingPreset: $("light")?.value || "studio",
      previewBloom: Number($("previewBloom")?.value || 0),
      aoEnabled: !!$("aoEnabled")?.checked,
      colorPipeline: getColorPipelineConfig(),
      colorCorrection: getColorCorrectionConfig(),
    },
  };
}

function buildImageMetadata({ shotName = "capture", fileName = "capture.png", exportContext = "single_capture" } = {}) {
  const extra = getAdditionalMetadataText();
  return {
    app: "GLB Screenshot Exporter",
    version: "v1.6.8",
    createdAt: new Date().toISOString(),
    shotName,
    fileName,
    exportContext,
    additionalInformation: extra || "",
    scene: getSceneSnapshotMetadata(),
    modelStats: state.stats,
  };
}

const PNG_SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
let PNG_CRC_TABLE = null;

function makePngCrcTable() {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    table[n] = c >>> 0;
  }
  return table;
}

function crc32(bytes) {
  PNG_CRC_TABLE ||= makePngCrcTable();
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = PNG_CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function u32be(value) {
  return new Uint8Array([(value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255]);
}

function concatUint8Arrays(parts) {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function buildPngChunk(type, data) {
  const typeBytes = new TextEncoder().encode(type);
  const crcBytes = concatUint8Arrays([typeBytes, data]);
  return concatUint8Arrays([u32be(data.length), typeBytes, data, u32be(crc32(crcBytes))]);
}

function buildPngITXtChunk(keyword, text) {
  const enc = new TextEncoder();
  const keywordBytes = enc.encode(keyword.slice(0, 79));
  const textBytes = enc.encode(text);
  const data = concatUint8Arrays([
    keywordBytes,
    new Uint8Array([0, 0, 0, 0, 0]),
    textBytes,
  ]);
  return buildPngChunk("iTXt", data);
}

async function embedMetadataInPngBlob(blob, metadata) {
  if (!blob || !metadata || blob.type !== "image/png") return blob;
  const bytes = new Uint8Array(await blob.arrayBuffer());
  if (bytes.length < 12 || !PNG_SIGNATURE.every((v, i) => bytes[i] === v)) return blob;
  const text = JSON.stringify(metadata);
  const softwareChunk = buildPngITXtChunk("Software", "GLB Screenshot Exporter v1.6.8");
  const descriptionChunk = buildPngITXtChunk("Description", text);
  const iendIndex = bytes.length - 12;
  const out = concatUint8Arrays([bytes.slice(0, iendIndex), softwareChunk, descriptionChunk, bytes.slice(iendIndex)]);
  return new Blob([out], { type: "image/png" });
}

function findAlphaBounds(canvas) {
  const ctx = make2DContext(canvas);
  if (!ctx) return null;
  const { width, height } = canvas;
  const data = ctx.getImageData(0, 0, width, height).data;
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y += 2) {
    for (let x = 0; x < width; x += 2) {
      const a = data[(y * width + x) * 4 + 3];
      if (a > 12) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  return { minX, minY, maxX, maxY, cx: (minX + maxX) * 0.5, cy: (minY + maxY) * 0.5 };
}

function projectFocusPoint(canvas) {
  const cam = state.camera;
  const target = getFocusWorldPoint();
  const ndc = target.project(cam);
  return {
    x: THREE.MathUtils.clamp((ndc.x * 0.5 + 0.5) * canvas.width, -canvas.width, canvas.width * 2),
    y: THREE.MathUtils.clamp((-ndc.y * 0.5 + 0.5) * canvas.height, -canvas.height, canvas.height * 2),
    dist: cam.position.distanceTo(target),
  };
}

function applyLocalDOF(sourceCanvas, previewMode = false) {
  if (!state.cameraRig.dofEnabled) return sourceCanvas;
  const w = sourceCanvas.width;
  const h = sourceCanvas.height;
  const focus = projectFocusPoint(sourceCanvas);
  const aperture = THREE.MathUtils.clamp(state.cameraRig.apertureF, 0.7, 32);
  const focusDist = Math.max(0.1, state.cameraRig.focalDistance || focus.dist);
  const focalLength = THREE.MathUtils.clamp(state.cameraRig.focalLength || 45, 10, 250);
  const sensorWidth = THREE.MathUtils.clamp(state.cameraRig.sensorWidth || 36, 8, 80);
  const blurScaleRatio = THREE.MathUtils.clamp(state.cameraRig.blurScaleRatio || 1, 0.1, 5);
  const focalFactor = THREE.MathUtils.clamp(focalLength / 50, 0.4, 4.0);
  const sensorFactor = THREE.MathUtils.clamp(sensorWidth / 36, 0.45, 2.4);
  const focusError = Math.abs(focus.dist - focusDist) / Math.max(0.25, focus.dist, focusDist);
  const baseBlur = THREE.MathUtils.clamp((((18 / aperture) * focalFactor * sensorFactor) + (focusError * 12 * focalFactor)) * (previewMode ? 0.65 : 0.95), 0, previewMode ? 9 : 18);
  if (baseBlur < 0.5) return sourceCanvas;

  const out = document.createElement("canvas");
  out.width = w; out.height = h;
  const ctx = make2DContext(out);
  if (!ctx) return sourceCanvas;

  const blurred = document.createElement("canvas");
  blurred.width = w; blurred.height = h;
  const bctx = make2DContext(blurred);
  if (!bctx) return sourceCanvas;

  const sizeBoost = blurScaleRatio < 1 ? Math.pow(1 / blurScaleRatio, 0.32) : 1;
  const stretchX = blurScaleRatio > 1 ? blurScaleRatio : 1;
  const stretchY = blurScaleRatio > 1 ? (1 / Math.sqrt(blurScaleRatio)) : 1;
  const blurPx = THREE.MathUtils.clamp(baseBlur * sizeBoost, 0, previewMode ? 10 : 20);
  const scaledW = Math.max(2, Math.round(w / stretchX));
  const scaledH = Math.max(2, Math.round(h / stretchY));
  const squashed = document.createElement("canvas");
  squashed.width = scaledW;
  squashed.height = scaledH;
  const qctx = make2DContext(squashed);
  if (!qctx) return sourceCanvas;
  qctx.drawImage(sourceCanvas, 0, 0, scaledW, scaledH);
  bctx.filter = `blur(${blurPx.toFixed(2)}px)`;
  bctx.drawImage(squashed, 0, 0, scaledW, scaledH, 0, 0, w, h);
  bctx.filter = "none";
  ctx.drawImage(blurred, 0, 0);

  const sharpLayer = document.createElement("canvas");
  sharpLayer.width = w; sharpLayer.height = h;
  const sctx = make2DContext(sharpLayer);
  if (!sctx) return sourceCanvas;
  sctx.drawImage(sourceCanvas, 0, 0);

  const apertureOpen = THREE.MathUtils.clamp((8 / aperture), 0.25, 8.0);
  const focusRadiusBase = Math.min(w, h) * 0.18;
  const focusRadiusX = THREE.MathUtils.clamp(focusRadiusBase / (apertureOpen * focalFactor * sensorFactor * 0.45), Math.min(w, h) * 0.05, Math.min(w, h) * 0.44);
  const focusRatioY = blurScaleRatio > 1 ? 0.72 / Math.sqrt(blurScaleRatio) : (0.86 + Math.min(0.24, (1 / blurScaleRatio - 1) * 0.06));
  const focusRadiusY = focusRadiusX * focusRatioY;
  const feather = Math.max(18, focusRadiusX * 1.15);

  sctx.save();
  sctx.globalCompositeOperation = 'destination-in';
  sctx.translate(focus.x, focus.y);
  sctx.scale(1, focusRadiusY / Math.max(1, focusRadiusX));
  const g = sctx.createRadialGradient(0, 0, 0, 0, 0, focusRadiusX + feather);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.62, 'rgba(255,255,255,0.98)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  sctx.fillStyle = g;
  sctx.beginPath();
  sctx.arc(0, 0, focusRadiusX + feather, 0, Math.PI * 2);
  sctx.fill();
  sctx.restore();

  ctx.drawImage(sharpLayer, 0, 0);
  return out;
}

function drawBokeh(ctx, w, h, cfg) {
  const blurScaleRatio = THREE.MathUtils.clamp(state.cameraRig.blurScaleRatio || 1, 0.1, 5);
  const stretchX = blurScaleRatio > 1 ? blurScaleRatio : 1;
  const stretchY = blurScaleRatio > 1 ? Math.max(0.35, 1 / Math.sqrt(blurScaleRatio)) : 1;
  const points = [
    [0.18, 0.18, 0.11, 0.06],
    [0.77, 0.16, 0.09, 0.04],
    [0.14, 0.44, 0.07, 0.03],
    [0.84, 0.36, 0.05, 0.02],
  ];
  ctx.save();
  points.forEach(([x, y, r, a]) => {
    const px = w * x;
    const py = h * y;
    const radius = Math.min(w, h) * r;
    ctx.save();
    ctx.translate(px, py);
    ctx.scale(stretchX, stretchY);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
    g.addColorStop(0, `rgba(255,255,255,${a * (0.7 + cfg.strength * 0.3)})`);
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });
  ctx.restore();
}

function applyBeautyFinishing(sourceCanvas, previewMode = false) {
  sourceCanvas = applyLocalDOF(sourceCanvas, previewMode);
  const w = sourceCanvas.width;
  const h = sourceCanvas.height;
  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  const ctx = make2DContext(out);
  if (!ctx) return sourceCanvas;
  const cfg = getLookConfig();

  const bg = ctx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, cfg.skyTop);
  bg.addColorStop(0.58, cfg.skyMid);
  bg.addColorStop(0.78, cfg.floorTop);
  bg.addColorStop(1.0, cfg.floorBottom);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  drawBokeh(ctx, w, h, cfg);

  ctx.save();
  ctx.filter = `contrast(${106 + cfg.strength * 6}%) saturate(${106 + cfg.strength * 10}%) brightness(${previewMode ? 106 : 104}%)`;
  ctx.drawImage(sourceCanvas, 0, 0, w, h);
  ctx.restore();

  const shadowAlpha = state.helix.shadowEnabled && state.floor.mesh ? 0.12 : 0.04;
  ctx.save();
  ctx.fillStyle = `rgba(0,0,0,${shadowAlpha})`;
  ctx.fillRect(0, h * 0.8, w, h * 0.2);
  ctx.restore();

  const bloom = Number($("previewBloom")?.value || state.lighting.bloom || 0);
  if (bloom > 0.001) {
    ctx.save();
    ctx.globalAlpha = Math.min(0.12, bloom * 0.24);
    ctx.filter = `blur(${Math.max(2, bloom * (previewMode ? 10 : 14))}px) brightness(116%)`;
    ctx.drawImage(sourceCanvas, 0, 0, w, h);
    ctx.restore();
  }

  const vignette = ctx.createRadialGradient(w * 0.5, h * 0.46, Math.min(w, h) * 0.22, w * 0.5, h * 0.5, Math.max(w, h) * 0.72);
  vignette.addColorStop(0, "rgba(0,0,0,0)");
  vignette.addColorStop(1, `rgba(0,0,0,${previewMode ? 0.06 : cfg.vignette + cfg.strength * 0.04})`);
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, w, h);
  return applyColorPipeline(out);
}

async function renderRawStill(sizePx, opts = {}) {
  const transparent = !!opts.transparent;
  const renderer = state.renderer;
  const camera = state.camera;
  const prevAspect = camera.aspect;
  const prevTarget = renderer.getRenderTarget();
  const prevXr = renderer.xr.enabled;
  const prevBackground = state.scene.background;
  const prevViewport = renderer.getViewport(new THREE.Vector4()).clone();
  const prevScissor = renderer.getScissor(new THREE.Vector4()).clone();
  const prevScissorTest = renderer.getScissorTest();
  const restore = setOverlayObjectsVisible(false);
  const dims = typeof sizePx === "object" ? sizePx : (() => {
    const aspect = Math.max(0.25, state.camera.aspect || 1);
    return aspect >= 1 ? { width: Math.round(sizePx), height: Math.round(sizePx / aspect) } : { width: Math.round(sizePx * aspect), height: Math.round(sizePx) };
  })();
  const width = Math.max(2, Math.floor(dims.width));
  const height = Math.max(2, Math.floor(dims.height));
  const target = new THREE.WebGLRenderTarget(width, height, {
    format: THREE.RGBAFormat,
    type: THREE.UnsignedByteType,
    depthBuffer: true,
    stencilBuffer: false,
  });
  if (renderer.capabilities.isWebGL2) target.samples = 4;
  const pixels = new Uint8Array(width * height * 4);
  try {
    renderer.xr.enabled = false;
    if (transparent) {
      state.scene.background = null;
      renderer.setClearColor(0x000000, 0);
    } else {
      setRendererClear(renderer, false);
    }
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setRenderTarget(target);
    renderer.setViewport(0, 0, width, height);
    renderer.setScissor(0, 0, width, height);
    renderer.setScissorTest(true);
    renderer.clear(true, true, true);
    renderer.render(state.scene, camera);
    renderer.readRenderTargetPixels(target, 0, 0, width, height, pixels);
    return makeCanvasFromPixels(pixels, width, height);
  } finally {
    restoreOverlayVisibility(restore);
    state.scene.background = prevBackground;
    renderer.setRenderTarget(prevTarget);
    renderer.xr.enabled = prevXr;
    renderer.setViewport(prevViewport);
    renderer.setScissor(prevScissor);
    renderer.setScissorTest(prevScissorTest);
    camera.aspect = prevAspect;
    camera.updateProjectionMatrix();
    target.dispose();
    applyBackground();
  }
}

function applyGlobalGrade(sourceCanvas, previewMode = false) {
  sourceCanvas = applyLocalDOF(sourceCanvas, previewMode);
  const out = document.createElement("canvas");
  out.width = sourceCanvas.width;
  out.height = sourceCanvas.height;
  const ctx = make2DContext(out);
  if (!ctx) return sourceCanvas;
  if (!ctx) return sourceCanvas;
  ctx.drawImage(sourceCanvas, 0, 0);
  ctx.save();
  ctx.filter = `contrast(${previewMode ? 104 : 108}%) saturate(${previewMode ? 106 : 110}%) brightness(${previewMode ? 105 : 103}%)`;
  ctx.drawImage(sourceCanvas, 0, 0);
  ctx.restore();
  if (state.lighting.aoEnabled && state.floor.mesh) {
    const w = out.width, h = out.height;
    const g = ctx.createRadialGradient(w * 0.5, h * 0.72, 0, w * 0.5, h * 0.72, Math.min(w, h) * 0.42);
    g.addColorStop(0, 'rgba(0,0,0,0.12)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }
  return applyColorPipeline(out);
}

async function renderStyledStillCanvas(sizePx, previewMode = false) {
  const useRealBg = getUseRealBackground();
  const aspect = Math.max(0.25, state.camera.aspect || 1);
  const dims = typeof sizePx === "object" ? sizePx : (aspect >= 1 ? { width: Math.round(sizePx), height: Math.round(sizePx / aspect) } : { width: Math.round(sizePx * aspect), height: Math.round(sizePx) });
  const transparent = !useRealBg && ($("bg")?.value === "transparent");
  const sourceCanvas = await renderRawStill(dims, { transparent });
  return applyGlobalGrade(sourceCanvas, previewMode);
}

async function renderStyledStillBlob(sizePx, metadata = null) {
  const dims = getViewportFrameDims(sizePx);
  const finalCanvas = await renderStyledStillCanvas(dims, false);
  const blob = await new Promise((resolve, reject) => {
    finalCanvas.toBlob((encoded) => encoded ? resolve(encoded) : reject(new Error("PNG encoding failed.")), "image/png");
  });
  return metadata ? await embedMetadataInPngBlob(blob, metadata) : blob;
}

function flashCapture() {
  $("captureFlash").classList.add("show");
  setTimeout(() => $("captureFlash").classList.remove("show"), 180);
}

async function captureCurrentStill() {
  if (!state.root) return;
  $("captureStill").disabled = true;
  setBadge("Capturing…");
  try {
    const sizePx = Number($("imgSize").value);
    const baseName = (($("fileName").textContent || "capture").split(" (")[0] || "capture").replace(/\.[^/.]+$/, "");
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const fileName = `${baseName}_capture_${sizePx}_${ts}.png`;
    const blob = await renderStyledStillBlob(sizePx, buildImageMetadata({ shotName: "capture", fileName, exportContext: "single_capture" }));
    downloadBlob(blob, fileName);
    flashCapture();
    log("Still captured.");
    setBadge("Ready");
  } catch (e) {
    log(`Capture failed: ${e?.message || e}`);
    setBadge("Capture failed");
  } finally {
    $("captureStill").disabled = !state.root;
  }
}

function buildBaseShotList(count) {
  const fixed = [
    { type: "fixed", name: "front", yaw: 0, pitch: 0.2 },
    { type: "fixed", name: "back", yaw: Math.PI, pitch: 0.2 },
    { type: "fixed", name: "left", yaw: -Math.PI / 2, pitch: 0.2 },
    { type: "fixed", name: "right", yaw: Math.PI / 2, pitch: 0.2 },
    { type: "fixed", name: "top", yaw: 0, pitch: Math.PI / 2 - 0.05 },
    { type: "fixed", name: "bottom", yaw: 0, pitch: -Math.PI / 2 + 0.05 },
  ];
  if (count <= 6) return fixed.slice(0, 6);
  const shots = [...fixed];
  const extras = Math.max(0, count - shots.length);
  const candidatesDeg = [45, 315, 135, 225, 22.5, 337.5, 67.5, 292.5, 112.5, 247.5, 157.5, 202.5];
  let rightIndex = 1, leftIndex = 1;
  for (let i = 0; i < extras && i < candidatesDeg.length; i++) {
    const deg = candidatesDeg[i];
    const isRight = deg > 0 && deg < 180;
    shots.push({ type: "tt", name: `${isRight ? "RightAngle" : "LeftAngle"}_${String(isRight ? rightIndex++ : leftIndex++).padStart(2, "0")}`, yaw: THREE.MathUtils.degToRad(deg), pitch: 0.2 });
  }
  return shots;
}

function setSphericalAround(center, dist, yaw, pitch) {
  const x = Math.cos(pitch) * Math.sin(yaw);
  const y = Math.sin(pitch);
  const z = Math.cos(pitch) * Math.cos(yaw);
  state.camera.position.copy(center.clone().add(new THREE.Vector3(x, y, z).multiplyScalar(dist)));
  state.controls.target.copy(center);
  state.cameraRig.rollDeg = 0;
  applyRoll(state.camera, center, 0);
  state.controls.update();
}

async function exportZip() {
  if (!state.root || !state.stats) return;
  setBadge("Exporting…");
  $("export").disabled = true;

  try {
    state.hdri.useAsBackground = $("hdriUseAsBg").checked;
    const cycleHdris = $("exportCycleHdris").checked && state.hdri.files.length > 0;
    const shotsPerHdri = Math.max(1, Number($("shotsPerHdri").value || 1));
    const count = Number($("count").value);
    const sizePx = Number($("imgSize").value);
    const baseName = (($("fileName").textContent || "product").split(" (")[0] || "product").replace(/\.[^/.]+$/, "");
    const ts = new Date().toISOString().replace(/[:.]/g, "-");

    const restoreView = saveCurrentView();
    const restoreHdri = { url: state.hdri.selectedUrl, useBg: state.hdri.useAsBackground, bg: state.scene.background, env: state.scene.environment };
    const zip = new JSZip();
    const imgFolder = zip.folder("images");

    const baseShots = buildBaseShotList(count);
    const poiShots = state.poi.list.map((p, i) => ({ type: "poi", name: `poi_${String(i).padStart(2, "0")}`, poi: p }));
    const shots = baseShots.concat(poiShots);

    const dist = state.camera.position.distanceTo(state.controls.target.clone());
    const center = state.modelCenter.clone();
    const shotMeta = [];

    for (let i = 0; i < shots.length; i++) {
      const shot = shots[i];

      if (cycleHdris) {
        const hdriIndex = Math.floor(i / shotsPerHdri) % state.hdri.files.length;
        await applyHDRI(state.hdri.files[hdriIndex].url);
      } else if (state.hdri.selectedUrl) {
        await applyHDRI(state.hdri.selectedUrl);
      } else {
        state.scene.environment = null;
        state.scene.background = null;
        applyBackground();
      }

      if (shot.type === "poi") setCameraToSavedView(shot.poi.view);
      else setSphericalAround(center, dist, shot.yaw, shot.pitch);

      if (!state.helix.manual) setHelixLightPose(shots.length === 1 ? 0 : i / Math.max(1, shots.length - 1));
      const fileName = `${shot.name}.png`;
      const imageMetadata = buildImageMetadata({ shotName: shot.name, fileName, exportContext: "zip_export" });
      const blob = await renderStyledStillBlob(sizePx, imageMetadata);
      imgFolder.file(fileName, blob);
      shotMeta.push({
        name: shot.name,
        file: fileName,
        yaw: shot.type === "poi" ? null : shot.yaw,
        pitch: shot.type === "poi" ? null : shot.pitch,
        roll: state.cameraRig.rollDeg,
        metadata: imageMetadata,
      });
      log(`Rendered ${shot.name}.png`);
    }

    zip.file("metadata.json", JSON.stringify({
      version: "v1.6.8",
      createdAt: new Date().toISOString(),
      additionalInformation: getAdditionalMetadataText(),
      export: {
        imageSize: sizePx,
        exportCountSetting: count,
        paddingPercent: Number($("pad").value),
        background: $("bg").value,
        lightingPreset: $("light").value,
        previewBloom: Number($("previewBloom").value),
        colorCorrection: getColorCorrectionConfig(),
        cycleHdris,
        shotsPerHdri,
        colorPipeline: getColorPipelineConfig(),
        shots: shotMeta,
      },
      model: state.stats,
    }, null, 2));

    const outBlob = await zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } });
    downloadBlob(outBlob, `export_${baseName}_${ts}.zip`);

    state.hdri.useAsBackground = restoreHdri.useBg;
    if (restoreHdri.url) await applyHDRI(restoreHdri.url);
    else {
      state.scene.background = restoreHdri.bg;
      state.scene.environment = restoreHdri.env;
      applyBackground();
    }
    setCameraToSavedView(restoreView);
    log("Export complete.");
    setBadge("Ready");
  } catch (e) {
    log(`Export failed: ${e?.message || e}`);
    setBadge("Export failed");
  } finally {
    $("export").disabled = false;
  }
}

async function loadGLBFile(file) {
  if (!file) return;
  clearModel();
  $("fileName").textContent = `${file.name} (${Math.round(file.size / 1024)} KB)`;
  log(`Selected file: ${file.name}`);
  setBadge("Loading…");

  const url = URL.createObjectURL(file);
  try {
    const gltf = await new Promise((resolve, reject) => state.loader.load(url, resolve, undefined, reject));
    const sourceRoot = gltf.scene || gltf.scenes?.[0];
    if (!sourceRoot) throw new Error("No scene found in glTF.");

    const wrapper = new THREE.Group();
    wrapper.name = "Loaded Model";
    sourceRoot.position.set(0, 0, 0);
    sourceRoot.rotation.set(0, 0, 0);
    sourceRoot.scale.set(1, 1, 1);

    const preBox = new THREE.Box3().setFromObject(sourceRoot);
    const preCenter = new THREE.Vector3();
    preBox.getCenter(preCenter);
    sourceRoot.position.set(-preCenter.x, -preBox.min.y, -preCenter.z);
    wrapper.add(sourceRoot);

    wrapper.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
        o.renderOrder = 10;
      }
    });

    state.scene.add(wrapper);
    state.root = wrapper;

    state.stats = computeModelStats(wrapper);
    $("dims").textContent = `${state.stats.dimensionsCM.x.toFixed(1)}cm × ${state.stats.dimensionsCM.y.toFixed(1)}cm × ${state.stats.dimensionsCM.z.toFixed(1)}cm`;
    $("tris").textContent = `${state.stats.triangles.toLocaleString()}`;
    $("mats").textContent = `${state.stats.materials.length}`;

    fitCameraToRoot(wrapper);
    buildObjectList();
    renderPOIList();
    updateFloorButton();
    $("export").disabled = false;
    $("reset").disabled = false;
    updatePreviewButtons();
    updateHelixShadowLight();
    setBadge("Ready");
    log("Model loaded.");
  } catch (e) {
    log(`GLB load failed: ${e?.message || e}`);
    setBadge("Load failed");
  } finally {
    URL.revokeObjectURL(url);
  }
}

function bindRangeNumber(rangeId, numId, onChange) {
  const range = $(rangeId);
  const num = $(numId);
  const apply = (v) => {
    range.value = String(v);
    num.value = String(v);
    onChange(Number(v));
  };
  range.addEventListener("input", () => apply(range.value));
  num.addEventListener("input", () => apply(num.value));
}

function wireCameraControls() {
  $("sensorPreset").innerHTML = Object.entries(SENSOR_PRESETS).map(([key, value]) => `<option value="${key}">${value.label}</option>`).join("");
  $("sensorPreset").value = state.cameraRig.sensorPreset;
  $("sensorPreset").addEventListener("change", () => setSensorPreset($("sensorPreset").value));

  bindRangeNumber("focalLength", "focalLengthNum", (value) => {
    state.cameraRig.focalLength = THREE.MathUtils.clamp(value, 10, 250);
    applyLensSettings();
    syncCameraUIFromView();
  });

  bindRangeNumber("yaw", "yawNum", (value) => {
    const pitch = Number($("pitch").value);
    setOrbitAngles(value, pitch);
  });

  bindRangeNumber("pitch", "pitchNum", (value) => {
    const yaw = Number($("yaw").value);
    setOrbitAngles(yaw, value);
  });

  bindRangeNumber("roll", "rollNum", (value) => {
    state.cameraRig.rollDeg = THREE.MathUtils.clamp(value, -180, 180);
    applyRoll(state.camera, state.controls.target, state.cameraRig.rollDeg);
    copyMainCameraToPreview();
  });

  $("apertureF")?.addEventListener("input", () => {
    state.cameraRig.apertureF = THREE.MathUtils.clamp(Number($("apertureF").value || 8), 0.7, 32);
    state.camera.focus = state.cameraRig.focalDistance;
    if (state.gsplat.sparkRenderer) state.gsplat.sparkRenderer.apertureAngle = Math.max(0, (50 / Math.max(0.7, state.cameraRig.apertureF)) * 0.002);
    copyMainCameraToPreview();
  });
  $("focalDistance")?.addEventListener("input", () => {
    setFocusDistanceMeters($("focalDistance").value || 6);
  });
  $("pickFocusPoint")?.addEventListener("click", () => {
    setFocusPickActive(!state.focusPick.active);
  });
  bindRangeNumber("blurScaleRatio", "blurScaleRatioNum", (value) => {
    state.cameraRig.blurScaleRatio = THREE.MathUtils.clamp(value, 0.1, 5);
    copyMainCameraToPreview();
  });
  $("dofEnabled")?.addEventListener("change", () => {
    state.cameraRig.dofEnabled = !!$("dofEnabled").checked;
    copyMainCameraToPreview();
  });
}

function wireKeyboard() {
  const movement = new Set(["KeyW", "KeyA", "KeyS", "KeyD", "KeyQ", "KeyE", "ShiftLeft", "ShiftRight"]);
  window.addEventListener("keydown", (e) => {
    if (!movement.has(e.code)) return;
    if (!shouldIgnoreKeyboardShortcut()) e.preventDefault();
    state.keyboard.pressed.add(e.code);
  });
  window.addEventListener("keyup", (e) => {
    const wasMovement = movement.has(e.code);
    state.keyboard.pressed.delete(e.code);
    if (wasMovement && !state.keyboard.pressed.size) {
      syncCameraUIFromView();
      copyMainCameraToPreview();
    }
  });
  window.addEventListener("blur", () => state.keyboard.pressed.clear());
}

function wireUI() {
  document.querySelectorAll(".folder").forEach((el) => el.addEventListener("toggle", updateFolderIcons));
  updateFolderIcons();

  wireCameraControls();
  wireKeyboard();
  setTransformMode("translate");

  $("padVal").textContent = $("pad").value;
  $("previewBloomVal").textContent = Number($("previewBloom").value).toFixed(2);
  if ($("focalDistanceVal")) $("focalDistanceVal").textContent = Number($("focalDistance").value).toFixed(1);
  if ($("blurScaleRatioNum")) $("blurScaleRatioNum").value = Number(state.cameraRig.blurScaleRatio).toFixed(2);
  refreshColorModeUI();
  refreshColorCorrectionUI();
  updateFocusPickButton();

  $("file").addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    if (file) loadGLBFile(file);
  });

  $("toggleFloor").addEventListener("click", toggleFloorPlane);

  $("pad").addEventListener("input", () => {
    $("padVal").textContent = $("pad").value;
    if (state.root) fitCameraToRoot(state.root, true);
  });

  $("bg").addEventListener("change", () => {
    applyBackground();
    updatePreviewShell();
    state.preview.dirty = true;
  });
  $("light").addEventListener("change", () => {
    setupLights();
    state.preview.dirty = true;
  });

  $("previewBloom").addEventListener("input", () => {
    state.lighting.bloom = Number($("previewBloom").value);
    $("previewBloomVal").value = state.lighting.bloom.toFixed(2);
    state.preview.dirty = true;
  });
  $("aoEnabled")?.addEventListener("change", () => {
    state.lighting.aoEnabled = !!$("aoEnabled").checked;
    state.preview.dirty = true;
  });

  bindLevelsControl("ccInputBlack", "ccInputBlackVal", "inBlack", Number);
  bindLevelsControl("ccGamma", "ccGammaVal", "gamma", Number);
  bindLevelsControl("ccInputWhite", "ccInputWhiteVal", "inWhite", Number);
  bindLevelsControl("ccOutputBlack", "ccOutputBlackVal", "outBlack", Number);
  bindLevelsControl("ccOutputWhite", "ccOutputWhiteVal", "outWhite", Number);
  $("ccTabLevels")?.addEventListener("click", () => {
    state.colorCorrection.mode = "levels";
    refreshColorCorrectionUI();
    updateColorCorrection();
  });
  $("ccTabCurves")?.addEventListener("click", () => {
    state.colorCorrection.mode = "curves";
    refreshColorCorrectionUI();
    updateColorCorrection();
  });
  $("ccReset")?.addEventListener("click", resetColorCorrection);
  wireCurveEditor();

  $("addLight").addEventListener("click", addLightFromUI);
  $("deleteLight").addEventListener("click", deleteSelectedLight);
  $("updateLightType").addEventListener("click", updateSelectedLightType);
  $("selectedLightIntensity").addEventListener("input", () => { $("selectedLightIntensityVal").value = $("selectedLightIntensity").value; updateSelectedLightSetting("watts", $("selectedLightIntensity").value); });
  $("selectedLightIntensityVal").addEventListener("change", () => { $("selectedLightIntensity").value = $("selectedLightIntensityVal").value; updateSelectedLightSetting("watts", $("selectedLightIntensityVal").value); });
  $("selectedLightColor").addEventListener("input", () => { $("selectedLightColorHex").value = $("selectedLightColor").value.replace("#", "").toUpperCase(); updateSelectedLightSetting("color", $("selectedLightColor").value); });
  $("selectedLightColorHex").addEventListener("change", () => { let v = $("selectedLightColorHex").value.trim().replace(/[^0-9a-f]/gi, ""); if (v.length === 3) v = v.split("").map((c) => c + c).join(""); if (v.length !== 6) v = "FFFFFF"; $("selectedLightColor").value = `#${v}`; $("selectedLightColorHex").value = v.toUpperCase(); updateSelectedLightSetting("color", `#${v}`); });
  $("selectedLightSize").addEventListener("input", () => { $("selectedLightSizeVal").value = $("selectedLightSize").value; updateSelectedLightSetting("size", $("selectedLightSize").value); });
  $("selectedLightSizeVal").addEventListener("change", () => { $("selectedLightSize").value = $("selectedLightSizeVal").value; updateSelectedLightSetting("size", $("selectedLightSizeVal").value); });
  $("selectedLightRadius").addEventListener("input", () => { $("selectedLightRadiusVal").value = $("selectedLightRadius").value; updateSelectedLightSetting("radius", $("selectedLightRadius").value); });
  $("selectedLightRadiusVal").addEventListener("change", () => { $("selectedLightRadius").value = $("selectedLightRadiusVal").value; updateSelectedLightSetting("radius", $("selectedLightRadiusVal").value); });
  $("selectedLightShadows").addEventListener("change", () => updateSelectedLightSetting("shadows", $("selectedLightShadows").checked));

  $("advancedColorMode")?.addEventListener("change", () => {
    const advanced = !!$("advancedColorMode").checked;
    if (advanced) syncBasicColorToAdvanced();
    else syncAdvancedColorToBasic();
    refreshColorModeUI();
    updateDisplayColorPipeline();
  });
  $("colorSpaceBasic")?.addEventListener("change", () => {
    if (!$("advancedColorMode")?.checked) updateDisplayColorPipeline();
  });
  $("inputColorSpace")?.addEventListener("change", () => {
    updateDisplayColorPipeline();
  });
  $("outputColorSpace")?.addEventListener("change", () => {
    updateDisplayColorPipeline();
  });
  $("lutSelect")?.addEventListener("change", () => {
    copyMainCameraToPreview();
  });
  $("addExtraMetadata")?.addEventListener("change", () => {
    const on = !!$("addExtraMetadata").checked;
    if ($("additionalMetadataWrap")) $("additionalMetadataWrap").style.display = on ? "block" : "none";
  });
  $("gsplatOffsetX")?.addEventListener("input", applyGsplatOffsets);
  $("gsplatOffsetY")?.addEventListener("input", applyGsplatOffsets);
  $("gsplatOffsetZ")?.addEventListener("input", applyGsplatOffsets);
  $("gsplatResetOffset")?.addEventListener("click", resetGsplatOffsets);

  $("hdriLoadFolder").addEventListener("click", () => loadHdriFromFolderPicker().catch((e) => log(`HDRI load error: ${e?.message || e}`)));
  $("hdriClear").addEventListener("click", clearHDRIs);
  $("hdriFolderInput").addEventListener("change", (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length) ingestHdriFiles(files);
    e.target.value = "";
  });
  $("hdriSelect").addEventListener("change", () => applyHDRI($("hdriSelect").value).catch((e) => log(`HDRI apply error: ${e?.message || e}`)));
  $("hdriUseAsBg").addEventListener("change", () => {
    state.hdri.useAsBackground = $("hdriUseAsBg").checked;
    if (state.hdri.selectedUrl) {
      applyHDRI(state.hdri.selectedUrl).catch((e) => log(`HDRI background error: ${e?.message || e}`));
    } else {
      applyBackground();
    }
    updatePreviewShell();
  });

  $("objFilter").addEventListener("input", renderObjectList);

  $("poiDone").addEventListener("click", savePOI);
  $("poiCancel").addEventListener("click", () => exitPOIMode(true));

  $("recenter").addEventListener("click", () => {
    if (state.root && !state.poi.active) fitCameraToRoot(state.root, true);
  });

  $("togglePreview").addEventListener("click", () => {
    state.preview.enabled = !state.preview.enabled;
    updatePreviewButtons();
    updatePreviewShell();
  });
  $("captureStill").addEventListener("click", captureCurrentStill);

  $("spaceToggle")?.addEventListener("click", toggleTransformSpace);
  $("mode_translate").addEventListener("click", () => setTransformMode("translate"));
  $("mode_rotate").addEventListener("click", () => setTransformMode("rotate"));
  $("mode_scale").addEventListener("click", () => setTransformMode("scale"));

  $("export").addEventListener("click", exportZip);
  $("reset").addEventListener("click", resetView);

  $("gsplatPreset").addEventListener("change", () => {
    const preset = $("gsplatPreset").value;
    if (preset === "spark-butterfly") $("gsplatUrl").value = SPARK_BUTTERFLY_URL;
    if (preset === "luma-sample") $("gsplatUrl").value = LUMA_SAMPLE_URL;
  });
  document.querySelectorAll("[data-gsplat-tab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("[data-gsplat-tab]").forEach((b) => b.classList.toggle("active", b === btn));
      const mode = btn.dataset.gsplatTab;
      $("gsplatUrlPanel").style.display = mode === "url" ? "block" : "none";
      $("gsplatFilePanel").style.display = mode === "file" ? "block" : "none";
    });
  });
  $("gsplatSelectable").addEventListener("change", () => {
    state.gsplat.selectable = $("gsplatSelectable").checked;
    if (state.gsplat.object?.raycastable !== undefined) state.gsplat.object.raycastable = state.gsplat.selectable;
  });
  $("gsplatUseLighting")?.addEventListener("change", () => {
    state.gsplat.useForLighting = !!$("gsplatUseLighting").checked;
    if (state.gsplat.useForLighting && state.gsplat.envMap && !state.hdri.selectedUrl) state.scene.environment = state.gsplat.envMap;
    if (!state.gsplat.useForLighting && !state.hdri.selectedUrl) state.scene.environment = null;
    state.preview.dirty = true;
  });
  $("gsplatQuality")?.addEventListener("change", () => {
    state.gsplat.quality = $("gsplatQuality").value || "medium";
    if (state.gsplat.object && "lodScale" in state.gsplat.object) state.gsplat.object.lodScale = state.gsplat.quality === "low" ? 0.75 : state.gsplat.quality === "high" ? 1.7 : 1.15;
    state.preview.dirty = true;
  });
  $("loadGsplat").addEventListener("click", async () => {
    const url = $("gsplatUrl").value.trim();
    if (!url) {
      log("Enter a public GSplat URL first.");
      return;
    }
    await loadGsplatFromUrl(url);
  });
  $("gsplatFile").addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (file) await loadGsplatFromFile(file);
    e.target.value = "";
  });
  $("clearGsplat").addEventListener("click", () => clearGsplat());

  syncCameraUIFromView();
  state.lighting.aoEnabled = !!$("aoEnabled")?.checked;
  state.gsplat.useForLighting = !!$("gsplatUseLighting")?.checked;
  state.gsplat.quality = $("gsplatQuality")?.value || "medium";
  if ($("advancedColorPanel")) $("advancedColorPanel").style.display = "none";
  updatePreviewFrameAspect();
  updatePreviewShell();
  updateFloorButton();
  updatePreviewButtons();
  updateBackgroundControlState();
  updateTransformSpaceButton();
  refreshLightUI();
  syncCameraUIFromView();
  log("UI wired.");
}

init3D();
wireUI();
applyBackground();
log("Tip: Scene layer supports URL auto-detect for Spark raw files and Luma capture URLs, plus local Spark-compatible files (.ply, .spz, .splat, .ksplat, .sog, .zip, .rad).");
