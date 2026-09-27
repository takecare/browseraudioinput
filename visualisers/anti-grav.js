import { Visualiser, bandLevel, logBands } from './base.js';

// A futuristic anti-gravity racer streaking through deep space. The ship is a
// small 3D mesh seen from a chase camera, drawn as dark faces with glowing
// neon edges. Loudness sets the speed, bass drives the glow and hover, and
// kick drums fire a boost.

// Ship mesh, in ship space: x right, y up, z forward (away from the camera).
const VERTICES = [
  [0, 0.02, 2.5], // 0 nose
  [0, 0.3, 0.8], // 1 spine front
  [0, 0.36, -0.3], // 2 spine rear
  [-0.38, 0.06, 0.9], // 3 left shoulder
  [0.38, 0.06, 0.9], // 4 right shoulder
  [-0.5, 0.24, -0.9], // 5 left rear top
  [0.5, 0.24, -0.9], // 6 right rear top
  [0, -0.14, 0.9], // 7 keel front
  [0, -0.16, -0.95], // 8 keel rear
  [-1.35, -0.02, -0.55], // 9 left wingtip front
  [1.35, -0.02, -0.55], // 10 right wingtip front
  [-1.25, 0.02, -1.05], // 11 left wingtip rear
  [1.25, 0.02, -1.05], // 12 right wingtip rear
  [-0.5, -0.1, -1.0], // 13 left rear low
  [0.5, -0.1, -1.0], // 14 right rear low
  [-0.98, 0.62, -1.25], // 15 left fin top (leaning inwards)
  [0.98, 0.62, -1.25], // 16 right fin top
  [-0.2, 0.3, 0.35], // 17 canopy left
  [0.2, 0.3, 0.35], // 18 canopy right
];

// Faces are near-black so they hide the edges behind them; the edges carry the colour.
const FILL = {
  hull: [14, 18, 30],
  spine: [10, 18, 48],
  under: [6, 8, 14],
  fin: [30, 8, 28],
  glass: [8, 30, 40],
};
const EDGE = {
  hull: [60, 220, 255],
  fin: [255, 60, 200],
  glass: [190, 250, 255],
};

// `bias` pushes a face later in the draw order (for details sitting on a surface).
// `twoSided` faces (thin fins) are never culled.
const FACES = [
  { v: [0, 3, 1], fill: FILL.hull, edge: EDGE.hull },
  { v: [0, 1, 4], fill: FILL.hull, edge: EDGE.hull },
  { v: [1, 3, 5, 2], fill: FILL.spine, edge: EDGE.hull },
  { v: [1, 2, 6, 4], fill: FILL.spine, edge: EDGE.hull },
  { v: [2, 5, 6], fill: FILL.hull, edge: EDGE.hull },
  { v: [3, 9, 11, 5], fill: FILL.hull, edge: EDGE.hull },
  { v: [4, 6, 12, 10], fill: FILL.hull, edge: EDGE.hull },
  { v: [0, 7, 3], fill: FILL.under, edge: EDGE.hull },
  { v: [0, 4, 7], fill: FILL.under, edge: EDGE.hull },
  { v: [3, 7, 8, 13, 11, 9], fill: FILL.under, edge: EDGE.hull },
  { v: [4, 10, 12, 14, 8, 7], fill: FILL.under, edge: EDGE.hull },
  { v: [5, 6, 14, 13], fill: FILL.hull, edge: EDGE.hull },
  { v: [5, 13, 11], fill: FILL.hull, edge: EDGE.hull },
  { v: [6, 12, 14], fill: FILL.hull, edge: EDGE.hull },
  { v: [11, 9, 15], fill: FILL.fin, edge: EDGE.fin, twoSided: true },
  { v: [12, 10, 16], fill: FILL.fin, edge: EDGE.fin, twoSided: true },
  { v: [1, 17, 2], fill: FILL.glass, edge: EDGE.glass, bias: 10 },
  { v: [1, 2, 18], fill: FILL.glass, edge: EDGE.glass, bias: 10 },
];

const EXHAUSTS = [[-0.25, 0.06, -1.02], [0.25, 0.06, -1.02]];
const LIGHT = normalise([-0.45, 0.8, -0.4]); // camera space: from the upper left, behind the ship

// Chase camera: behind and above the ship, tilted down so you see its top.
const CAMERA_Y = 2.6;
const CAMERA_Z = -6.2;
const CAMERA_PITCH = 0.2; // radians, looking down
const SHIP_CENTRE = [0, 0.1, 0];

