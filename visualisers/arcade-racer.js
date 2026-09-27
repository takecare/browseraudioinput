import { Visualiser, bandLevel, logBands } from './base.js';

// A 90s arcade racer: pseudo-3D road drawn as projected segments (the
// technique arcade racers of the era used), a low-poly car seen from behind
// and an arcade HUD. Loudness sets the speed, bass lights up the tail lights,
// and kick drums fire the exhaust.

// World, in arbitrary units.
const SEGMENT_LENGTH = 200;
const DRAW_DISTANCE = 160; // segments
const ROAD_HALF_WIDTH = 1500;
const CAMERA_HEIGHT = 1000;
const CAMERA_DEPTH = 0.84; // 1 / tan(fov / 2), roughly a 100° field of view
const NEAR_PLANE = 10;
const RUMBLE_SEGMENTS = 3; // kerb and grass stripe length
const DASH_SEGMENTS = 4; // lane dash + gap length
const PALM_EVERY = 8; // segments between palms on each side
const HORIZON = 0.46; // fraction of the canvas height
const LAP_LENGTH = 400000;

// Driving.
const MIN_SPEED = 90; // km/h when silent
const MAX_SPEED = 340; // km/h at full loudness
const KMH_TO_UNITS = 40; // world units per second per km/h
const GEAR_TOP_SPEEDS = [60, 100, 145, 190, 240, Infinity];

// Beat detection (same approach as particles.js).
const BASS_BANDS = 4;
const BEAT_THRESHOLD = 1.25;
const BEAT_MIN_LEVEL = 0.35;
const BEAT_COOLDOWN = 0.18;

const COLOURS = {
  skyTop: '#1846c9',
  skyMid: '#3f95f2',
  skyHorizon: '#d4f0ff',
  haze: '212, 240, 255',
  hillsFar: '#7d9fd6',
  hillsNear: '#4d8a73',
  grassLight: '#52b33c',
  grassDark: '#46a132',
  roadLight: '#6e6e78',
  roadDark: '#666670',
  kerbRed: '#e02828',
  kerbWhite: '#f4f4f4',
  lane: '#f4f4f4',
  trunk: '#7a4b24',
  trunkShade: '#5c3719',
  leafLight: '#3fae45',
  leafDark: '#2a8a36',
  hudYellow: '#ffe14d',
  hudOutline: '#0a0a14',
};

// Palm fronds as screen-space angles (degrees, 0 = right, negative = up).
const FROND_ANGLES = [-172, -140, -110, -78, -48, -14, 158, 22];

