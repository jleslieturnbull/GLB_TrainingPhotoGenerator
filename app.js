
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
  floor: { mesh: null, aoMesh: null, aoTexture: null },
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
    dofEnabled: false,
    blurScaleRatio: 1.0,
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

  colorCorrection: {
    levels: { inBlack: 0, gamma: 1, inWhite: 255, outBlack: 0, outWhite: 255 },
    graphDrag: null,
  },

  focusPick: {
    active: false,
  },

  imageLabel: {
    enabled: false,
    editing: false,
    position: { x: 0.5, y: 0.9 },
    scale: 0.065,
    color: "#FFFFFF",
    text: "angle placeholder",
    dragStart: null,
    scaleStart: null,
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

function clampLevelsConfig(cfg) {
  const out = { ...cfg };
  out.inBlack = THREE.MathUtils.clamp(Math.round(Number(out.inBlack ?? 0)), 0, 254);
  out.inWhite = THREE.MathUtils.clamp(Math.round(Number(out.inWhite ?? 255)), out.inBlack + 1, 255);
  out.gamma = THREE.MathUtils.clamp(Number(out.gamma ?? 1), 0.1, 5);
  out.outBlack = THREE.MathUtils.clamp(Math.round(Number(out.outBlack ?? 0)), 0, 254);
  out.outWhite = THREE.MathUtils.clamp(Math.round(Number(out.outWhite ?? 255)), out.outBlack + 1, 255);
  return out;
}

function getLevelsConfig() {
  return clampLevelsConfig({
    inBlack: $("levelsInBlack")?.value ?? state.colorCorrection.levels.inBlack,
    gamma: $("levelsGamma")?.value ?? state.colorCorrection.levels.gamma,
    inWhite: $("levelsInWhite")?.value ?? state.colorCorrection.levels.inWhite,
    outBlack: $("levelsOutBlack")?.value ?? state.colorCorrection.levels.outBlack,
    outWhite: $("levelsOutWhite")?.value ?? state.colorCorrection.levels.outWhite,
  });
}

function syncLevelsUI(cfg = getLevelsConfig()) {
  state.colorCorrection.levels = { ...cfg };
  if ($("levelsInBlack")) $("levelsInBlack").value = String(cfg.inBlack);
  if ($("levelsInBlackVal")) $("levelsInBlackVal").value = String(cfg.inBlack);
  const gammaStr = Number(cfg.gamma).toFixed(2).replace(/\.00$/, '');
  if ($("levelsGamma")) $("levelsGamma").value = gammaStr;
  if ($("levelsGammaVal")) $("levelsGammaVal").value = gammaStr;
  if ($("levelsInWhite")) $("levelsInWhite").value = String(cfg.inWhite);
  if ($("levelsInWhiteVal")) $("levelsInWhiteVal").value = String(cfg.inWhite);
  if ($("levelsOutBlack")) $("levelsOutBlack").value = String(cfg.outBlack);
  if ($("levelsOutBlackVal")) $("levelsOutBlackVal").value = String(cfg.outBlack);
  if ($("levelsOutWhite")) $("levelsOutWhite").value = String(cfg.outWhite);
  if ($("levelsOutWhiteVal")) $("levelsOutWhiteVal").value = String(cfg.outWhite);
  syncLevelsGraphUI(cfg);
}

function setLevelsGraphMarker(id, xNorm, row = 'input', label = '') {
  const el = $(id);
  if (!el) return;
  const clamped = THREE.MathUtils.clamp(xNorm, 0, 1);
  el.style.left = `${(clamped * 100).toFixed(3)}%`;
  if (label) el.textContent = label;
}

function syncLevelsGraphUI(cfg = getLevelsConfig()) {
  const inBlackNorm = cfg.inBlack / 255;
  const inWhiteNorm = cfg.inWhite / 255;
  const outBlackNorm = cfg.outBlack / 255;
  const outWhiteNorm = cfg.outWhite / 255;
  const gammaT = THREE.MathUtils.clamp(Math.pow(0.5, cfg.gamma), 0.01, 0.99);
  const gammaNorm = THREE.MathUtils.lerp(inBlackNorm, inWhiteNorm, gammaT);
  setLevelsGraphMarker('levelsGraphInBlackPin', inBlackNorm);
  setLevelsGraphMarker('levelsGraphGammaPin', gammaNorm);
  setLevelsGraphMarker('levelsGraphInWhitePin', inWhiteNorm);
  setLevelsGraphMarker('levelsGraphOutBlackPin', outBlackNorm);
  setLevelsGraphMarker('levelsGraphOutWhitePin', outWhiteNorm);
  setLevelsGraphMarker('levelsGraphInBlackLabel', inBlackNorm, 'input', `In B ${cfg.inBlack}`);
  setLevelsGraphMarker('levelsGraphGammaLabel', gammaNorm, 'input', `Gamma ${Number(cfg.gamma).toFixed(2)}`);
  setLevelsGraphMarker('levelsGraphInWhiteLabel', inWhiteNorm, 'input', `In W ${cfg.inWhite}`);
  setLevelsGraphMarker('levelsGraphOutBlackLabel', outBlackNorm, 'output', `Out B ${cfg.outBlack}`);
  setLevelsGraphMarker('levelsGraphOutWhiteLabel', outWhiteNorm, 'output', `Out W ${cfg.outWhite}`);
  ['levelsGraphInputBlackLine','levelsGraphGammaLine','levelsGraphInputWhiteLine'].forEach((id, index) => {
    const positions = [inBlackNorm, gammaNorm, inWhiteNorm];
    const el = $(id);
    if (el) el.style.left = `${(positions[index] * 100).toFixed(3)}%`;
  });
  ['levelsGraphOutputBlackLine','levelsGraphOutputWhiteLine'].forEach((id, index) => {
    const positions = [outBlackNorm, outWhiteNorm];
    const el = $(id);
    if (el) el.style.left = `${(positions[index] * 100).toFixed(3)}%`;
  });
}

function updateLevelsFromGraphPointer(clientX, clientY, pinType = state.colorCorrection.graphDrag) {
  const bar = $('levelsGraphBar');
  if (!bar || !pinType) return;
  const rect = bar.getBoundingClientRect();
  const norm = THREE.MathUtils.clamp((clientX - rect.left) / Math.max(1, rect.width), 0, 1);
  const cfg = getLevelsConfig();
  if (pinType === 'inBlack') cfg.inBlack = Math.round(norm * 255);
  else if (pinType === 'inWhite') cfg.inWhite = Math.round(norm * 255);
  else if (pinType === 'outBlack') cfg.outBlack = Math.round(norm * 255);
  else if (pinType === 'outWhite') cfg.outWhite = Math.round(norm * 255);
  else if (pinType === 'gamma') {
    const blackNorm = cfg.inBlack / 255;
    const whiteNorm = cfg.inWhite / 255;
    const usable = Math.max(0.01, whiteNorm - blackNorm);
    const localT = THREE.MathUtils.clamp((norm - blackNorm) / usable, 0.01, 0.99);
    cfg.gamma = THREE.MathUtils.clamp(Math.log(localT) / Math.log(0.5), 0.1, 5);
  }
  const clamped = clampLevelsConfig(cfg);
  syncLevelsUI(clamped);
  updateDisplayColorPipeline();
  copyMainCameraToPreview();
}

function onLevelsGraphPointerDown(e) {
  const bar = $('levelsGraphBar');
  if (!bar) return;
  const handle = e.target.closest?.('[data-level-pin]');
  const rect = bar.getBoundingClientRect();
  const xNorm = THREE.MathUtils.clamp((e.clientX - rect.left) / Math.max(1, rect.width), 0, 1);
  const yNorm = THREE.MathUtils.clamp((e.clientY - rect.top) / Math.max(1, rect.height), 0, 1);
  if (handle?.dataset?.levelPin) {
    state.colorCorrection.graphDrag = handle.dataset.levelPin;
  } else {
    const cfg = getLevelsConfig();
    const blackNorm = cfg.inBlack / 255;
    const whiteNorm = cfg.inWhite / 255;
    const gammaNorm = THREE.MathUtils.lerp(blackNorm, whiteNorm, THREE.MathUtils.clamp(Math.pow(0.5, cfg.gamma), 0.01, 0.99));
    const candidates = yNorm < 0.5
      ? [['outBlack', cfg.outBlack / 255], ['outWhite', cfg.outWhite / 255]]
      : [['inBlack', blackNorm], ['gamma', gammaNorm], ['inWhite', whiteNorm]];
    candidates.sort((a, b) => Math.abs(a[1] - xNorm) - Math.abs(b[1] - xNorm));
    state.colorCorrection.graphDrag = candidates[0]?.[0] || null;
  }
  if (!state.colorCorrection.graphDrag) return;
  bar.setPointerCapture?.(e.pointerId);
  updateLevelsFromGraphPointer(e.clientX, e.clientY, state.colorCorrection.graphDrag);
  e.preventDefault();
}

function onLevelsGraphPointerMove(e) {
  if (!state.colorCorrection.graphDrag) return;
  updateLevelsFromGraphPointer(e.clientX, e.clientY, state.colorCorrection.graphDrag);
}

function onLevelsGraphPointerUp(e) {
  const bar = $('levelsGraphBar');
  if (bar && state.colorCorrection.graphDrag) bar.releasePointerCapture?.(e.pointerId);
  state.colorCorrection.graphDrag = null;
}

function levelsAreDefault(cfg = getLevelsConfig()) {
  return cfg.inBlack === 0 && cfg.gamma === 1 && cfg.inWhite === 255 && cfg.outBlack === 0 && cfg.outWhite === 255;
}

function buildLevelsCssFilter(cfg = getLevelsConfig()) {
  if (levelsAreDefault(cfg)) return 'none';
  const inputRange = Math.max(1, cfg.inWhite - cfg.inBlack);
  const outputRange = Math.max(1, cfg.outWhite - cfg.outBlack);
  const contrast = THREE.MathUtils.clamp((outputRange / inputRange) * 100, 20, 300);
  const lift = THREE.MathUtils.clamp(100 + ((cfg.outBlack - cfg.inBlack) / 255) * 110, 20, 220);
  const gammaBoost = THREE.MathUtils.clamp(Math.pow(1 / cfg.gamma, 0.4) * 100, 35, 220);
  return `contrast(${contrast.toFixed(2)}%) brightness(${((lift * gammaBoost) / 100).toFixed(2)}%)`;
}

function applyLevelsToCanvas(canvas) {
  const cfg = getLevelsConfig();
  if (!canvas || levelsAreDefault(cfg)) return canvas;
  const out = document.createElement('canvas');
  out.width = canvas.width;
  out.height = canvas.height;
  const ctx = make2DContext(out);
  const src = make2DContext(canvas);
  if (!ctx || !src) return canvas;
  const img = src.getImageData(0, 0, canvas.width, canvas.height);
  const data = img.data;
  const inputRange = Math.max(1, cfg.inWhite - cfg.inBlack);
  const outputRange = Math.max(1, cfg.outWhite - cfg.outBlack);
  const lut = new Uint8ClampedArray(256);
  for (let i = 0; i < 256; i++) {
    let n = (i - cfg.inBlack) / inputRange;
    n = THREE.MathUtils.clamp(n, 0, 1);
    n = Math.pow(n, 1 / cfg.gamma);
    lut[i] = THREE.MathUtils.clamp(Math.round(cfg.outBlack + n * outputRange), 0, 255);
  }
  for (let i = 0; i < data.length; i += 4) {
    data[i] = lut[data[i]];
    data[i + 1] = lut[data[i + 1]];
    data[i + 2] = lut[data[i + 2]];
  }
  ctx.putImageData(img, 0, 0);
  return out;
}

function getRendererDisplayFilter() {
  const cfg = getColorPipelineConfig();
  const filters = [];
  if (cfg.advanced) {
    const inputFilter = getRendererColorProfile(cfg.input || 'srgb').cssFilter;
    if (inputFilter && inputFilter !== 'none') filters.push(inputFilter);
  }
  const outputFilter = getRendererColorProfile(getActiveDisplayColorSpace()).cssFilter;
  if (outputFilter && outputFilter !== 'none') filters.push(outputFilter);
  const levelsFilter = buildLevelsCssFilter();
  if (levelsFilter && levelsFilter !== 'none') filters.push(levelsFilter);
  return filters.length ? filters.join(' ') : 'none';
}

function updateDisplayColorPipeline() {
  if (!state.renderer) return;
  const profile = getRendererColorProfile(getActiveDisplayColorSpace());
  state.renderer.outputColorSpace = profile.outputColorSpace;
  state.renderer.toneMapping = profile.toneMapping;
  state.renderer.toneMappingExposure = profile.exposure;
  if (state.renderer.domElement) state.renderer.domElement.style.filter = getRendererDisplayFilter();
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
  if (cfg.advanced) out = cloneCanvasWithFilter(out, getRendererColorProfile(cfg.input || 'srgb').canvasFilter);
  out = cloneCanvasWithFilter(out, getRendererColorProfile(getActiveDisplayColorSpace()).canvasFilter);
  out = applyLUTToCanvas(out, cfg.advanced ? cfg.lut : 'standard');
  out = applyLevelsToCanvas(out);
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
  if (useHdriBg) {
    hint.textContent = "HDRI backdrop";
    surface.style.background = "rgba(8, 10, 14, 0.42)";
    return;
  }

  hint.textContent = "Local polish only";
  surface.style.background = "linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0.02))";
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


function updateFocusPickButton() {
  const btn = $("focusPickBtn");
  if (!btn) return;
  btn.classList.toggle('active', !!state.focusPick.active);
  btn.textContent = state.focusPick.active ? '×' : '+';
  btn.title = state.focusPick.active ? 'Cancel focus picking' : 'Click a point on the model to set perfect focus distance';
}

function setFocusDistanceFromWorldPoint(point) {
  if (!point || !state.camera) return;
  state.cameraRig.focusWorldPoint = point.clone();
  state.cameraRig.focalDistance = THREE.MathUtils.clamp(state.camera.position.distanceTo(point), 0.2, 50);
  state.camera.focus = state.cameraRig.focalDistance;
  if ($("focalDistance")) $("focalDistance").value = state.cameraRig.focalDistance.toFixed(1);
  if ($("focalDistanceVal")) $("focalDistanceVal").textContent = state.cameraRig.focalDistance.toFixed(1);
  if (state.gsplat.sparkRenderer) state.gsplat.sparkRenderer.focalDistance = state.cameraRig.focalDistance;
  copyMainCameraToPreview();
}

function toggleFocusPickMode(force = null) {
  state.focusPick.active = force == null ? !state.focusPick.active : !!force;
  updateFocusPickButton();
  if (state.renderer?.domElement) state.renderer.domElement.style.cursor = state.focusPick.active ? 'crosshair' : '';
}

function collectModelPickTargets() {
  const list = [];
  if (state.root) {
    state.root.traverse((o) => {
      if (o.isMesh && o.visible) list.push(o);
    });
  }
  return list;
}

function pickFocusPoint(clientX, clientY) {
  if (!state.root) return false;
  const rect = state.renderer.domElement.getBoundingClientRect();
  state.pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  state.pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
  state.raycaster.setFromCamera(state.pointer, state.camera);
  const hits = state.raycaster.intersectObjects(collectModelPickTargets(), true);
  if (!hits.length) {
    log('Focus pick missed the model.');
    toggleFocusPickMode(false);
    return false;
  }
  setFocusDistanceFromWorldPoint(hits[0].point);
  toggleFocusPickMode(false);
  log(`Focus distance set to ${state.cameraRig.focalDistance.toFixed(2)} m.`);
  return true;
}

function updateImageLabelGhost() {
  const ghost = $("imageLabelGhost");
  if (!ghost) return;
  const label = state.imageLabel;
  ghost.textContent = label.text || 'angle placeholder';
  ghost.style.left = `${label.position.x * 100}%`;
  ghost.style.top = `${label.position.y * 100}%`;
  ghost.style.color = label.color || '#FFFFFF';
  const view = $("view")?.getBoundingClientRect?.();
  const fontPx = Math.max(14, Math.round((view?.height || 800) * label.scale));
  ghost.style.fontSize = `${fontPx}px`;
}

function setImageLabelEnabled(enabled) {
  state.imageLabel.enabled = !!enabled;
  if ($("enableImageLabelling")) $("enableImageLabelling").checked = !!enabled;
  state.preview.dirty = true;
}

function showImageLabelEditor(show) {
  const overlay = $("imageLabelOverlay");
  const ghost = $("imageLabelGhost");
  if (overlay) overlay.style.display = show ? 'block' : 'none';
  if (ghost) ghost.style.display = show ? 'block' : 'none';
  updateImageLabelGhost();
}

function beginImageLabelMode() {
  state.imageLabel.editing = true;
  state.imageLabel.dragStart = null;
  state.imageLabel.scaleStart = null;
  if ($("imageLabelColor")) $("imageLabelColor").value = state.imageLabel.color || '#FFFFFF';
  showImageLabelEditor(true);
  if (state.renderer?.domElement) state.renderer.domElement.style.cursor = 'default';
}

function finishImageLabelMode(commit = true) {
  state.imageLabel.editing = false;
  state.imageLabel.dragStart = null;
  state.imageLabel.scaleStart = null;
  showImageLabelEditor(false);
  setImageLabelEnabled(commit);
}

function startImageLabelWorkflow() {
  beginImageLabelMode();
}

function updateImageLabelPositionFromPointer(clientX, clientY) {
  const rect = $("view")?.getBoundingClientRect?.();
  if (!rect) return;
  state.imageLabel.position.x = THREE.MathUtils.clamp((clientX - rect.left) / Math.max(1, rect.width), 0.02, 0.98);
  state.imageLabel.position.y = THREE.MathUtils.clamp((clientY - rect.top) / Math.max(1, rect.height), 0.02, 0.98);
  updateImageLabelGhost();
  state.preview.dirty = true;
}

function applyImageLabelToCanvas(sourceCanvas, labelText = 'capture') {
  if (!state.imageLabel.enabled || !sourceCanvas) return sourceCanvas;
  const out = document.createElement('canvas');
  out.width = sourceCanvas.width;
  out.height = sourceCanvas.height;
  const ctx = make2DContext(out);
  if (!ctx) return sourceCanvas;
  ctx.drawImage(sourceCanvas, 0, 0);
  const text = `${labelText || 'capture'}`;
  const fontPx = Math.max(16, Math.round(sourceCanvas.height * THREE.MathUtils.clamp(state.imageLabel.scale || 0.065, 0.02, 0.25)));
  const x = sourceCanvas.width * THREE.MathUtils.clamp(state.imageLabel.position.x || 0.5, 0, 1);
  const y = sourceCanvas.height * THREE.MathUtils.clamp(state.imageLabel.position.y || 0.9, 0, 1);
  ctx.save();
  ctx.font = `700 ${fontPx}px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(2, fontPx * 0.08);
  ctx.strokeStyle = 'rgba(0,0,0,0.45)';
  ctx.shadowColor = 'rgba(0,0,0,0.35)';
  ctx.shadowBlur = Math.max(4, fontPx * 0.12);
  ctx.strokeText(text, x, y);
  ctx.fillStyle = state.imageLabel.color || '#FFFFFF';
  ctx.fillText(text, x, y);
  ctx.restore();
  return out;
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
    if (o.userData && o.userData.appLight && o !== state.helix.light) toRemove.push(o);
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
    const frame = await renderStyledStillCanvas(viewportDims, true, state.imageLabel.enabled ? (state.imageLabel.text || 'angle placeholder') : 'preview');
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
  state.lights.rigs.forEach((rig) => {
    if (rig.helper) overlays.push(rig.helper);
  });
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
    if (state.selection.type === "model" || state.selection.type === "floor") {
      updateAmbientOcclusionOverlay();
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

  const bootstrapDirectional = new THREE.DirectionalLight(0xffffff, 0);
  bootstrapDirectional.name = 'Bootstrap Directional';
  bootstrapDirectional.position.set(4, 6, 3);
  bootstrapDirectional.castShadow = true;
  bootstrapDirectional.shadow.mapSize.set(1024, 1024);
  bootstrapDirectional.shadow.bias = -0.0002;
  bootstrapDirectional.shadow.normalBias = 0.02;
  bootstrapDirectional.userData.bootstrapHidden = true;
  scene.add(bootstrapDirectional);
  state.bootstrapDirectionalRig = bootstrapDirectional;

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
    updateImageLabelGhost();
  };
  window.addEventListener("resize", onResize);
  onResize();

  renderer.domElement.addEventListener("pointerdown", onViewportPointerDown);
  renderer.domElement.addEventListener("pointerup", onViewportPointerUp);
  window.addEventListener("pointermove", onViewportPointerMove);
  window.addEventListener("pointerup", onViewportPointerUp);
  $("imageLabelGhost")?.addEventListener("pointerdown", onViewportPointerDown);
  $("imageLabelScaleHandle")?.addEventListener("pointerdown", onViewportPointerDown);

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
  if (!state.root) {
    updateAmbientOcclusionOverlay();
    return;
  }
  const box = new THREE.Box3().setFromObject(state.root);
  const sphere = new THREE.Sphere();
  box.getBoundingSphere(sphere);
  state.modelCenter.copy(sphere.center);
  state.modelRadius = Math.max(0.01, sphere.radius);
  if (!state.helix.manual) setHelixLightPose(0);
  updateAmbientOcclusionOverlay();
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
  clearSelection();
  updateAmbientOcclusionOverlay();
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
  updateAmbientOcclusionOverlay();

  log("View recentered.");
}

function resetView() {
  if (!state.root || !state.baseView) return;
  setCameraToSavedView(state.baseView);
  if (!state.helix.manual) setHelixLightPose(0);
  updateHelixShadowLight();
  updateAmbientOcclusionOverlay();
  log("View reset.");
}

function onViewportPointerDown(e) {
  const ghost = $("imageLabelGhost");
  const scaleHandle = $("imageLabelScaleHandle");
  const target = e.target;
  const onScaleHandle = !!(state.imageLabel.editing && scaleHandle && (target === scaleHandle || scaleHandle.contains?.(target)));
  const onGhost = !!(state.imageLabel.editing && ghost && (target === ghost || ghost.contains?.(target)));

  if (onScaleHandle) {
    const rect = $("view")?.getBoundingClientRect?.();
    if (rect) {
      const centerX = rect.left + rect.width * THREE.MathUtils.clamp(state.imageLabel.position.x || 0.5, 0, 1);
      const centerY = rect.top + rect.height * THREE.MathUtils.clamp(state.imageLabel.position.y || 0.9, 0, 1);
      state.imageLabel.scaleStart = {
        centerX,
        centerY,
        startDist: Math.max(12, Math.hypot(e.clientX - centerX, e.clientY - centerY)),
        startScale: state.imageLabel.scale || 0.065,
      };
    }
    state.selection.pointerDown = { x: e.clientX, y: e.clientY, kind: "imageLabelScale" };
    e.preventDefault();
    return;
  }

  if (onGhost) {
    state.imageLabel.dragStart = {
      x: e.clientX,
      y: e.clientY,
      positionX: state.imageLabel.position.x,
      positionY: state.imageLabel.position.y,
    };
    state.selection.pointerDown = { x: e.clientX, y: e.clientY, kind: "imageLabelDrag" };
    e.preventDefault();
    return;
  }

  state.selection.pointerDown = { x: e.clientX, y: e.clientY, kind: "viewport" };
}

function onViewportPointerMove(e) {
  if (state.imageLabel.editing && state.imageLabel.dragStart) {
    const rect = $("view")?.getBoundingClientRect?.();
    if (!rect) return;
    const dx = (e.clientX - state.imageLabel.dragStart.x) / Math.max(1, rect.width);
    const dy = (e.clientY - state.imageLabel.dragStart.y) / Math.max(1, rect.height);
    state.imageLabel.position.x = THREE.MathUtils.clamp(state.imageLabel.dragStart.positionX + dx, 0.02, 0.98);
    state.imageLabel.position.y = THREE.MathUtils.clamp(state.imageLabel.dragStart.positionY + dy, 0.02, 0.98);
    updateImageLabelGhost();
    state.preview.dirty = true;
    return;
  }

  if (state.imageLabel.editing && state.imageLabel.scaleStart) {
    const start = state.imageLabel.scaleStart;
    const dist = Math.max(12, Math.hypot(e.clientX - start.centerX, e.clientY - start.centerY));
    const ratio = dist / Math.max(12, start.startDist);
    state.imageLabel.scale = THREE.MathUtils.clamp(start.startScale * ratio, 0.02, 0.25);
    updateImageLabelGhost();
    state.preview.dirty = true;
    return;
  }
}

function onViewportPointerUp(e) {
  const wasImageLabelDrag = !!state.imageLabel.dragStart;
  const wasImageLabelScale = !!state.imageLabel.scaleStart;
  state.imageLabel.dragStart = null;
  state.imageLabel.scaleStart = null;

  if (wasImageLabelDrag || wasImageLabelScale) {
    state.selection.pointerDown = null;
    return;
  }

  if (state.transformControls.dragging || state.selection.interactingTransform) {
    state.selection.pointerDown = null;
    return;
  }
  const p = state.selection.pointerDown;
  state.selection.pointerDown = null;
  if (!p || p.kind !== "viewport") return;
  const dx = e.clientX - p.x;
  const dy = e.clientY - p.y;
  if (Math.hypot(dx, dy) > 4) return;
  if (state.focusPick.active) {
    pickFocusPoint(e.clientX, e.clientY);
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
  group.visible = true;
  group.userData.isLightFixture = true;
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

function buildLightRig(type, existing = null) {
  const rig = existing || { id: `light_${state.lights.nextId++}` };
  rig.type = type;
  rig.name = `${type[0].toUpperCase()}${type.slice(1)} Light`;
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
  group.userData.sceneLight = true;
  group.userData.lightRigId = rig.id;
  const clr = new THREE.Color(color);
  let light = null;
  if (type === 'directional') {
    light = new THREE.DirectionalLight(clr, lightWattsToIntensity(type, watts));
    const target = new THREE.Object3D(); target.position.set(0, -1, 0); group.add(target); light.target = target;
    light.castShadow = shadows; light.shadow.mapSize.set(2048,2048); light.shadow.camera.near = 0.1; light.shadow.camera.far = 100;
  } else if (type === 'spot') {
    light = new THREE.SpotLight(clr, lightWattsToIntensity(type, watts), radius || 0, Math.PI/6, 0.25, 2);
    const target = new THREE.Object3D(); target.position.set(0, -1, 0); group.add(target); light.target = target; light.castShadow = shadows;
  } else if (type === 'point') {
    light = new THREE.PointLight(clr, lightWattsToIntensity(type, watts), radius || 0, 2); light.castShadow = shadows;
  } else if (type === 'rectarea' || type === 'helix') {
    light = new THREE.RectAreaLight(clr, lightWattsToIntensity(type, watts), Math.max(0.1,size), Math.max(0.1,size));
  } else if (type === 'hemisphere') {
    light = new THREE.HemisphereLight(clr, 0x202020, lightWattsToIntensity(type, watts));
  }
  light.userData.appLight = true;
  light.position.set(0,0,0);
  group.add(light);
  const helper = createGenericLightHelper(type, clr);
  helper.visible = true;
  group.add(helper);
  rig.group = group; rig.light = light; rig.helper = helper; rig.watts = watts; rig.color = `#${clr.getHexString().toUpperCase()}`; rig.size = size; rig.radius = radius; rig.shadows = shadows;
  state.scene.add(group);
  syncLightRigProperties(rig);
  return rig;
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
  }
  if (rig.helper) {
    rig.helper.traverse((o) => { if (o.material?.color) o.material.color.copy(clr); });
    if (type === 'rectarea') rig.helper.scale.setScalar(Math.max(0.5, rig.size || 1));
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
  if (tip) tip.textContent = rig ? `Selected ${rig.name}` : 'Add a light to begin, then select it from the object list to edit it.';
  $("lightSettingsEmpty").style.display = rig ? 'none' : 'block';
  $("lightSettingsPanel").style.display = rig ? 'block' : 'none';
  if ($("lightSizeRow")) $("lightSizeRow").style.display = rig && ['spot', 'rectarea', 'helix'].includes(rig.type) ? 'grid' : 'none';
  if (!rig) return;
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
  if (which === 'size' && ['spot', 'rectarea', 'helix'].includes(rig.type)) rig.size = Number(value);
  if (which === 'radius') rig.radius = Number(value);
  if (which === 'shadows') rig.shadows = !!value;
  syncLightRigProperties(rig);
  refreshLightUI();
}

function makeAmbientOcclusionTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const ctx = make2DContext(canvas);
  if (!ctx) return null;
  const g = ctx.createRadialGradient(256, 256, 24, 256, 256, 256);
  g.addColorStop(0.0, 'rgba(0,0,0,0.72)');
  g.addColorStop(0.28, 'rgba(0,0,0,0.34)');
  g.addColorStop(0.58, 'rgba(0,0,0,0.12)');
  g.addColorStop(1.0, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 512, 512);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function ensureAmbientOcclusionMesh() {
  if (state.floor.aoMesh) return state.floor.aoMesh;
  state.floor.aoTexture = state.floor.aoTexture || makeAmbientOcclusionTexture();
  const geo = new THREE.PlaneGeometry(1, 1, 1, 1);
  const mat = new THREE.MeshBasicMaterial({
    map: state.floor.aoTexture || null,
    transparent: true,
    opacity: 0.34,
    depthWrite: false,
    toneMapped: false,
    side: THREE.DoubleSide,
  });
  mat.polygonOffset = true;
  mat.polygonOffsetFactor = -2;
  mat.polygonOffsetUnits = -2;
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'Ambient Occlusion Overlay';
  mesh.rotation.x = -Math.PI / 2;
  mesh.visible = false;
  mesh.renderOrder = 4;
  state.floor.aoMesh = mesh;
  state.scene?.add(mesh);
  return mesh;
}

function updateAmbientOcclusionOverlay() {
  const mesh = ensureAmbientOcclusionMesh();
  if (!mesh) return;
  const enabled = !!state.lighting.aoEnabled && !!state.floor.mesh && !!state.root && state.floor.mesh.visible && state.root.visible;
  if (!enabled) {
    mesh.visible = false;
    return;
  }
  const size = TMP.v1.set(0, 0, 0);
  new THREE.Box3().setFromObject(state.root).getSize(size);
  const width = Math.max(0.5, size.x * 1.18, state.modelRadius * 1.65);
  const depth = Math.max(0.5, size.z * 1.18, state.modelRadius * 1.65);
  mesh.position.set(state.modelCenter.x, state.floor.mesh.position.y + 0.006, state.modelCenter.z);
  mesh.scale.set(width, depth, 1);
  mesh.material.opacity = THREE.MathUtils.clamp(0.22 + state.modelRadius * 0.03, 0.22, 0.42);
  mesh.visible = state.floor.mesh.visible;
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
    if (state.floor.aoMesh) { state.floor.aoMesh.visible = false; }
    buildObjectList();
    updateFloorButton();
    updateHelixShadowLight();
    updateAmbientOcclusionOverlay();
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
  updateAmbientOcclusionOverlay();
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
  if (state.gsplat.object) state.objects.unshift({ id: "gsplat", name: "GSplat Scene", path: "GSplat Scene", obj: state.gsplat.object, special: true });
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
      if (item.id === 'floor' || item.id === 'model_root') updateAmbientOcclusionOverlay();
      state.preview.dirty = true;
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
      colorCorrection: getLevelsConfig(),
      lightingPreset: $("light")?.value || "studio",
      previewBloom: Number($("previewBloom")?.value || 0),
      aoEnabled: !!$("aoEnabled")?.checked,
      colorPipeline: getColorPipelineConfig(),
      imageLabelling: {
        enabled: !!state.imageLabel.enabled,
        position: { ...state.imageLabel.position },
        scale: state.imageLabel.scale,
        color: state.imageLabel.color,
        text: state.imageLabel.text,
      },
    },
  };
}