const BLOOM_SCALE = 0.25;

const STAR_COUNT = 450;
const MIN_Z = 0.02;
const BASE_SPEED = 0.25;
const LOUDNESS_SPEED = 3.2;

const BASS_BANDS = 4;
const BEAT_THRESHOLD = 1.25;
const BEAT_MIN_LEVEL = 0.35;
const BEAT_COOLDOWN = 0.25;

function normalise([x, y, z]) {
  const length = Math.hypot(x, y, z);
  return [x / length, y / length, z / length];
}

function seededRandom(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class AntiGravVisualiser extends Visualiser {
  static id = 'anti-grav';
  static label = 'Anti-grav racer';

  constructor(ctx, audio) {
    super(ctx, audio);
    this.bands = logBands(24, audio);

    // Transformed vertices (world space) and their projections, reused every frame.
    this.world = VERTICES.map(() => [0, 0, 0]);
    this.cameraSpace = VERTICES.map(() => [0, 0, 0]);
    this.screenX = new Float32Array(VERTICES.length);
    this.screenY = new Float32Array(VERTICES.length);
    this.depth = new Float32Array(VERTICES.length);
    this.faceOrder = FACES.map((_, i) => i);
    this.faceDepth = new Float32Array(FACES.length);
    this.shipCanvas = document.createElement('canvas');
    this.shipCtx = this.shipCanvas.getContext('2d');
    this.bloomCanvas = document.createElement('canvas');
    this.bloomCtx = this.bloomCanvas.getContext('2d');

    this.starX = new Float32Array(STAR_COUNT);
    this.starY = new Float32Array(STAR_COUNT);
    this.starZ = new Float32Array(STAR_COUNT);
    this.starHue = new Float32Array(STAR_COUNT);
    for (let i = 0; i < STAR_COUNT; i++) {
      this.resetStar(i);
      this.starZ[i] = MIN_Z + Math.random() * (1 - MIN_Z);
    }

    this.speed = BASE_SPEED;
    this.loudness = 0;
    this.bassSmooth = 0;
    this.bassAverage = 0;
    this.cooldown = 0;
    this.boost = 0;
    this.shipX = 0;
    this.roll = 0;
  }

  resetStar(i) {
    this.starX[i] = Math.random() * 2 - 1;
    this.starY[i] = Math.random() * 2 - 1;
    this.starZ[i] = 1;
    this.starHue[i] = Math.random() < 0.7 ? 190 + Math.random() * 30 : 280 + Math.random() * 40;
  }

  // The nebula backdrop never changes, so it's painted once per size into an
  // offscreen canvas and copied each frame.
  resize(width, height, dpr) {
    super.resize(width, height, dpr);
    const background = document.createElement('canvas');
    background.width = width;
    background.height = height;
    const bg = background.getContext('2d');

    const base = bg.createLinearGradient(0, 0, 0, height);
    base.addColorStop(0, '#020208');
    base.addColorStop(1, '#060514');
    bg.fillStyle = base;
    bg.fillRect(0, 0, width, height);

    const random = seededRandom(2097);
    const size = Math.max(width, height);
    for (let i = 0; i < 6; i++) {
      const x = random() * width;
      const y = random() * height * 0.8;
      const r = size * (0.2 + random() * 0.35);
      const hue = [270, 300, 190, 220][i % 4];
      const blob = bg.createRadialGradient(x, y, 0, x, y, r);
      blob.addColorStop(0, `hsla(${hue}, 80%, 35%, 0.12)`);
      blob.addColorStop(1, `hsla(${hue}, 80%, 35%, 0)`);
      bg.fillStyle = blob;
      bg.fillRect(0, 0, width, height);
    }

    bg.fillStyle = 'rgba(255, 255, 255, 0.35)';
    for (let i = 0; i < 220; i++) {
      const r = (0.3 + random() * 0.8) * dpr;
      bg.fillRect(random() * width, random() * height, r, r);
    }
    this.background = background;
  }

  draw({ frequencyData, waveformData, time, deltaTime }) {
    const dt = deltaTime / 1000;
    this.update(frequencyData, waveformData, time, dt);

    const { ctx, width, height, dpr } = this;
    ctx.drawImage(this.background, 0, 0);

    // A slight zoom-out on boost reads as a surge of acceleration.
    const focal = Math.min(width, height) * 1.05 * (1 - this.boost * 0.04);
    const shake = this.boost * 2 * dpr;
    const cx = width / 2 + (Math.random() - 0.5) * shake;
    const cy = height / 2 + (Math.random() - 0.5) * shake;

    // Looking down shifts the vanishing point of the stars above the centre.
    this.drawStars(cx, cy - Math.tan(CAMERA_PITCH) * focal, dt);
    this.drawShip(cx, cy, focal);
  }

  update(frequencyData, waveformData, time, dt) {
    let sumSquares = 0;
    for (let i = 0; i < waveformData.length; i++) {
      const sample = (waveformData[i] - 128) / 128;
      sumSquares += sample * sample;
    }
    const loudness = Math.min(1, Math.sqrt(sumSquares / waveformData.length) * 2.5);
    this.loudness += (loudness - this.loudness) * Math.min(1, dt * 3);

    let bass = 0;
    for (let i = 0; i < BASS_BANDS; i++) bass += bandLevel(frequencyData, this.bands[i]) / BASS_BANDS;
    this.bassSmooth += (bass - this.bassSmooth) * Math.min(1, dt * 12);

    this.cooldown -= dt;
    if (bass > BEAT_MIN_LEVEL && bass > this.bassAverage * BEAT_THRESHOLD && this.cooldown <= 0) {
      this.boost = 1;
      this.cooldown = BEAT_COOLDOWN;
    }
    this.bassAverage += (bass - this.bassAverage) * Math.min(1, dt * 4);
    this.boost = Math.max(0, this.boost - dt * 2.5);

    const targetSpeed = (BASE_SPEED + loudness * LOUDNESS_SPEED) * (1 + this.boost * 0.8);
    this.speed += (targetSpeed - this.speed) * Math.min(1, dt * 4);

    // Weave across the track, banking into each turn.
    const shipX = Math.sin(time * 0.00045) * 0.9 + Math.sin(time * 0.0011) * 0.3;
    const lateralSpeed = dt > 0 ? (shipX - this.shipX) / dt : 0;
    this.shipX = shipX;
    const targetRoll = Math.max(-0.6, Math.min(0.6, -lateralSpeed * 0.9));
    this.roll += (targetRoll - this.roll) * Math.min(1, dt * 5);
    this.yaw = lateralSpeed * 0.06;
    this.shipY = Math.sin(time * 0.0021) * 0.05 + this.bassSmooth * 0.12;
    this.pitch = -this.boost * 0.06;
  }

  drawStars(cx, cy, dt) {
    const { ctx, width, height, dpr } = this;
    const focal = Math.max(width, height) * 0.5;
    ctx.lineCap = 'round';

    for (let i = 0; i < STAR_COUNT; i++) {
      const previousZ = this.starZ[i];
      this.starZ[i] -= this.speed * dt;
      const z = this.starZ[i];
      if (z <= MIN_Z) {
        this.resetStar(i);
        continue;
      }

      // Streaks are stretched beyond one frame's travel so they read as speed lines.
      const tailZ = Math.min(1, z + (previousZ - z) * 3);
      const x0 = cx + (this.starX[i] / tailZ) * focal;
      const y0 = cy + (this.starY[i] / tailZ) * focal;
      const x1 = cx + (this.starX[i] / z) * focal;
      const y1 = cy + (this.starY[i] / z) * focal;
      if (x1 < 0 || x1 > width || y1 < 0 || y1 > height) {
        this.resetStar(i);
        continue;
      }

      const closeness = 1 - z;
      ctx.strokeStyle = `hsla(${this.starHue[i]}, 70%, ${45 + this.loudness * 25}%, ${closeness * 0.8})`;
      ctx.lineWidth = (0.5 + closeness * 2.2) * dpr;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
    }
  }

  // Ship space -> world space: roll (z), pitch (x), yaw (y), then translate.
  transform([x, y, z], out) {
    const cr = Math.cos(this.roll), sr = Math.sin(this.roll);
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    const cyaw = Math.cos(this.yaw), syaw = Math.sin(this.yaw);
    const x1 = x * cr - y * sr;
    const y1 = x * sr + y * cr;
    const y2 = y1 * cp - z * sp;
    const z2 = y1 * sp + z * cp;
    out[0] = x1 * cyaw + z2 * syaw + this.shipX;
    out[1] = y2 + this.shipY;
    out[2] = -x1 * syaw + z2 * cyaw;
    return out;
  }

  // World space -> camera space (relative to the camera, tilted down).
  toCamera([x, y, z], out) {
    const dy = y - CAMERA_Y;
    const dz = z - CAMERA_Z;
    const c = Math.cos(CAMERA_PITCH), s = Math.sin(CAMERA_PITCH);
    out[0] = x;
    out[1] = dy * c + dz * s;
    out[2] = -dy * s + dz * c;
    return out;
  }

  drawShip(cx, cy, focal) {
    const { ctx, world, screenX, screenY, depth } = this;
    const camera = this.cameraSpace;

    for (let i = 0; i < VERTICES.length; i++) {
      this.transform(VERTICES[i], world[i]);
      const [x, y, z] = this.toCamera(world[i], camera[i]);
      screenX[i] = cx + (x / z) * focal;
      screenY[i] = cy - (y / z) * focal;
      depth[i] = z;
    }
    const centre = this.toCamera(this.transform(SHIP_CENTRE, [0, 0, 0]), [0, 0, 0]);

    // Painter's algorithm: farthest faces first.
    FACES.forEach((face, f) => {
      let sum = 0;
      for (const v of face.v) sum += depth[v];
      this.faceDepth[f] = sum / face.v.length - (face.bias ?? 0);
    });
    this.faceOrder.sort((a, b) => this.faceDepth[b] - this.faceDepth[a]);

    this.drawExhaustPlumes(cx, cy, focal);

    // The ship is drawn into a small offscreen canvas around it, then copied
    // back twice more blurred for a bloom glow. Blurring only this region
    // keeps it cheap.
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (let i = 0; i < VERTICES.length; i++) {
      minX = Math.min(minX, screenX[i]);
      maxX = Math.max(maxX, screenX[i]);
      minY = Math.min(minY, screenY[i]);
      maxY = Math.max(maxY, screenY[i]);
    }
    const pad = 40 * this.dpr;
    const left = Math.floor(minX - pad);
    const top = Math.floor(minY - pad);
    const boxWidth = Math.ceil(maxX - minX + pad * 2);
    const boxHeight = Math.ceil(maxY - minY + pad * 2);
    const shipCanvas = this.shipCanvas;
    if (shipCanvas.width < boxWidth || shipCanvas.height < boxHeight) {
      shipCanvas.width = Math.max(shipCanvas.width, boxWidth);
      shipCanvas.height = Math.max(shipCanvas.height, boxHeight);
    }
    const shipCtx = this.shipCtx;
    shipCtx.clearRect(0, 0, shipCanvas.width, shipCanvas.height);
    shipCtx.save();
    shipCtx.translate(-left, -top);
    shipCtx.lineJoin = 'round';
    shipCtx.lineCap = 'round';
    const glow = 0.65 + this.bassSmooth * 0.35 + this.boost * 0.3;

    for (const f of this.faceOrder) {
      const face = FACES[f];
      const [a, b, c] = face.v;
      // Face normal in camera space, flipped to point away from the ship's
      // centre so winding order in FACES doesn't matter.
      const pa = camera[a], pb = camera[b], pc = camera[c];
      const ux = pb[0] - pa[0], uy = pb[1] - pa[1], uz = pb[2] - pa[2];
      const vx = pc[0] - pa[0], vy = pc[1] - pa[1], vz = pc[2] - pa[2];
      let normal = normalise([uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx]);
      let mx = 0, my = 0, mz = 0;
      for (const v of face.v) {
        mx += camera[v][0] / face.v.length;
        my += camera[v][1] / face.v.length;
        mz += camera[v][2] / face.v.length;
      }
      if (normal[0] * (mx - centre[0]) + normal[1] * (my - centre[1]) + normal[2] * (mz - centre[2]) < 0) {
        normal = [-normal[0], -normal[1], -normal[2]];
      }
      // Back-face culling: skip faces pointing away from the camera (at the origin).
      const facing = normal[0] * mx + normal[1] * my + normal[2] * mz;
      if (facing > 0 && !face.twoSided) continue;

      // Subtle shading keeps the dark faces readable as surfaces.
      const lightDot = normal[0] * LIGHT[0] + normal[1] * LIGHT[1] + normal[2] * LIGHT[2];
      const shade = 0.6 + 0.8 * Math.max(0, face.twoSided ? Math.abs(lightDot) : lightDot);
      const [r, g, bl] = face.fill;
      const [er, eg, eb] = face.edge;

      shipCtx.beginPath();
      shipCtx.moveTo(screenX[face.v[0]], screenY[face.v[0]]);
      for (let k = 1; k < face.v.length; k++) shipCtx.lineTo(screenX[face.v[k]], screenY[face.v[k]]);
      shipCtx.closePath();
      shipCtx.fillStyle = `rgb(${r * shade}, ${g * shade}, ${bl * shade})`;
      shipCtx.fill();
      shipCtx.strokeStyle = `rgba(${er}, ${eg}, ${eb}, ${Math.min(1, glow)})`;
      shipCtx.lineWidth = 1.6 * this.dpr;
      shipCtx.stroke();
    }
    shipCtx.restore();

    const sourceWidth = Math.min(boxWidth, shipCanvas.width);
    const sourceHeight = Math.min(boxHeight, shipCanvas.height);
    ctx.drawImage(shipCanvas, 0, 0, sourceWidth, sourceHeight, left, top, sourceWidth, sourceHeight);

    // Bloom: blur a quarter-resolution copy (16× fewer pixels to blur) and
    // scale it back up additively. A tight and a wide pass make the glow.
    const bloomWidth = Math.ceil(sourceWidth * BLOOM_SCALE);
    const bloomHeight = Math.ceil(sourceHeight * BLOOM_SCALE);
    const bloomCanvas = this.bloomCanvas;
    if (bloomCanvas.width < bloomWidth || bloomCanvas.height < bloomHeight) {
      bloomCanvas.width = Math.max(bloomCanvas.width, bloomWidth);
      bloomCanvas.height = Math.max(bloomCanvas.height, bloomHeight);
    }
    const bloomCtx = this.bloomCtx;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const [blur, alpha] of [[4, 1], [14, 0.5 + this.boost * 0.4]]) {
      bloomCtx.clearRect(0, 0, bloomCanvas.width, bloomCanvas.height);
      bloomCtx.filter = `blur(${blur * this.dpr * BLOOM_SCALE}px)`;
      bloomCtx.drawImage(shipCanvas, 0, 0, sourceWidth, sourceHeight, 0, 0, bloomWidth, bloomHeight);
      ctx.globalAlpha = alpha;
      ctx.drawImage(bloomCanvas, 0, 0, bloomWidth, bloomHeight, left, top, sourceWidth, sourceHeight);
    }
    ctx.restore();

    this.drawExhaustGlow(cx, cy, focal);
  }

  project(point, cx, cy, focal) {
    const [x, y, z] = this.toCamera(this.transform(point, [0, 0, 0]), [0, 0, 0]);
    return [cx + (x / z) * focal, cy - (y / z) * focal, focal / z];
  }

  // Tapered flames trailing back from the engines, towards the camera.
  drawExhaustPlumes(cx, cy, focal) {
    const { ctx } = this;
    const length = 0.5 + this.loudness * 0.9 + this.boost * 1.2;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const [ex, ey, ez] of EXHAUSTS) {
      const [x0, y0, s0] = this.project([ex, ey, ez], cx, cy, focal);
      const [x1, y1, s1] = this.project([ex, ey, ez - length], cx, cy, focal);
      const w0 = 0.1 * s0;
      const w1 = 0.02 * s1;
      const angle = Math.atan2(y1 - y0, x1 - x0) + Math.PI / 2;
      const nx = Math.cos(angle), ny = Math.sin(angle);
      const flame = ctx.createLinearGradient(x0, y0, x1, y1);
      flame.addColorStop(0, `rgba(170, 235, 255, ${0.75 + this.boost * 0.25})`);
      flame.addColorStop(0.4, 'rgba(60, 140, 255, 0.45)');
      flame.addColorStop(1, 'rgba(60, 80, 255, 0)');
      ctx.fillStyle = flame;
      ctx.beginPath();
      ctx.moveTo(x0 + nx * w0, y0 + ny * w0);
      ctx.lineTo(x1 + nx * w1, y1 + ny * w1);
      ctx.lineTo(x1 - nx * w1, y1 - ny * w1);
      ctx.lineTo(x0 - nx * w0, y0 - ny * w0);
      ctx.fill();
    }
    ctx.restore();
  }

  drawExhaustGlow(cx, cy, focal) {
    const { ctx } = this;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const exhaust of EXHAUSTS) {
      const [x, y, scale] = this.project(exhaust, cx, cy, focal);
      const r = (0.12 + this.bassSmooth * 0.08 + this.boost * 0.12) * scale;
      const glow = ctx.createRadialGradient(x, y, 0, x, y, r);
      glow.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
      glow.addColorStop(0.25, 'rgba(120, 220, 255, 0.8)');
      glow.addColorStop(1, 'rgba(40, 90, 255, 0)');
      ctx.fillStyle = glow;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    ctx.restore();
  }
}