// Small seeded PRNG so the hills and clouds look the same every time.
function seededRandom(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildHills(random, samples) {
  const waves = Array.from({ length: 4 }, (_, i) => ({
    frequency: (i + 1) * (1 + random() * 1.5),
    phase: random() * Math.PI * 2,
    amplitude: 1 / (i + 1),
  }));
  const heights = new Float32Array(samples);
  let max = 0;
  for (let i = 0; i < samples; i++) {
    const x = (i / (samples - 1)) * Math.PI * 2;
    let h = 0;
    for (const w of waves) h += Math.sin(x * w.frequency + w.phase) * w.amplitude;
    heights[i] = h;
    max = Math.max(max, Math.abs(h));
  }
  for (let i = 0; i < samples; i++) heights[i] = 0.35 + 0.65 * ((heights[i] / max + 1) / 2);
  return heights;
}

export class ArcadeRacerVisualiser extends Visualiser {
  static id = 'arcade-racer';
  static label = 'Arcade racer';

  constructor(ctx, audio) {
    super(ctx, audio);
    this.bands = logBands(24, audio);
    const random = seededRandom(1997);
    this.hillsFar = buildHills(random, 96);
    this.hillsNear = buildHills(random, 96);
    this.clouds = Array.from({ length: 6 }, () => ({
      x: random(),
      y: 0.05 + random() * 0.22,
      size: 0.6 + random() * 0.8,
      speed: 0.3 + random() * 0.7,
    }));

    this.position = 0;
    this.speed = MIN_SPEED; // km/h
    this.bassAverage = 0;
    this.bassSmooth = 0;
    this.cooldown = 0;
    this.flame = 0; // 0–1, exhaust backfire
    this.bump = 0; // 0–1, camera bump
    this.lap = 1;
    this.lapTime = 0;
  }

  draw({ frequencyData, waveformData, time, deltaTime }) {
    const dt = deltaTime / 1000;
    this.update(frequencyData, waveformData, dt);

    const { ctx, height, dpr } = this;
    ctx.save();
    ctx.translate(0, this.bump * 7 * dpr);
    this.drawSky(time);
    this.drawRoad();
    this.drawHaze();
    ctx.restore();

    const vibration = (Math.random() - 0.5) * dpr * (this.speed / MAX_SPEED);
    this.drawCar(time, height * 0.95 - this.bassSmooth * 5 * dpr + vibration);
    this.drawHud();
  }

  update(frequencyData, waveformData, dt) {
    let sumSquares = 0;
    for (let i = 0; i < waveformData.length; i++) {
      const sample = (waveformData[i] - 128) / 128;
      sumSquares += sample * sample;
    }
    const loudness = Math.min(1, Math.sqrt(sumSquares / waveformData.length) * 2.5);

    let bass = 0;
    for (let i = 0; i < BASS_BANDS; i++) bass += bandLevel(frequencyData, this.bands[i]) / BASS_BANDS;

    // Cars don't change speed instantly: ease towards the target.
    const targetSpeed = MIN_SPEED + loudness * (MAX_SPEED - MIN_SPEED);
    this.speed += (targetSpeed - this.speed) * Math.min(1, dt * 1.2);
    this.position += this.speed * KMH_TO_UNITS * dt;

    this.bassSmooth += (bass - this.bassSmooth) * Math.min(1, dt * 12);
    this.cooldown -= dt;
    if (bass > BEAT_MIN_LEVEL && bass > this.bassAverage * BEAT_THRESHOLD && this.cooldown <= 0) {
      this.flame = 1;
      this.bump = 1;
      this.cooldown = BEAT_COOLDOWN;
    }
    this.bassAverage += (bass - this.bassAverage) * Math.min(1, dt * 4);
    this.flame = Math.max(0, this.flame - dt * 6);
    this.bump = Math.max(0, this.bump - dt * 5);

    this.lapTime += dt;
    const lap = Math.floor(this.position / LAP_LENGTH) + 1;
    if (lap !== this.lap) {
      this.lap = lap;
      this.lapTime = 0;
    }
  }

  // --- Scenery -------------------------------------------------------------

  drawSky(time) {
    const { ctx, width, height, dpr } = this;
    const horizonY = height * HORIZON;

    const sky = ctx.createLinearGradient(0, 0, 0, horizonY);
    sky.addColorStop(0, COLOURS.skyTop);
    sky.addColorStop(0.6, COLOURS.skyMid);
    sky.addColorStop(1, COLOURS.skyHorizon);
    ctx.fillStyle = sky;
    ctx.fillRect(0, -20 * dpr, width, horizonY + 20 * dpr);

    this.drawSun();

    // Clouds drift slowly to the left.
    const span = width + 400 * dpr;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    for (const cloud of this.clouds) {
      const x = span - ((cloud.x * span + time * 0.012 * dpr * cloud.speed) % span) - 200 * dpr;
      const y = cloud.y * height;
      const s = cloud.size * Math.min(width, height) * 0.06;
      ctx.beginPath();
      ctx.ellipse(x, y, s * 1.6, s * 0.45, 0, 0, Math.PI * 2);
      ctx.ellipse(x - s * 0.6, y - s * 0.2, s * 0.7, s * 0.4, 0, 0, Math.PI * 2);
      ctx.ellipse(x + s * 0.4, y - s * 0.3, s * 0.8, s * 0.5, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    this.drawHills(this.hillsFar, height * 0.1, COLOURS.hillsFar);
    this.drawHills(this.hillsNear, height * 0.055, COLOURS.hillsNear);
  }

  drawSun() {
    const { ctx, width, height } = this;
    const size = Math.min(width, height);
    const sx = width * 0.8;
    const sy = height * 0.13;
    const radius = size * 0.045;

    const glow = ctx.createRadialGradient(sx, sy, 0, sx, sy, radius * 5);
    glow.addColorStop(0, 'rgba(255, 255, 240, 0.9)');
    glow.addColorStop(0.2, 'rgba(255, 250, 210, 0.5)');
    glow.addColorStop(1, 'rgba(255, 250, 210, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(sx - radius * 5, sy - radius * 5, radius * 10, radius * 10);

    ctx.fillStyle = '#fffef2';
    ctx.beginPath();
    ctx.arc(sx, sy, radius, 0, Math.PI * 2);
    ctx.fill();

    // Lens flare: rings along the line from the sun through the screen centre.
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const dx = width / 2 - sx;
    const dy = height / 2 - sy;
    for (const [t, r, colour] of [
      [0.35, 0.5, '255, 220, 150'],
      [0.6, 0.25, '150, 255, 200'],
      [1.05, 0.8, '180, 160, 255'],
      [1.35, 0.35, '255, 180, 120'],
    ]) {
      ctx.fillStyle = `rgba(${colour}, 0.12)`;
      ctx.beginPath();
      ctx.arc(sx + dx * t, sy + dy * t, radius * r * 2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  drawHills(heights, maxHeight, colour) {
    const { ctx, width, height } = this;
    const horizonY = height * HORIZON;
    ctx.fillStyle = colour;
    ctx.beginPath();
    ctx.moveTo(0, horizonY + 1);
    for (let i = 0; i < heights.length; i++) {
      ctx.lineTo((i / (heights.length - 1)) * width, horizonY - heights[i] * maxHeight);
    }
    ctx.lineTo(width, horizonY + 1);
    ctx.fill();
  }

  // A trapezoid centred on the road: `halfNear`/`halfFar` are half-widths in pixels.
  quad(xFar, yFar, halfFar, xNear, yNear, halfNear, colour) {
    const { ctx } = this;
    ctx.fillStyle = colour;
    ctx.beginPath();
    ctx.moveTo(xFar - halfFar, yFar);
    ctx.lineTo(xFar + halfFar, yFar);
    ctx.lineTo(xNear + halfNear, yNear);
    ctx.lineTo(xNear - halfNear, yNear);
    ctx.fill();
  }

  drawRoad() {
    const { ctx, width, height } = this;
    const horizonY = height * HORIZON;
    const cx = width / 2;
    const projection = (CAMERA_DEPTH * width) / 2; // pixels per world unit at distance 1

    ctx.fillStyle = COLOURS.grassDark;
    ctx.fillRect(0, horizonY, width, height - horizonY + 20 * this.dpr);

    const baseSegment = Math.floor(this.position / SEGMENT_LENGTH);

    // Painter's algorithm: far segments first, near ones drawn over them.
    for (let n = DRAW_DISTANCE; n >= 1; n--) {
      const index = baseSegment + n;
      const zNear = Math.max(NEAR_PLANE, index * SEGMENT_LENGTH - this.position);
      const zFar = zNear + SEGMENT_LENGTH;
      const scaleNear = projection / zNear;
      const scaleFar = projection / zFar;
      // Whole-pixel rows: neighbouring segments share an exact edge, so no
      // anti-aliased seams show between them.
      const yNear = Math.round(horizonY + scaleNear * CAMERA_HEIGHT);
      const yFar = Math.round(horizonY + scaleFar * CAMERA_HEIGHT);
      if (yFar > height) continue; // entirely below the screen

      const roadNear = scaleNear * ROAD_HALF_WIDTH;
      const roadFar = scaleFar * ROAD_HALF_WIDTH;
      const stripe = Math.floor(index / RUMBLE_SEGMENTS) % 2 === 0;

      // Near the horizon a segment can be thinner than a pixel: skip its road,
      // but still draw its palms.
      if (yNear > yFar) {
        if (stripe) {
          ctx.fillStyle = COLOURS.grassLight;
          ctx.fillRect(0, yFar, width, yNear - yFar);
        }
        this.quad(cx, yFar, roadFar * 1.12, cx, yNear, roadNear * 1.12, stripe ? COLOURS.kerbRed : COLOURS.kerbWhite);
        this.quad(cx, yFar, roadFar, cx, yNear, roadNear, stripe ? COLOURS.roadLight : COLOURS.roadDark);

        if (Math.floor(index / (DASH_SEGMENTS / 2)) % 2 === 0) {
          for (const lane of [-1 / 3, 1 / 3]) {
            this.quad(
              cx + roadFar * lane, yFar, roadFar * 0.025,
              cx + roadNear * lane, yNear, roadNear * 0.025,
              COLOURS.lane,
            );
          }
        }
      }

      const palmSlot = index % PALM_EVERY;
      if (palmSlot === 0 || palmSlot === PALM_EVERY / 2) {
        const side = palmSlot === 0 ? -1 : 1;
        if (zNear > 400) this.drawPalm(cx + side * ROAD_HALF_WIDTH * 1.75 * scaleNear, yNear, scaleNear, side);
      }
    }
  }

  // Palms are flat billboards, like in the arcade games: `unit` is pixels per world unit.
  drawPalm(x, baseY, unit, side) {
    const { ctx, width } = this;
    if (x < -2000 * unit || x > width + 2000 * unit) return;

    const height = 2600 * unit;
    const topX = x + side * 380 * unit;
    const topY = baseY - height;

    ctx.fillStyle = COLOURS.trunk;
    ctx.beginPath();
    ctx.moveTo(x - 75 * unit, baseY);
    ctx.quadraticCurveTo(x - 60 * unit, baseY - height * 0.6, topX - 35 * unit, topY);
    ctx.lineTo(topX + 35 * unit, topY);
    ctx.quadraticCurveTo(x + 90 * unit, baseY - height * 0.6, x + 75 * unit, baseY);
    ctx.fill();

    ctx.fillStyle = COLOURS.trunkShade;
    ctx.beginPath();
    ctx.moveTo(x + side * 10 * unit, baseY);
    ctx.quadraticCurveTo(x + side * 20 * unit, baseY - height * 0.6, topX + side * 5 * unit, topY);
    ctx.lineTo(topX + side * 35 * unit, topY);
    ctx.quadraticCurveTo(x + side * 90 * unit, baseY - height * 0.6, x + side * 75 * unit, baseY);
    ctx.fill();

    const length = 1100 * unit;
    const leafWidth = 130 * unit;
    FROND_ANGLES.forEach((degrees, i) => {
      const angle = (degrees * Math.PI) / 180;
      const dx = Math.cos(angle);
      const dy = Math.sin(angle);
      const tipX = topX + dx * length;
      const tipY = topY + dy * length + length * 0.45; // fronds droop
      const midX = topX + dx * length * 0.55;
      const midY = topY + dy * length * 0.55 - length * 0.08;
      ctx.fillStyle = i % 2 ? COLOURS.leafDark : COLOURS.leafLight;
      ctx.beginPath();
      ctx.moveTo(topX, topY);
      ctx.quadraticCurveTo(midX - dy * leafWidth, midY + dx * leafWidth, tipX, tipY);
      ctx.quadraticCurveTo(midX + dy * leafWidth, midY - dx * leafWidth, topX, topY);
      ctx.fill();
    });

    ctx.fillStyle = '#5a3a1a';
    ctx.beginPath();
    ctx.arc(topX, topY + 40 * unit, 70 * unit, 0, Math.PI * 2);
    ctx.fill();
  }

  // Distance haze where the road meets the sky.
  drawHaze() {
    const { ctx, width, height } = this;
    const horizonY = height * HORIZON;
    const depth = (height - horizonY) * 0.18;
    const haze = ctx.createLinearGradient(0, horizonY - height * 0.03, 0, horizonY + depth);
    haze.addColorStop(0, `rgba(${COLOURS.haze}, 0)`);
    haze.addColorStop(0.25, `rgba(${COLOURS.haze}, 0.5)`);
    haze.addColorStop(1, `rgba(${COLOURS.haze}, 0)`);
    ctx.fillStyle = haze;
    ctx.fillRect(0, horizonY - height * 0.03, width, depth + height * 0.03);
  }

  // --- Car -----------------------------------------------------------------

  drawCar(time, bottomY) {
    const { ctx, width, height } = this;
    const carWidth = Math.min(width * 0.3, height * 0.5);
    const unit = carWidth / 2;
    // A gentle weave across the lane, with the body rolling into it.
    const weave = Math.sin(time * 0.0006) * 0.6 + Math.sin(time * 0.0017) * 0.25;
    const cx = width / 2 + weave * width * 0.04;

    ctx.save();
    ctx.translate(cx, bottomY);
    ctx.rotate(Math.cos(time * 0.0006) * 0.012);
    ctx.scale(unit, unit);

    const poly = (colour, ...points) => {
      ctx.fillStyle = colour;
      ctx.beginPath();
      ctx.moveTo(points[0], points[1]);
      for (let i = 2; i < points.length; i += 2) ctx.lineTo(points[i], points[i + 1]);
      ctx.fill();
    };

    // Shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.beginPath();
    ctx.ellipse(0, 0.01, 1.2, 0.1, 0, 0, Math.PI * 2);
    ctx.fill();

    // Tyres
    for (const x of [-0.82, 0.82]) {
      poly('#141417', x - 0.17, 0, x + 0.17, 0, x + 0.17, -0.27, x - 0.17, -0.27);
      poly('#2a2a30', x - 0.17, -0.2, x + 0.17, -0.2, x + 0.17, -0.23, x - 0.17, -0.23);
    }

    // Lower body
    const body = ctx.createLinearGradient(0, -0.14, 0, -0.4);
    body.addColorStop(0, '#a90e15');
    body.addColorStop(1, '#ff3b30');
    poly(body, -1.0, -0.13, 1.0, -0.13, 1.04, -0.4, -1.04, -0.4);

    // Diffuser and exhausts
    poly('#18181c', -0.64, -0.05, 0.64, -0.05, 0.68, -0.16, -0.68, -0.16);
    for (const x of [-0.46, 0.46]) {
      ctx.fillStyle = '#4a4a50';
      ctx.beginPath();
      ctx.arc(x, -0.1, 0.06, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#0b0b0d';
      ctx.beginPath();
      ctx.arc(x, -0.1, 0.035, 0, Math.PI * 2);
      ctx.fill();
    }

    // Number plate
    poly('#f2f2e6', -0.2, -0.2, 0.2, -0.2, 0.2, -0.3, -0.2, -0.3);
    // Text is drawn at real pixel size: sub-pixel font sizes render unreliably.
    ctx.save();
    ctx.scale(1 / unit, 1 / unit);
    ctx.fillStyle = '#1a1a40';
    ctx.font = `bold ${0.08 * unit}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('SND 97', 0, -0.248 * unit);
    ctx.restore();

    // Tail lights, brighter with the bass
    const lightness = 42 + this.bassSmooth * 30;
    poly(`hsl(0, 100%, ${lightness}%)`, -0.98, -0.3, -0.5, -0.3, -0.48, -0.37, -1.0, -0.37);
    poly(`hsl(0, 100%, ${lightness}%)`, 0.98, -0.3, 0.5, -0.3, 0.48, -0.37, 1.0, -0.37);

    // Rear deck with a yellow stripe
    poly('#e0231d', -1.04, -0.4, 1.04, -0.4, 0.86, -0.52, -0.86, -0.52);
    poly('#ffd400', -0.87, -0.5, 0.87, -0.5, 0.86, -0.52, -0.86, -0.52);

    // Rear window and roof
    const glass = ctx.createLinearGradient(0, -0.52, 0, -0.8);
    glass.addColorStop(0, '#0e1526');
    glass.addColorStop(1, '#2d4570');
    poly(glass, -0.66, -0.52, 0.66, -0.52, 0.46, -0.8, -0.46, -0.8);
    poly('rgba(255, 255, 255, 0.14)', -0.36, -0.53, -0.18, -0.53, -0.26, -0.79, -0.38, -0.79);
    poly('#c3121a', -0.46, -0.8, 0.46, -0.8, 0.42, -0.85, -0.42, -0.85);

    // Rear wing
    poly('#111114', -0.58, -0.5, -0.53, -0.5, -0.53, -0.63, -0.58, -0.63);
    poly('#111114', 0.53, -0.5, 0.58, -0.5, 0.58, -0.63, 0.53, -0.63);
    poly('#1d1d22', -1.0, -0.62, 1.0, -0.62, 0.98, -0.7, -0.98, -0.7);
    poly('#e0231d', -0.98, -0.69, 0.98, -0.69, 0.97, -0.71, -0.97, -0.71);

    ctx.globalCompositeOperation = 'lighter';

    // Tail light glow
    if (this.bassSmooth > 0.05) {
      for (const x of [-0.74, 0.74]) {
        const glow = ctx.createRadialGradient(x, -0.335, 0, x, -0.335, 0.5);
        glow.addColorStop(0, `rgba(255, 40, 30, ${this.bassSmooth * 0.6})`);
        glow.addColorStop(1, 'rgba(255, 40, 30, 0)');
        ctx.fillStyle = glow;
        ctx.fillRect(x - 0.5, -0.835, 1, 1);
      }
    }

    // Exhaust backfire on kick drums
    if (this.flame > 0) {
      for (const x of [-0.46, 0.46]) {
        const r = 0.08 + this.flame * 0.14;
        const fire = ctx.createRadialGradient(x, -0.1, 0, x, -0.1, r);
        fire.addColorStop(0, `rgba(210, 230, 255, ${this.flame})`);
        fire.addColorStop(0.35, `rgba(255, 170, 30, ${this.flame * 0.9})`);
        fire.addColorStop(1, 'rgba(255, 60, 0, 0)');
        ctx.fillStyle = fire;
        ctx.fillRect(x - r, -0.1 - r, r * 2, r * 2);
      }
    }

    ctx.restore();
  }

  // --- HUD -----------------------------------------------------------------

  hudText(text, x, y, size, colour, align = 'left') {
    const { ctx } = this;
    ctx.font = `italic 900 ${size}px "Arial Black", Impact, sans-serif`;
    ctx.textAlign = align;
    ctx.textBaseline = 'alphabetic';
    ctx.lineJoin = 'round';
    ctx.lineWidth = size * 0.16;
    ctx.strokeStyle = COLOURS.hudOutline;
    ctx.strokeText(text, x, y);
    ctx.fillStyle = colour;
    ctx.fillText(text, x, y);
  }

  drawHud() {
    const { ctx, width, height } = this;
    const s = Math.min(width, height) / 600;
    const margin = 24 * s;

    // Time and lap, top left.
    const minutes = Math.floor(this.lapTime / 60);
    const seconds = Math.floor(this.lapTime % 60);
    const hundredths = Math.floor((this.lapTime % 1) * 100);
    const lapTime = `${minutes}'${String(seconds).padStart(2, '0')}"${String(hundredths).padStart(2, '0')}`;
    this.hudText('TIME', margin, margin + 18 * s, 16 * s, '#ffffff');
    this.hudText(lapTime, margin, margin + 50 * s, 32 * s, COLOURS.hudYellow);
    this.hudText(`LAP ${this.lap}`, margin, margin + 78 * s, 18 * s, '#ffffff');

    // Tachometer, bottom right.
    const gear = GEAR_TOP_SPEEDS.findIndex(top => this.speed < top);
    const gearLow = gear === 0 ? 0 : GEAR_TOP_SPEEDS[gear - 1];
    const gearHigh = Number.isFinite(GEAR_TOP_SPEEDS[gear]) ? GEAR_TOP_SPEEDS[gear] : MAX_SPEED + 60;
    const rpm = 2500 + ((this.speed - gearLow) / (gearHigh - gearLow)) * 6000;

    const radius = 78 * s;
    const cx = width - margin - radius;
    const cy = height - margin - radius * 0.9;
    const start = Math.PI * 0.75;
    const sweep = Math.PI * 1.5;
    const angleFor = value => start + (value / 9000) * sweep;

    ctx.fillStyle = 'rgba(8, 10, 24, 0.55)';
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 1.08, 0, Math.PI * 2);
    ctx.fill();

    ctx.lineCap = 'butt';
    ctx.lineWidth = 7 * s;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 0.9, start, start + sweep);
    ctx.stroke();
    ctx.strokeStyle = COLOURS.hudYellow;
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 0.9, start, angleFor(Math.min(rpm, 7500)));
    ctx.stroke();
    ctx.strokeStyle = '#ff3030';
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 0.9, angleFor(7500), start + sweep);
    ctx.stroke();

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2 * s;
    for (let k = 0; k <= 9; k++) {
      const a = angleFor(k * 1000);
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * radius * 0.72, cy + Math.sin(a) * radius * 0.72);
      ctx.lineTo(cx + Math.cos(a) * radius * 0.8, cy + Math.sin(a) * radius * 0.8);
      ctx.stroke();
    }

    const needle = angleFor(rpm);
    ctx.strokeStyle = '#ff5a1f';
    ctx.lineWidth = 3 * s;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(needle) * radius * 0.85, cy + Math.sin(needle) * radius * 0.85);
    ctx.stroke();

    this.hudText(String(gear + 1), cx, cy - radius * 0.25, 30 * s, '#ffffff', 'center');
    this.hudText(String(Math.round(this.speed)), cx + radius * 0.35, cy + radius * 0.62, 40 * s, COLOURS.hudYellow, 'right');
    this.hudText('km/h', cx + radius * 0.4, cy + radius * 0.62, 13 * s, '#ffffff', 'left');
  }
}