function buildImageMetadata({ shotName = "capture", fileName = "capture.png", exportContext = "single_capture" } = {}) {
  const extra = getAdditionalMetadataText();
  return {
    app: "GLB Screenshot Exporter",
    version: "v1.7.0",
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
  const softwareChunk = buildPngITXtChunk("Software", "GLB Screenshot Exporter v1.7.0");
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
  const focusPoint = state.cameraRig.focusWorldPoint?.clone?.() || state.controls?.target?.clone?.() || state.modelCenter.clone();
  const ndc = focusPoint.project(cam);
  return {
    x: (ndc.x * 0.5 + 0.5) * canvas.width,
    y: (-ndc.y * 0.5 + 0.5) * canvas.height,
    dist: cam.position.distanceTo(focusPoint),
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
  const apertureFactor = THREE.MathUtils.clamp(Math.pow(2.0 / aperture, 1.35), 0.02, 6.5);
  const focusError = Math.abs(focus.dist - focusDist) / Math.max(0.25, focus.dist, focusDist);
  const blurEnergy = (6.2 * apertureFactor * focalFactor * sensorFactor) + (focusError * 19 * apertureFactor * focalFactor * sensorFactor);
  const baseBlur = THREE.MathUtils.clamp(blurEnergy * (previewMode ? 0.55 : 0.9), 0, previewMode ? 12 : 24);
  if (baseBlur < 0.35 || (aperture >= 12 && focusError < 0.025)) return sourceCanvas;

  const out = document.createElement("canvas");
  out.width = w; out.height = h;
  const ctx = make2DContext(out);
  if (!ctx) return sourceCanvas;

  const blurred = document.createElement("canvas");
  blurred.width = w; blurred.height = h;
  const bctx = make2DContext(blurred);
  if (!bctx) return sourceCanvas;

  const sizeBoost = blurScaleRatio < 1 ? Math.pow(1 / blurScaleRatio, 0.34) : 1;
  const stretchX = blurScaleRatio > 1 ? blurScaleRatio : 1;
  const stretchY = blurScaleRatio > 1 ? (1 / Math.sqrt(blurScaleRatio)) : 1;
  const blurPx = THREE.MathUtils.clamp(baseBlur * sizeBoost, 0, previewMode ? 14 : 28);
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

  const focusRadiusBase = Math.min(w, h) * 0.18;
  const focusRadiusX = THREE.MathUtils.clamp(focusRadiusBase / Math.max(0.14, apertureFactor * focalFactor * sensorFactor * 0.82), Math.min(w, h) * 0.06, Math.min(w, h) * 0.52);
  const focusRatioY = blurScaleRatio > 1 ? 0.72 / Math.sqrt(blurScaleRatio) : (0.88 + Math.min(0.22, (1 / blurScaleRatio - 1) * 0.06));
  const focusRadiusY = focusRadiusX * focusRatioY;
  const feather = Math.max(18, focusRadiusX * 1.2);

  sctx.save();
  sctx.globalCompositeOperation = 'destination-in';
  sctx.translate(focus.x, focus.y);
  sctx.scale(1, focusRadiusY / Math.max(1, focusRadiusX));
  const g = sctx.createRadialGradient(0, 0, 0, 0, 0, focusRadiusX + feather);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.58, 'rgba(255,255,255,0.995)');
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
  return applyColorPipeline(out);
}

async function renderStyledStillCanvas(sizePx, previewMode = false, shotName = 'capture') {
  const useRealBg = getUseRealBackground();
  const aspect = Math.max(0.25, state.camera.aspect || 1);
  const dims = typeof sizePx === "object" ? sizePx : (aspect >= 1 ? { width: Math.round(sizePx), height: Math.round(sizePx / aspect) } : { width: Math.round(sizePx * aspect), height: Math.round(sizePx) });
  const sourceCanvas = await renderRawStill(dims, { transparent: !useRealBg && getBackgroundConfig().alpha === 0 });
  const graded = applyGlobalGrade(sourceCanvas, previewMode);
  return applyImageLabelToCanvas(graded, shotName);
}

async function renderStyledStillBlob(sizePx, metadata = null, shotName = 'capture') {
  const dims = getViewportFrameDims(sizePx);
  const finalCanvas = await renderStyledStillCanvas(dims, false, shotName);
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
    const blob = await renderStyledStillBlob(sizePx, buildImageMetadata({ shotName: "capture", fileName, exportContext: "single_capture" }), "capture");
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
      const blob = await renderStyledStillBlob(sizePx, imageMetadata, shot.name);
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
      version: "v1.7.0",
      createdAt: new Date().toISOString(),
      additionalInformation: getAdditionalMetadataText(),
      export: {
        imageSize: sizePx,
        exportCountSetting: count,
        paddingPercent: Number($("pad").value),
        background: $("bg").value,
        lightingPreset: $("light").value,
        previewBloom: Number($("previewBloom").value),
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
    updateImageLabelGhost();
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
    state.cameraRig.focalDistance = THREE.MathUtils.clamp(Number($("focalDistance").value || 6), 0.2, 50);
    if ($("focalDistanceVal")) $("focalDistanceVal").textContent = state.cameraRig.focalDistance.toFixed(1);
    state.camera.focus = state.cameraRig.focalDistance;
    if (state.gsplat.sparkRenderer) state.gsplat.sparkRenderer.focalDistance = state.cameraRig.focalDistance;
    copyMainCameraToPreview();
  });
  $("focusPickBtn")?.addEventListener("click", () => toggleFocusPickMode());
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
  $("previewBloomVal").value = Number($("previewBloom").value).toFixed(2);
  if ($("focalDistanceVal")) $("focalDistanceVal").textContent = Number($("focalDistance").value).toFixed(1);
  if ($("blurScaleRatioNum")) $("blurScaleRatioNum").value = Number(state.cameraRig.blurScaleRatio).toFixed(2);
  refreshColorModeUI();
  syncLevelsUI();
  updateFocusPickButton();
  updateImageLabelGhost();
  showImageLabelEditor(false);

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
    updateAmbientOcclusionOverlay();
    state.preview.dirty = true;
  });

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
  syncLevelsUI();
  updateFocusPickButton();
  updateImageLabelGhost();
  showImageLabelEditor(false);
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
    state.preview.dirty = true;
  });
  const handleLevelsChange = () => {
    syncLevelsUI(getLevelsConfig());
    updateDisplayColorPipeline();
    copyMainCameraToPreview();
  };
  [["levelsInBlack","levelsInBlackVal"],["levelsGamma","levelsGammaVal"],["levelsInWhite","levelsInWhiteVal"],["levelsOutBlack","levelsOutBlackVal"],["levelsOutWhite","levelsOutWhiteVal"]].forEach(([rangeId, numId]) => {
    $(rangeId)?.addEventListener("input", () => { if ($(numId)) $(numId).value = $(rangeId).value; handleLevelsChange(); });
    $(rangeId)?.addEventListener("change", () => { if ($(numId)) $(numId).value = $(rangeId).value; handleLevelsChange(); });
    $(numId)?.addEventListener("input", () => { if ($(rangeId)) $(rangeId).value = $(numId).value; handleLevelsChange(); });
    $(numId)?.addEventListener("change", () => { if ($(rangeId)) $(rangeId).value = $(numId).value; handleLevelsChange(); });
  });
  $("resetLevels")?.addEventListener("click", () => {
    syncLevelsUI(clampLevelsConfig({ inBlack: 0, gamma: 1, inWhite: 255, outBlack: 0, outWhite: 255 }));
    updateDisplayColorPipeline();
    copyMainCameraToPreview();
  });
  $("levelsGraphBar")?.addEventListener("pointerdown", onLevelsGraphPointerDown);
  $("levelsGraphBar")?.addEventListener("pointermove", onLevelsGraphPointerMove);
  $("levelsGraphBar")?.addEventListener("pointerup", onLevelsGraphPointerUp);
  $("levelsGraphBar")?.addEventListener("pointercancel", onLevelsGraphPointerUp);


  $("addExtraMetadata")?.addEventListener("change", () => {
    const on = !!$("addExtraMetadata").checked;
    if ($("additionalMetadataWrap")) $("additionalMetadataWrap").style.display = on ? "block" : "none";
  });
  $("enableImageLabelling")?.addEventListener("change", () => {
    const on = !!$("enableImageLabelling").checked;
    if (on) startImageLabelWorkflow();
    else finishImageLabelMode(false);
  });
  $("imageLabelColor")?.addEventListener("input", () => {
    state.imageLabel.color = $("imageLabelColor").value || '#FFFFFF';
    updateImageLabelGhost();
    state.preview.dirty = true;
  });
  $("imageLabelDone")?.addEventListener("click", () => finishImageLabelMode(true));
  $("imageLabelCancel")?.addEventListener("click", () => finishImageLabelMode(false));
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
  updateAmbientOcclusionOverlay();
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
