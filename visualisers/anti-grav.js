import { Visualiser, bandLevel, logBands } from './base.js';

// A futuristic anti-gravity racer streaking through deep space. The ship is a
// small flat-shaded 3D mesh seen from a chase camera. Loudness sets the
// speed, bass drives the engine glow and hover, and kick drums fire a boost.

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

const LIVERY = {
  white: [233, 237, 243],
  blue: [30, 90, 255],
  dark: [40, 44, 56],
  rear: [58, 62, 76],
  orange: [255, 120, 20],
  glass: [20, 170, 215],
};

// `bias` pushes a face later in the draw order (for details sitting on a surface).
// `twoSided` faces (thin fins) are never culled.
const FACES = [
  { v: [0, 3, 1], colour: LIVERY.white },
  { v: [0, 1, 4], colour: LIVERY.white },
  { v: [1, 3, 5, 2], colour: LIVERY.blue },
  { v: [1, 2, 6, 4], colour: LIVERY.blue },
  { v: [2, 5, 6], colour: LIVERY.white },
  { v: [3, 9, 11, 5], colour: LIVERY.white },
  { v: [4, 6, 12, 10], colour: LIVERY.white },
  { v: [0, 7, 3], colour: LIVERY.dark },
  { v: [0, 4, 7], colour: LIVERY.dark },
  { v: [3, 7, 8, 13, 11, 9], colour: LIVERY.dark },
  { v: [4, 10, 12, 14, 8, 7], colour: LIVERY.dark },
  { v: [5, 6, 14, 13], colour: LIVERY.rear },
  { v: [5, 13, 11], colour: LIVERY.rear },
  { v: [6, 12, 14], colour: LIVERY.rear },
  { v: [11, 9, 15], colour: LIVERY.orange, twoSided: true },
  { v: [12, 10, 16], colour: LIVERY.orange, twoSided: true },
  { v: [1, 17, 2], colour: LIVERY.glass, bias: 10 },
  { v: [1, 2, 18], colour: LIVERY.glass, bias: 10 },
];

const EXHAUSTS = [[-0.25, 0.06, -1.02], [0.25, 0.06, -1.02]];
const LIGHT = normalise([-0.45, 0.8, -0.4]); // camera space: from the upper left, behind the ship

// Chase camera: behind and above the ship, tilted down so you see its top.
const CAMERA_Y = 2.6;
const CAMERA_Z = -6.2;
const CAMERA_PITCH = 0.2; // radians, looking down
const SHIP_CENTRE = [0, 0.1, 0];

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
    base.addColorStop(0, '#05040f');
    base.addColorStop(1, '#0d0a26');
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
      blob.addColorStop(0, `hsla(${hue}, 80%, 45%, 0.22)`);
      blob.addColorStop(1, `hsla(${hue}, 80%, 45%, 0)`);
      bg.fillStyle = blob;
      bg.fillRect(0, 0, width, height);
    }

    bg.fillStyle = 'rgba(255, 255, 255, 0.55)';
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
    this.drawHud();
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
      ctx.strokeStyle = `hsla(${this.starHue[i]}, 80%, ${65 + this.loudness * 25}%, ${closeness})`;
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

      const lightDot = normal[0] * LIGHT[0] + normal[1] * LIGHT[1] + normal[2] * LIGHT[2];
      const shade = 0.35 + 0.8 * Math.max(0, face.twoSided ? Math.abs(lightDot) : lightDot);
      const [r, g, bl] = face.colour;
      ctx.fillStyle = `rgb(${Math.min(255, r * shade)}, ${Math.min(255, g * shade)}, ${Math.min(255, bl * shade)})`;
      ctx.strokeStyle = ctx.fillStyle; // hides hairline gaps between faces
      ctx.lineWidth = 1;
      ctx.lineJoin = 'round';

      ctx.beginPath();
      ctx.moveTo(screenX[face.v[0]], screenY[face.v[0]]);
      for (let k = 1; k < face.v.length; k++) ctx.lineTo(screenX[face.v[k]], screenY[face.v[k]]);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

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

  drawHud() {
    const { ctx, width, height } = this;
    const s = Math.min(width, height) / 600;
    const margin = 26 * s;
    const speedFraction = Math.min(1, (this.speed - BASE_SPEED) / (LOUDNESS_SPEED * 1.4));
    const kmh = Math.round(420 + speedFraction * 560);

    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(220, 235, 255, 0.75)';
    ctx.font = `600 ${11 * s}px "Helvetica Neue", Helvetica, Arial, sans-serif`;
    ctx.letterSpacing = `${3 * s}px`;
    ctx.fillText('SPEED', margin, height - margin - 52 * s);

    ctx.fillStyle = '#ffffff';
    ctx.font = `italic 300 ${38 * s}px "Helvetica Neue", Helvetica, Arial, sans-serif`;
    ctx.letterSpacing = `${1 * s}px`;
    ctx.fillText(String(kmh), margin, height - margin - 16 * s);
    const digitsWidth = ctx.measureText(String(kmh)).width;
    ctx.font = `600 ${11 * s}px "Helvetica Neue", Helvetica, Arial, sans-serif`;
    ctx.fillStyle = 'rgba(220, 235, 255, 0.75)';
    ctx.fillText('KM/H', margin + digitsWidth + 8 * s, height - margin - 16 * s);

    // Thrust bar: slanted segments, cyan to magenta.
    const segments = 24;
    const segmentWidth = 9 * s;
    const segmentHeight = 8 * s;
    const slant = 4 * s;
    const lit = Math.round(speedFraction * segments);
    const y = height - margin;
    for (let i = 0; i < segments; i++) {
      const x = margin + i * (segmentWidth + 3 * s);
      ctx.fillStyle = i < lit ? `hsl(${190 + (i / segments) * 120}, 100%, 60%)` : 'rgba(255, 255, 255, 0.12)';
      ctx.beginPath();
      ctx.moveTo(x + slant, y - segmentHeight);
      ctx.lineTo(x + slant + segmentWidth, y - segmentHeight);
      ctx.lineTo(x + segmentWidth, y);
      ctx.lineTo(x, y);
      ctx.fill();
    }

    if (this.boost > 0.05) {
      ctx.fillStyle = `rgba(255, 60, 200, ${this.boost})`;
      ctx.font = `italic 700 ${16 * s}px "Helvetica Neue", Helvetica, Arial, sans-serif`;
      ctx.letterSpacing = `${6 * s}px`;
      ctx.fillText('BOOST', margin, height - margin - 78 * s);
    }
  }
}
