import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.resolve(__dirname, '../frontend/public/data');
const LAYERS_DIR = path.join(DATA_DIR, 'layers');

if (fs.existsSync(LAYERS_DIR)) {
  for (const f of fs.readdirSync(LAYERS_DIR)) {
    fs.unlinkSync(path.join(LAYERS_DIR, f));
  }
} else {
  fs.mkdirSync(LAYERS_DIR, { recursive: true });
}

const palette = JSON.parse(
  fs.readFileSync(path.join(DATA_DIR, 'palette.json'), 'utf-8')
);

// ============================================================================
// 1. ORGANIC MULTI-PEAK 3D TOPOGRAPHY & FOREST TREES
// ============================================================================
const MIN_X = -370;
const MAX_X = 320;
const MIN_Z = -410;
const MAX_Z = 570;

function getValleyStreamX(z) {
  return Math.round(-276 + Math.sin(z * 0.026) * 14 + Math.cos(z * 0.055) * 5);
}

function ridgeNoise(x, z) {
  const n1 = Math.sin(x * 0.032 + z * 0.021) * Math.cos(z * 0.028 - x * 0.019);
  const n2 = Math.sin(x * 0.075 - z * 0.065) * 0.45;
  const n3 = Math.cos(x * 0.14 + z * 0.12) * 0.2;
  return (1 - Math.abs(n1)) * 12 + n2 * 6 + n3 * 3;
}

function smoothstep(edge0, edge1, x) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function gaussianPeak(x, z, px, pz, rx, rz, height) {
  const dx = (x - px) / rx;
  const dz = (z - pz) / rz;
  return height * Math.exp(-(dx * dx + dz * dz));
}

function computeMountainHeight(x, z) {
  const rNoise = ridgeNoise(x, z);

  // 1. Western Cliff Boundary (Separates the low-lying NW FIELDS / Valley from the Mountain Massif)
  // On basgiath-map.jpg, the low-lying FIELDS are ONLY in the North-West (x < -178, z < 205).
  // South of the Ravine (z >= 218), the entire Southern Plateau (Y = 55) extends all the way to the western map edge
  // so the Scribe Quadrant (Underground) sits 100% underground beneath the Y = 55 forest plateau!
  let westCliffX = -178;
  if (z < -135) {
    westCliffX = -138 + (z + 135) * 0.28 + Math.sin(z * 0.05) * 6;
  } else if (z >= -135 && z <= 175) {
    westCliffX = -182 + Math.sin(z * 0.04) * 5;
  } else {
    // At z = 175..218, the cliff turns sharply WEST to the left edge of the map (x = -375)
    westCliffX = -182 - smoothstep(175, 218, z) * 198;
  }

  const fieldToMountain = smoothstep(westCliffX - 32, westCliffX + 2, x);

  // Sculpt the low-lying Valley (FIELDS, Presentation Meadow & Threshing Glade):
  // Flat Y = 16 across the Presentation Meadow, Threshing Clearing, Valley Stream & Pastures,
  // with gentle rolling wooded hills (Y = 17..24) along the outer western/northern rim!
  let fieldsHeight =
    16 +
    Math.round(
      Math.max(0, Math.sin(x * 0.028 + z * 0.022) * 3.2 + Math.cos(x * 0.05 - z * 0.04) * 1.8)
    );
  // Keep Presentation Meadow (-268..-192, -104..-20), Threshing Clearing (r=30 around -312, -188), Pastures & Stream level at Y = 16
  const dxThresh = x + 312;
  const dzThresh = z + 188;
  const inPresentationArea = x >= -270 && x <= -190 && z >= -106 && z <= -18;
  const inThreshingGlade = dxThresh * dxThresh + dzThresh * dzThresh <= 32 * 32;
  const inPastureArea = x >= -336 && x <= -222 && z >= 16 && z <= 122;
  const distStream = Math.abs(x - getValleyStreamX(z));
  if (inPresentationArea || inThreshingGlade || inPastureArea || distStream <= 8) {
    fieldsHeight = 16;
  }

  // 2. Ravine & Main Plateau Profile
  const ravineCenterZ = 155 + Math.sin(x * 0.025) * 13 - x * 0.035;
  const dRav = z - ravineCenterZ;

  let plateauH = 55;

  if (Math.abs(dRav) <= 72) {
    const absD = Math.abs(dRav);
    if (absD <= 13) {
      return -30; // Riverbed
    } else if (dRav > 0) {
      // South Ravine Cliff (-30 up to Y=55)
      const t = smoothstep(13, 72, dRav);
      plateauH = -30 + Math.pow(t, 0.82) * 85 + (1 - t) * (rNoise - 6) * 0.45;
    } else {
      // North Ravine Cliff (-30 up to Y=80)
      const t = smoothstep(13, 72, -dRav);
      plateauH = -30 + Math.pow(t, 0.82) * 110 + (1 - t) * (rNoise - 6) * 0.5;
    }
  } else if (dRav > 72) {
    // South Campus Plateau (Y = 55) + surrounding forested hills
    plateauH = 55;
    if (x > 165) {
      plateauH += smoothstep(165, 255, x) * 22 + rNoise * 0.45;
    }
    if (z > 562) {
      plateauH += smoothstep(562, 575, z) * 10 + rNoise * 0.35;
    }
  } else {
    // North of Ravine: Riders Quadrant (Y = 80) + Spacious Alpine Approach + Distant Gauntlet & Flight Field
    plateauH = 80;

    // Sculpted Alpine Mountain Peaks shifted far north & northeast so the Gauntlet & Flight Field have generous breathing room!
    const peakWest = gaussianPeak(x, z, -78, -305, 68, 75, 72);
    const peakNorthWall = gaussianPeak(x, z, 12, -388, 65, 48, 76);
    const peakEastGauntlet = gaussianPeak(x, z, 95, -305, 62, 75, 74);
    const peakFarNE = gaussianPeak(x, z, 265, -330, 75, 65, 66);

    // Smoothly rising mountain shoulder for the Flight Field far in the NE (Y = 132)
    const flightFieldShoulder =
      smoothstep(118, 162, x) * smoothstep(-10, -140, z) * 52;

    const mountainAdd = Math.max(
      peakWest + rNoise * 0.65,
      peakNorthWall + rNoise * 0.65,
      peakEastGauntlet + rNoise * 0.65,
      peakFarNE + rNoise * 0.5,
      flightFieldShoulder
    );

    if (z < -172 || x > 126) {
      const blendIn = Math.max(smoothstep(-172, -220, z), smoothstep(126, 162, x));
      plateauH = 80 + blendIn * mountainAdd;
    }

    // Carve the long, dramatic Gauntlet Canyon far north of the Citadel (x in [-48, 72], z in [-392, -168])
    if (z < -168 && x > -52 && x < 76) {
      const canyonCenter = 18 + Math.sin((z + 168) * 0.038) * 14;
      const dist = Math.abs(x - canyonCenter);
      if (dist < 34) {
        // Gentle approach trail from Z=-168 to Z=-225 (Y=80..85), then steep Gauntlet climb Z=-225..-385 (Y=85..142)
        const approachT = smoothstep(-168, -225, z);
        const gauntletClimbT = smoothstep(-225, -385, z);
        const canyonFloor = 80 + approachT * 5 + gauntletClimbT * 57;
        const wallBlend = smoothstep(11, 34, dist);
        plateauH = canyonFloor * (1 - wallBlend) + plateauH * wallBlend;
      }
    }

    // Flatten the Flight Field Plateau on the distant NE mountain shoulder at Y = 132 (Center: X = 242, Z = -218)
    // Extended westward to X = 142..308 so Violet & Xaden's Tree at (174, -238) and its surrounding grove sit on 100% solid mountain ground!
    if (x >= 142 && x <= 308 && z >= -292 && z <= -136) {
      const edgeBlend =
        smoothstep(142, 158, x) *
        smoothstep(308, 294, x) *
        smoothstep(-292, -274, z) *
        smoothstep(-136, -150, z);
      plateauH = plateauH * (1 - edgeBlend) + 132 * edgeBlend;
    }

    // Flatten the entire Riders Quadrant & North Citadel footprint at Y = 80 so zero terrain clips inside buildings!
    if (x >= -184 && x <= 125 && z >= -172 && z <= 85) {
      plateauH = 80;
    }
  }

  const finalH = fieldsHeight * (1 - fieldToMountain) + plateauH * fieldToMountain;
  return Math.max(-30, Math.min(156, Math.round(finalH)));
}

const heightGrid = new Map();
for (let z = MIN_Z - 2; z <= MAX_Z + 2; z++) {
  for (let x = MIN_X - 2; x <= MAX_X + 2; x++) {
    heightGrid.set(`${x},${z}`, computeMountainHeight(x, z));
  }
}

function getH(x, z) {
  return heightGrid.get(`${x},${z}`) ?? 16;
}

// Returns true if (x, z) is within a safety margin of ANY building, tower, courtyard, bridge, or Valley lore clearing
// so forest trees never clip through walls, roofs, dragons, or the Presentation / Threshing stages!
function isNearAnyBuildingOrBridge(x, z) {
  // 1. Riders Quadrant, North Citadel, Courtyard, Outer Rampart Walls & Bastion Towers (with generous safety buffer)
  if (x >= -202 && x <= 130 && z >= -182 && z <= 95) return true;
  // 2. Flight Field Viaduct Bridge & Stone Causeway
  if (x >= 112 && x <= 230 && z >= -190 && z <= -136) return true;
  // 3. Flight Field Circular Dragon Landing Pad (Center: 242, -218, r = 52 + 5-block buffer)
  const dxPad = x - 242;
  const dzPad = z + 218;
  if (dxPad * dxPad + dzPad * dzPad <= 57 * 57) return true;
  // 4. Immediate clearing around Violet & Xaden's Hero Tree (174, -238) & Path so the bench/trunk stay clear
  const dxTree = x - 174;
  const dzTree = z + 238;
  if (dxTree * dxTree + dzTree * dzTree <= 11 * 11) return true;
  if (x >= 172 && x <= 196 && z >= -242 && z <= -222) return true;
  // 5. Gauntlet Approach Trail & Gauntlet Canyon
  if (x >= -58 && x <= 80 && z >= -400 && z <= -160) return true;
  // 6. Bridges across the Ravine (Parapet & East Bridge)
  if (z >= 70 && z <= 240 && ((x >= -130 && x <= -100) || (x >= 60 && x <= 90))) return true;
  // 7. South Campus Citadel, Scribe West Projection, Bell Tower & Corner Towers (with 10-block buffer)
  if (x >= -172 && x <= 170 && z >= 202 && z <= 568) return true;
  // 8. Valley Lore Clearings: Switchback Trail, Presentation Meadow (Kaori & Inspection Dragons), Threshing Glade, Stream & Pastures
  if (x >= -268 && x <= -168 && z >= -106 && z <= -22) return true; // Switchback Trail + Presentation Meadow
  const dxTh = x + 312;
  const dzTh = z + 188;
  if (dxTh * dxTh + dzTh * dzTh <= 25 * 25) return true; // Threshing Clearing Interior (Andarna & Tairn)
  if (x >= -315 && x <= -235 && z >= -190 && z <= -95 && Math.abs((x + 240) - (z + 95) * 0.78) <= 8) return true; // Forest trail to Threshing Glade
  if (z <= 145 && Math.abs(x - getValleyStreamX(z)) <= 6) return true; // Winding Valley Stream
  if (x >= -332 && x <= -226 && z >= 20 && z <= 116) return true; // Sheep & Cattle Pastures + Shepherd Lodge
  return false;
}

// ============================================================================
// 2. GENERATE CONTINUOUS FOREST TREES AROUND BASGIATH, FLIGHT FIELD & VALLEY
// ============================================================================
const forestTrees = [];
for (let z = MIN_Z + 12; z <= MAX_Z - 12; z += 11) {
  for (let x = MIN_X + 12; x <= MAX_X - 12; x += 11) {
    const jx = x + Math.round(Math.sin(z * 0.37) * 3);
    const jz = z + Math.round(Math.cos(x * 0.41) * 3);
    if (isNearAnyBuildingOrBridge(jx, jz)) continue;

    const h = getH(jx, jz);
    const slope =
      Math.abs(h - getH(jx + 3, jz)) +
      Math.abs(h - getH(jx - 3, jz)) +
      Math.abs(h - getH(jx, jz + 3));
    if (slope > 5) continue;

    // Continuous wooded zones across Basgiath:
    // 1. East Woods & Continuous Mountain Slope up to the Flight Field & Cliff Grove (x >= 130, z in [-295..88])
    // 2. Northern Cliff Woods west of the Gauntlet (x in [-180..-58], z in [-225..-140])
    // 3. East & West of South Campus on the Y=55 plateau (x > 172 or x < -174, z in [235..545])
    // 4. Dense, organic Threshing & Presentation Woodland across the Western Valley (x <= -195, z in [-350..150])
    const inEastAndFlightFieldWoods =
      jx >= 130 && jx <= 310 && jz >= -295 && jz <= 88 && h >= 75 && h <= 135;
    const inNorthWestMountainWoods =
      jx >= -180 && jx <= -58 && jz >= -225 && jz <= -140 && h >= 75 && h <= 118;
    const inSouthEastWoods =
      jx >= 172 && jx <= 252 && jz >= 235 && jz <= 545 && h >= 54 && h <= 82;
    const inSouthWestWoods =
      jx >= -355 && jx <= -174 && jz >= 235 && jz <= 535 && h >= 53 && h <= 62;
    const inValleyWoods =
      jx <= -196 &&
      jz >= -355 &&
      jz <= 142 &&
      h >= 15 &&
      h <= 26 &&
      Math.sin(jx * 0.065) + Math.cos(jz * 0.055) > -0.35;

    if (
      inEastAndFlightFieldWoods ||
      inNorthWestMountainWoods ||
      inSouthEastWoods ||
      inSouthWestWoods ||
      inValleyWoods
    ) {
      const isGolden = Math.abs(jx + jz) % 4 === 0;
      const isBroadOak = (h >= 120 || h <= 24) && Math.abs(jx * 3 + jz) % 3 === 0;
      forestTrees.push({
        x: jx,
        z: jz,
        baseY: h + 1,
        height: isBroadOak ? 11 + (Math.abs(jx + jz) % 4) : 8 + (Math.abs(jx * jz) % 5),
        leafMat: isGolden ? 27 : 36,
        broadCrown: isBroadOak
      });
    }
  }
}

// ============================================================================
// 3. AESTHETIC 3D BLOCK VARIATION & WEATHERING ENGINE + LAYER BUILDER
// ============================================================================
/**
 * Deterministically mixes cracked, mossy, polished, and weathered stone/brick/tile variants
 * into walls, towers, courtyards, roofs, pathways, and cliffs using 3D organic clusters + spatial hashing.
 */
function applyAestheticVariation(x, y, z, blockId) {
  // Fast deterministic 3D coordinate hash (0..99)
  const h = (((x * 73856093) ^ (y * 19349663) ^ (z * 83492791)) >>> 0) % 100;
  // Smooth 3D organic weathering cluster (-2.0 .. +2.0)
  const cluster =
    Math.sin(x * 0.16 + y * 0.22 - z * 0.18) +
    Math.cos(z * 0.14 - x * 0.19 + y * 0.15);

  switch (blockId) {
    case 1: // Deepslate Bricks (Courtyards, Foundations, Bridge Piers)
      if (cluster > 1.05 && h < 35) return 25; // Mossy Deepslate Bricks in damp clusters
      if (h < 22) return 37; // Cracked Deepslate Bricks
      if (h >= 22 && h < 36) return 38; // Polished Deepslate slabs/tiles
      return 1;

    case 2: // Chiseled Blackstone Bricks (Riders Quadrant Fortress Walls & Rotunda)
      if (h < 20) return 39; // Cracked Polished Blackstone Bricks
      if (h >= 20 && h < 34) return 3; // Polished Blackstone Bricks
      if (cluster > 1.25 && h >= 34 && h < 42) return 40; // Subtle Gilded Blackstone veins
      return 2;

    case 3: // Polished Blackstone Bricks (Towers, Pillars, Parapets, Bridges)
      if (h < 22) return 39; // Cracked Polished Blackstone Bricks
      if (h >= 22 && h < 34) return 2; // Chiseled Blackstone Bricks
      if (cluster > 1.35 && h >= 34 && h < 40) return 28; // Arcane Gold-Darkstone accent
      return 3;

    case 4: // Chiseled Andesite Bricks (South Campus Citadel Facades)
      if (cluster > 0.65 && h < 28) return 42; // Mossy Stone Bricks in weathered patches
      if (h < 22) return 41; // Cracked Stone Bricks between wall stones!
      if (h >= 22 && h < 36) return 43; // Polished Andesite blocks
      if (h >= 36 && h < 48) return 5; // Stone Bricks
      return 4;

    case 5: // Stone Bricks (Infantry Quadrant, Rampart Walls, Bell Tower)
      if (cluster > 0.55 && h < 32) return 42; // Mossy Stone Bricks along ramparts
      if (h < 25) return 41; // Cracked Stone Bricks between wall stones!
      if (h >= 25 && h < 36) return 4; // Chiseled Andesite Bricks
      if (h >= 36 && h < 44) return 43; // Polished Andesite
      return 5;

    case 6: // Chiseled Limestone Bricks (Healer Quadrant & Scribe Archive)
      if (h < 24) return 44; // Weathered / Patterned Limestone
      if (cluster > 1.1 && h >= 24 && h < 34) return 26; // Calcite veins
      return 6;

    case 8: // Steep Deepslate Tile Roofs
      if (h < 26) return 45; // Cracked Deepslate Tiles (weathered roof shingles)
      if (h >= 26 && h < 35) return 37; // Cracked Deepslate Bricks
      return 8;

    case 33: // Cobblestone Roads, Courtyards & Mountain Trails
      if (cluster > 0.45 && h < 38) return 46; // Mossy Cobblestone
      if (h < 22) return 47; // Gravel wear patches
      if (h >= 22 && h < 32) return 41; // Cracked Stone Brick paving stones
      return 33;

    case 22: // Mountain Tuff / Cliff Rock
      if (cluster > 0.35 && h < 45) return 48; // Andesite rock strata
      if (cluster < -0.85 && h < 30) return 25; // Mossy Deepslate cliff crevices
      return 22;

    default:
      return blockId;
  }
}

class LayerBuilder {
  constructor(y, label, zone, description) {
    this.y = y;
    this.label = label;
    this.zone = zone;
    this.description = description;
    this.grid = new Map();
    this.shapes = [];
  }

  setBlock(x, z, blockId) {
    const rx = Math.round(x);
    const rz = Math.round(z);
    if (rx < MIN_X || rx > MAX_X || rz < MIN_Z || rz > MAX_Z) return;
    const variedBlockId = applyAestheticVariation(rx, this.y, rz, blockId);
    this.grid.set(`${rx},${rz}`, variedBlockId);
  }

  clearBlock(x, z) {
    const rx = Math.round(x);
    const rz = Math.round(z);
    this.grid.delete(`${rx},${rz}`);
  }

  carveRect(x1, z1, x2, z2) {
    const minX = Math.min(x1, x2);
    const maxX = Math.max(x1, x2);
    const minZ = Math.min(z1, z2);
    const maxZ = Math.max(z1, z2);
    for (let z = minZ; z <= maxZ; z++) {
      for (let x = minX; x <= maxX; x++) {
        this.clearBlock(x, z);
      }
    }
  }

  carveCircle(cx, cz, r) {
    if (r <= 0) return;
    const rSq = r * r;
    for (let z = cz - r; z <= cz + r; z++) {
      for (let x = cx - r; x <= cx + r; x++) {
        if ((x - cx) * (x - cx) + (z - cz) * (z - cz) <= rSq) {
          this.clearBlock(x, z);
        }
      }
    }
  }

  carveLine(x1, z1, x2, z2, width = 3) {
    const steps = Math.max(Math.abs(x2 - x1), Math.abs(z2 - z1), 1);
    const half = Math.floor(width / 2);
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const cx = Math.round(x1 + (x2 - x1) * t);
      const cz = Math.round(z1 + (z2 - z1) * t);
      for (let dz = -half; dz <= half; dz++) {
        for (let dx = -half; dx <= half; dx++) {
          this.clearBlock(cx + dx, cz + dz);
        }
      }
    }
  }

  // Carves an open walkable doorway or Gothic pointed archway with a 3D stone/gold frame!
  carveArchway(x1, z1, x2, z2, relY, height = 8, axis = 'z', frameMat = 28, floorMat = 32) {
    if (relY < 0 || relY > height) return;
    const minX = Math.min(x1, x2);
    const maxX = Math.max(x1, x2);
    const minZ = Math.min(z1, z2);
    const maxZ = Math.max(z1, z2);

    if (relY === 0) {
      if (floorMat !== null) {
        this.addRect(minX, minZ, maxX, maxZ, floorMat, true);
      }
      return;
    }

    const archStart = Math.max(2, height - 3);
    const inset = relY > archStart ? relY - archStart : 0;

    if (axis === 'z') {
      // Passage runs North-South (along Z); width is along X [minX..maxX]
      const leftX = minX + inset;
      const rightX = maxX - inset;
      if (leftX >= rightX || relY === height) {
        this.addRect(Math.min(leftX, rightX), minZ, Math.max(leftX, rightX), maxZ, frameMat, true);
      } else {
        for (let z = minZ; z <= maxZ; z++) {
          this.setBlock(leftX, z, frameMat);
          this.setBlock(rightX, z, frameMat);
          for (let x = leftX + 1; x <= rightX - 1; x++) {
            this.clearBlock(x, z);
          }
        }
      }
    } else {
      // Passage runs West-East (along X); width is along Z [minZ..maxZ]
      const northZ = minZ + inset;
      const southZ = maxZ - inset;
      if (northZ >= southZ || relY === height) {
        this.addRect(minX, Math.min(northZ, southZ), maxX, Math.max(northZ, southZ), frameMat, true);
      } else {
        for (let x = minX; x <= maxX; x++) {
          this.setBlock(x, northZ, frameMat);
          this.setBlock(x, southZ, frameMat);
          for (let z = northZ + 1; z <= southZ - 1; z++) {
            this.clearBlock(x, z);
          }
        }
      }
    }
  }

  addRect(x1, z1, x2, z2, blockId, filled = true, thickness = 1) {
    const minX = Math.min(x1, x2);
    const maxX = Math.max(x1, x2);
    const minZ = Math.min(z1, z2);
    const maxZ = Math.max(z1, z2);
    for (let z = minZ; z <= maxZ; z++) {
      for (let x = minX; x <= maxX; x++) {
        if (
          filled ||
          x < minX + thickness ||
          x > maxX - thickness ||
          z < minZ + thickness ||
          z > maxZ - thickness
        ) {
          this.setBlock(x, z, blockId);
        }
      }
    }
  }

  addCircle(cx, cz, r, blockId, filled = false, thickness = 2) {
    if (r <= 0) return;
    const rMaxSq = r * r;
    const rMin = Math.max(0, r - thickness);
    const rMinSq = rMin * rMin;
    for (let z = cz - r; z <= cz + r; z++) {
      for (let x = cx - r; x <= cx + r; x++) {
        const dSq = (x - cx) * (x - cx) + (z - cz) * (z - cz);
        if (filled) {
          if (dSq <= rMaxSq) this.setBlock(x, z, blockId);
        } else {
          if (dSq <= rMaxSq && dSq >= rMinSq) this.setBlock(x, z, blockId);
        }
      }
    }
  }

  addLine(x1, z1, x2, z2, blockId, width = 1) {
    const steps = Math.max(Math.abs(x2 - x1), Math.abs(z2 - z1), 1);
    const half = Math.floor(width / 2);
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const cx = Math.round(x1 + (x2 - x1) * t);
      const cz = Math.round(z1 + (z2 - z1) * t);
      for (let dz = -half; dz <= half; dz++) {
        for (let dx = -half; dx <= half; dx++) {
          this.setBlock(cx + dx, cz + dz, blockId);
        }
      }
    }
  }

  // Builds a 100% gapless, watertight pitched gable roof (Satteldach) along X or Z axis
  addGableRoof(x1, z1, x2, z2, relRoofY, maxRoofH, ridgeAlongZ = true, roofMat = 8, gableWallMat = 2) {
    const minX = Math.min(x1, x2);
    const maxX = Math.max(x1, x2);
    const minZ = Math.min(z1, z2);
    const maxZ = Math.max(z1, z2);
    const span = ridgeAlongZ ? (maxX - minX) : (maxZ - minZ);
    const halfSpan = Math.floor(span / 2);

    const prevInset = Math.max(0, Math.floor(((relRoofY - 1) / Math.max(1, maxRoofH)) * halfSpan));
    const currInset = Math.min(halfSpan, Math.ceil((relRoofY / Math.max(1, maxRoofH)) * halfSpan));
    const bandWidth = Math.max(2, currInset - prevInset + 1);

    if (ridgeAlongZ) {
      // Clear attic interior beneath roof slopes so intersecting cross-roofs never clip inside!
      if (minX + currInset + 1 <= maxX - currInset - 1 && minZ + 2 <= maxZ - 2) {
        this.carveRect(minX + currInset + 1, minZ + 2, maxX - currInset - 1, maxZ - 2);
      }
      // Gable end walls on North (minZ) and South (maxZ)
      if (minX + prevInset <= maxX - prevInset) {
        this.addRect(minX + prevInset, minZ, maxX - prevInset, minZ + 1, gableWallMat, true);
        this.addRect(minX + prevInset, maxZ - 1, maxX - prevInset, maxZ, gableWallMat, true);
      }
      // Solid stepped slate roof slopes on West & East
      this.addRect(minX + prevInset, minZ, minX + prevInset + bandWidth, maxZ, roofMat, true);
      this.addRect(maxX - prevInset - bandWidth, minZ, maxX - prevInset, maxZ, roofMat, true);
      if (relRoofY >= maxRoofH) {
        this.addRect(minX + halfSpan - 2, minZ, maxX - halfSpan + 2, maxZ, roofMat, true);
      }
    } else {
      if (minZ + currInset + 1 <= maxZ - currInset - 1 && minX + 2 <= maxX - 2) {
        this.carveRect(minX + 2, minZ + currInset + 1, maxX - 2, maxZ - currInset - 1);
      }
      // Gable end walls on West (minX) and East (maxX)
      if (minZ + prevInset <= maxZ - prevInset) {
        this.addRect(minX, minZ + prevInset, minX + 1, maxZ - prevInset, gableWallMat, true);
        this.addRect(maxX - 1, minZ + prevInset, maxX, maxZ - prevInset, gableWallMat, true);
      }
      // Solid stepped slate roof slopes on North & South
      this.addRect(minX, minZ + prevInset, maxX, minZ + prevInset + bandWidth, roofMat, true);
      this.addRect(minX, maxZ - prevInset - bandWidth, maxX, maxZ - prevInset, roofMat, true);
      if (relRoofY >= maxRoofH) {
        this.addRect(minX, minZ + halfSpan - 2, maxX, maxZ - halfSpan + 2, roofMat, true);
      }
    }
  }

  toJSON() {
    const rows = new Map();
    const materialCounts = {};

    for (const [key, blockId] of this.grid.entries()) {
      const [xStr, zStr] = key.split(',');
      const x = parseInt(xStr, 10);
      const z = parseInt(zStr, 10);
      if (!rows.has(z)) rows.set(z, []);
      rows.get(z).push({ x, blockId });
      materialCounts[blockId] = (materialCounts[blockId] || 0) + 1;
    }

    const runs = [];
    const blocks = [];

    const sortedZ = Array.from(rows.keys()).sort((a, b) => a - b);
    for (const z of sortedZ) {
      const row = rows.get(z).sort((a, b) => a.x - b.x);
      let i = 0;
      while (i < row.length) {
        const startX = row[i].x;
        const blockId = row[i].blockId;
        let len = 1;
        while (
          i + len < row.length &&
          row[i + len].x === startX + len &&
          row[i + len].blockId === blockId
        ) {
          len++;
        }
        if (len >= 3) {
          runs.push([z, startX, len, blockId]);
        } else {
          for (let k = 0; k < len; k++) {
            blocks.push([startX + k, z, blockId]);
          }
        }
        i += len;
      }
    }

    return {
      y: this.y,
      label: this.label,
      zone: this.zone,
      description: this.description,
      totalBlocks: this.grid.size,
      materials: materialCounts,
      shapes: this.shapes,
      runs,
      blocks
    };
  }
}

// ============================================================================
// 4. STAMP WATERTIGHT 3D MOUNTAIN TERRAIN & TREES AT LEVEL Y
// ============================================================================
function stampMountainTerrainAtY(b, y) {
  for (let z = MIN_Z; z <= MAX_Z; z++) {
    for (let x = MIN_X; x <= MAX_X; x++) {
      const h = getH(x, z);
      const minNeighborH = Math.min(
        getH(x + 1, z),
        getH(x - 1, z),
        getH(x, z + 1),
        getH(x, z - 1)
      );

      // Watertight shell condition: fill if y is at surface OR along any vertical drop to a neighbor!
      if (y <= h && y >= minNeighborH - 1) {
        const slope = h - minNeighborH;
        if (y === -30 && h === -30) {
          b.setBlock(x, z, 21); // Ravine River
        } else if (
          y === h &&
          slope <= 2 &&
          (y <= 26 || (y >= 53 && y <= 135 && !(x >= -45 && x <= 70 && z < -200)))
        ) {
          // Lush Mountain Meadow Grass across Fields, South Campus, Eastern Slopes & Flight Field Plateau!
          b.setBlock(x, z, 23);
        } else if (y >= 137 || (y >= 133 && slope > 2 && (x + z + y) % 2 === 0)) {
          b.setBlock(x, z, 26); // High Alpine Calcite / Snow Peaks above the tree line
        } else if (y < 18) {
          b.setBlock(x, z, 25); // Deep Ravine Mossy Deepslate
        } else {
          b.setBlock(x, z, 22); // Mountain Tuff / Andesite Cliff Rock
        }
      }
    }
  }

  // Stamp 3D Pine, Broad Oak & Golden Aurum Trees across the mountain slopes, Flight Field plateau & woods
  for (const tree of forestTrees) {
    const relT = y - tree.baseY;
    if (relT >= 0 && relT < tree.height) {
      b.setBlock(tree.x, tree.z, 35); // Trunk
      if (tree.broadCrown) {
        // Broad-crowned mountain oak / aurum tree
        const crownStart = Math.floor(tree.height * 0.35);
        if (relT >= crownStart) {
          const tC = (relT - crownStart) / Math.max(1, tree.height - crownStart);
          const leafR = Math.max(1, Math.round(Math.sin(tC * Math.PI * 0.92) * 4.5));
          b.addCircle(tree.x, tree.z, leafR, tree.leafMat, true);
          if (relT < tree.height - 2) {
            b.setBlock(tree.x, tree.z, 35);
          }
        }
      } else if (relT >= 2) {
        // Conifer / Pine tree
        const leafR = Math.max(1, Math.round(((tree.height - relT) / tree.height) * 3.6));
        b.addCircle(tree.x, tree.z, leafR, tree.leafMat, true);
        if (relT < tree.height - 1) {
          b.setBlock(tree.x, tree.z, 35); // Keep trunk core inside canopy
        }
      }
    } else if (relT === tree.height) {
      b.setBlock(tree.x, tree.z, tree.leafMat); // Tree top tip
    }
  }
}

// ============================================================================
// 5. SCULPTED 3D DRAGON STATUES & ANATOMICAL 3D VOXEL DRAGONS
// ============================================================================
const dragonStatues = [
  { angleDeg: 0, blockId: 14, name: 'Schwarzer Morningstail (Tairn/Codagh)' },
  { angleDeg: 60, blockId: 15, name: 'Blauer Daggertail (Sgaeyl)' },
  { angleDeg: 120, blockId: 16, name: 'Grüner Clubtail (Teine)' },
  { angleDeg: 180, blockId: 17, name: 'Roter Swordtail (Thoirt)' },
  { angleDeg: 240, blockId: 18, name: 'Oranger Scorpiontail (Baide)' },
  { angleDeg: 300, blockId: 19, name: 'Brauner Feathertail (Deigh)' }
];

// Helper: distance from point (px, py, pz) to 3D line segment (ax, ay, az) -> (bx, by, bz)
function distToSegment3D(px, py, pz, ax, ay, az, bx, by, bz) {
  const abx = bx - ax;
  const aby = by - ay;
  const abz = bz - az;
  const apx = px - ax;
  const apy = py - ay;
  const apz = pz - az;
  const lenSq = abx * abx + aby * aby + abz * abz;
  const t = lenSq > 0 ? Math.max(0, Math.min(1, (apx * abx + apy * aby + apz * abz) / lenSq)) : 0;
  const cx = ax + t * abx - px;
  const cy = ay + t * aby - py;
  const cz = az + t * abz - pz;
  return { dist: Math.sqrt(cx * cx + cy * cy + cz * cz), t };
}

/**
 * Renders a full, anatomically detailed 3D Voxel Dragon at layer relY (1..22):
 * - 4 planted legs (muscular thighs, knees/hocks, shins, and 3 spread front talons per foot)
 * - Arched 3D ribcage/torso with armored underbelly & jagged dorsal spine spikes
 * - S-curved muscular neck, sculpted dragon skull, glowing eyes, open jaw with fire/fangs, and swept-back horns
 * - Sinuous S-curved tail with species-specific tail weapon (Morningstail, Daggertail, Feathertail)
 * - Huge 3D cambered bat-wings with shoulder->elbow leading spar, thumb claw, 4 radiating finger bones & scalloped membranes
 */
function stampDetailedDragonAtY(layer, relY, cfg) {
  const {
    cx,
    cz,
    facingDeg = 135,
    scale = 1.0,
    scaleMat = 14,
    bellyMat = 28,
    membraneMat = 2,
    hornMat = 20,
    eyeMat = 12,
    tailType = 'morningstail'
  } = cfg;

  const h = relY / scale;
  if (h < 0.5 || h > 21.5) return;

  const rad = (facingDeg * Math.PI) / 180;
  const fx = Math.cos(rad);
  const fz = Math.sin(rad);
  const rx = -fz;
  const rz = fx;

  const maxExtent = Math.ceil(38 * scale);
  const minX = Math.floor(cx - maxExtent);
  const maxX = Math.ceil(cx + maxExtent);
  const minZ = Math.floor(cz - maxExtent);
  const maxZ = Math.ceil(cz + maxExtent);

  for (let z = minZ; z <= maxZ; z++) {
    for (let x = minX; x <= maxX; x++) {
      const dx = x - cx;
      const dz = z - cz;
      // u = longitudinal (+u = forward toward snout, -u = backward toward tail)
      // v = lateral (+v = right wing, -v = left wing)
      const u = (dx * fx + dz * fz) / scale;
      const v = (dx * rx + dz * rz) / scale;
      const absV = Math.abs(v);
      const side = v >= 0 ? 1 : -1;

      if (u < -36 || u > 24 || absV > 36) continue;

      let chosenMat = 0;

      // ----------------------------------------------------------------------
      // 1. FOUR MUSCULAR LEGS & SPREAD TALONS (h = 0.5..9.0)
      // ----------------------------------------------------------------------
      if (h <= 9.5 && absV <= 11 && u >= -13 && u <= 12) {
        // Foreleg: Foot (6.0, 6.2, 1.0) -> Elbow (4.2, 5.8, 4.5) -> Shoulder (5.2, 4.2, 8.2)
        const foreLow = distToSegment3D(u, absV, h, 6.0, 6.2, 1.0, 4.2, 5.8, 4.5);
        const foreHigh = distToSegment3D(u, absV, h, 4.2, 5.8, 4.5, 5.2, 4.2, 8.2);
        if (foreLow.dist <= 1.65 || foreHigh.dist <= 1.85 + foreHigh.t * 0.6) {
          chosenMat = scaleMat;
        }
        // Hindleg: Foot (-7.0, 6.8, 1.0) -> Hock (-9.6, 6.4, 4.8) -> Haunch/Pelvis (-5.8, 4.4, 8.0)
        const hindLow = distToSegment3D(u, absV, h, -7.0, 6.8, 1.0, -9.6, 6.4, 4.8);
        const hindHigh = distToSegment3D(u, absV, h, -9.6, 6.4, 4.8, -5.8, 4.4, 8.0);
        if (hindLow.dist <= 1.75 || hindHigh.dist <= 2.15 + hindHigh.t * 0.7) {
          chosenMat = scaleMat;
        }

        // 3 Spread Claws / Talons on each foot (h <= 2.0)
        if (h <= 2.0) {
          for (const clawOffset of [-1.2, 0, 1.2]) {
            // Forefoot talons
            const fc = distToSegment3D(
              u,
              absV,
              h,
              6.5,
              6.2 + clawOffset * 0.7,
              1.0,
              9.5,
              6.4 + clawOffset * 1.3,
              0.8
            );
            // Hindfoot talons
            const hc = distToSegment3D(
              u,
              absV,
              h,
              -6.5,
              6.8 + clawOffset * 0.7,
              1.0,
              -3.5,
              7.0 + clawOffset * 1.3,
              0.8
            );
            if (fc.dist <= 0.75 || hc.dist <= 0.75) {
              chosenMat = hornMat;
            }
          }
        }
      }

      // ----------------------------------------------------------------------
      // 2. ARCHED TORSO, RIBCAGE & ARMORED UNDERBELLY (u = -11..+9, h = 4..13)
      // ----------------------------------------------------------------------
      if (u >= -11 && u <= 9 && absV <= 6.5 && h >= 4.0 && h <= 13.5) {
        const tTorso = (u + 11) / 20; // 0 at hips, 1 at chest
        const torsoCenterH = 6.8 + Math.sin(tTorso * Math.PI * 0.85) * 2.4 + tTorso * 1.2;
        const halfWidth = 3.0 + Math.sin(tTorso * Math.PI) * 2.1;
        const halfHeight = 2.6 + Math.sin(tTorso * Math.PI) * 1.1;
        const normV = absV / halfWidth;
        const normH = (h - torsoCenterH) / halfHeight;
        if (normV * normV + normH * normH <= 1.0) {
          if (h < torsoCenterH - halfHeight * 0.35 && absV < halfWidth * 0.65) {
            chosenMat = bellyMat; // Armored chest & belly plates
          } else {
            chosenMat = scaleMat;
          }
        }
      }

      // ----------------------------------------------------------------------
      // 3. S-CURVED NECK, SCULPTED SKULL, OPEN JAWS, HORNS & EYES (u = 6..23)
      // ----------------------------------------------------------------------
      if (u >= 6 && u <= 23 && absV <= 6.5 && h >= 7.5 && h <= 21.5) {
        // S-curved neck from Chest (7.0, 0, 9.2) -> Mid-Neck (11.0, 0, 12.8) -> Skull Base (14.5, 0, 16.5)
        const neck1 = distToSegment3D(u, absV, h, 7.0, 0, 9.2, 11.0, 0, 12.8);
        const neck2 = distToSegment3D(u, absV, h, 11.0, 0, 12.8, 14.5, 0, 16.5);
        const rNeck1 = 3.2 - neck1.t * 0.5;
        const rNeck2 = 2.7 - neck2.t * 0.4;
        if (neck1.dist <= rNeck1 || neck2.dist <= rNeck2) {
          chosenMat = absV <= 1.4 && h < 10.5 + (u - 7) * 0.75 ? bellyMat : scaleMat;
        }

        // Upper Skull & Snout: (14.5, 0, 16.8) -> (21.5, 0, 16.2)
        const snout = distToSegment3D(u, absV, h, 14.5, 0, 16.8, 21.5, 0, 16.2);
        const snoutR = 2.6 - snout.t * 1.15;
        if (snout.dist <= snoutR && h >= 15.6) {
          chosenMat = scaleMat;
        }

        // Lower Open Jaw: (14.8, 0, 15.5) -> (20.2, 0, 13.8)
        const jaw = distToSegment3D(u, absV, h, 14.8, 0, 15.5, 20.2, 0, 13.8);
        if (jaw.dist <= 1.8 - jaw.t * 0.7 && h <= 15.6) {
          chosenMat = bellyMat;
        }

        // Glowing Fire/Lightning Throat Core & Fangs inside open mouth
        if (u >= 15.5 && u <= 19.5 && absV <= 1.4 && h >= 14.8 && h <= 15.8) {
          if (absV >= 0.9 && Math.round(u) % 2 === 0) {
            chosenMat = 26; // Calcite Fangs
          } else if (u <= 17.5 && absV <= 0.8) {
            chosenMat = 34; // Glowing Fire Core in throat
          }
        }

        // Glowing Eyes beneath brow ridges
        if (u >= 15.8 && u <= 17.2 && absV >= 1.8 && absV <= 2.9 && h >= 17.0 && h <= 18.0) {
          chosenMat = eyeMat;
        }

        // Sweeping Twin Dragon Horns: Brow (15.0, 2.0, 17.8) -> Horn Tip (8.8, 5.2, 20.6)
        const horn = distToSegment3D(u, absV, h, 15.0, 2.0, 17.8, 8.8, 5.2, 20.6);
        if (horn.dist <= 1.25 - horn.t * 0.65) {
          chosenMat = hornMat;
        }
      }

      // ----------------------------------------------------------------------
      // 4. SINUOUS S-CURVED TAIL & TAIL WEAPON (u = -10..-35, h = 0.8..9.0)
      // ----------------------------------------------------------------------
      if (u <= -9.5 && u >= -35 && absV <= 12) {
        const tTail = Math.min(1, (-9.5 - u) / 23.0); // 0 at pelvis (-9.5), 1 at tip (-32.5)
        const tailCenterV = Math.sin(tTail * Math.PI * 1.65) * 4.8;
        const tailCenterH =
          6.5 * Math.pow(1 - tTail, 1.5) +
          1.6 * (1 - tTail) +
          (tTail > 0.65 ? Math.pow((tTail - 0.65) / 0.35, 1.4) * 4.8 : 0);
        const tailR = Math.max(0.95, 2.9 * (1 - tTail * 0.68));
        const dTail = Math.sqrt(
          (v - tailCenterV) * (v - tailCenterV) + (h - tailCenterH) * (h - tailCenterH)
        );
        if (dTail <= tailR && u >= -32.5) {
          chosenMat = scaleMat;
        }

        // Tail Weapon at the tip (u in [-35..-27])
        if (tailType === 'morningstail' && u <= -29.0 && u >= -35.0) {
          const tipV = Math.sin(1.0 * Math.PI * 1.65) * 4.8;
          const tipH = 4.8;
          const dClub = Math.sqrt(
            (u + 32.0) * (u + 32.0) + (v - tipV) * (v - tipV) + (h - tipH) * (h - tipH)
          );
          if (dClub <= 2.6) {
            chosenMat = scaleMat;
          } else if (
            dClub <= 3.9 &&
            (Math.abs(u + 32.0) < 0.9 || Math.abs(v - tipV) < 0.9 || Math.abs(h - tipH) < 0.9)
          ) {
            chosenMat = hornMat; // Projecting Morningstail Spikes!
          }
        } else if (tailType === 'feathertail' && u <= -25.5 && u >= -34.0) {
          const tipV = Math.sin(tTail * Math.PI * 1.65) * 4.8;
          const tipH = tailCenterH;
          const fanSpread = ( -25.5 - u ) * 0.85;
          if (Math.abs(v - tipV) <= 1.5 + fanSpread && Math.abs(h - tipH) <= 1.2) {
            chosenMat = Math.abs(v - tipV) > fanSpread * 0.7 ? eyeMat : hornMat;
          }
        } else if (tailType === 'daggertail' && u <= -26.0 && u >= -34.5) {
          const tipV = Math.sin(tTail * Math.PI * 1.65) * 4.8;
          const tipH = tailCenterH;
          if (Math.abs(v - tipV) <= 3.2 && Math.abs(h - tipH) <= 0.95) {
            chosenMat = Math.abs(v - tipV) > 1.6 ? 9 : scaleMat; // Razor Steel Blades
          }
        }
      }

      // ----------------------------------------------------------------------
      // 5. JAGGED DORSAL SPINE CREST ALONG NECK, BACK & TAIL
      // ----------------------------------------------------------------------
      if (u >= -27 && u <= 14) {
        let spineV = 0;
        let spineTopH = 9.5;
        if (u < -9.5) {
          const tTail = Math.min(1, (-9.5 - u) / 23.0);
          spineV = Math.sin(tTail * Math.PI * 1.65) * 4.8;
          const tailR = Math.max(0.95, 2.9 * (1 - tTail * 0.68));
          spineTopH =
            6.5 * Math.pow(1 - tTail, 1.5) +
            1.6 * (1 - tTail) +
            (tTail > 0.65 ? Math.pow((tTail - 0.65) / 0.35, 1.4) * 4.8 : 0) +
            tailR;
        } else if (u <= 7.0) {
          const tTorso = (u + 11) / 20;
          spineTopH =
            6.8 +
            Math.sin(tTorso * Math.PI * 0.85) * 2.4 +
            tTorso * 1.2 +
            2.6 +
            Math.sin(tTorso * Math.PI) * 1.1;
        } else {
          spineTopH = 11.5 + (u - 7.0) * 0.85;
        }
        const spikeWave = Math.cos(u * 1.65);
        if (
          spikeWave > 0.15 &&
          Math.abs(v - spineV) <= 0.85 &&
          h >= spineTopH - 0.5 &&
          h <= spineTopH + 1.8 * spikeWave
        ) {
          chosenMat = hornMat;
        }
      }

      // ----------------------------------------------------------------------
      // 6. COLOSSAL 3D ARCHED BAT-WINGS WITH 4 FINGER BONES & SCALLOPED MEMBRANES
      // ----------------------------------------------------------------------
      if (absV >= 3.2 && absV <= 35.5 && u >= -15 && u <= 14 && h >= 4.0 && h <= 18.5) {
        // Wing Leading Edge Spar:
        // Inner Arm: Shoulder (5.0, 4.0, 9.8) -> Wing Elbow / Thumb (10.5, 15.0, 16.2)
        // Outer Spar: Wing Elbow (10.5, 15.0, 16.2) -> Wingtip (-4.5, 35.0, 11.2)
        const leadInner = distToSegment3D(u, absV, h, 5.0, 4.0, 9.8, 10.5, 15.0, 16.2);
        const leadOuter = distToSegment3D(u, absV, h, 10.5, 15.0, 16.2, -4.5, 35.0, 11.2);
        // Thumb Claw at Wing Elbow (10.5, 15.0, 16.2) -> (13.2, 15.5, 17.2)
        const thumbClaw = distToSegment3D(u, absV, h, 10.5, 15.0, 16.2, 13.2, 15.5, 17.2);

        // 4 Radiating Wing Finger Bones from Wing Elbow (10.5, 15.0, 16.2):
        const finger1 = distToSegment3D(u, absV, h, 10.5, 15.0, 16.2, -9.5, 12.0, 6.8);
        const finger2 = distToSegment3D(u, absV, h, 10.5, 15.0, 16.2, -12.0, 20.5, 7.6);
        const finger3 = distToSegment3D(u, absV, h, 10.5, 15.0, 16.2, -10.5, 28.0, 9.2);

        if (thumbClaw.dist <= 0.9) {
          chosenMat = hornMat;
        } else if (leadInner.dist <= 1.45 || leadOuter.dist <= 1.35 - leadOuter.t * 0.4) {
          chosenMat = scaleMat;
        } else if (finger1.dist <= 1.05 || finger2.dist <= 1.05 || finger3.dist <= 1.05) {
          chosenMat = scaleMat;
        } else {
          // 3D Cambered Wing Membrane between Leading Edge and Scalloped Trailing Edge
          let uLead = 5.0;
          let hLead = 9.8;
          let uTrail = -8.0;
          let hTrail = 6.8;

          if (absV <= 15.0) {
            const tW = (absV - 4.0) / 11.0;
            uLead = 5.0 + tW * 5.5;
            hLead = 9.8 + tW * 6.4;
            const scallop = Math.sin(tW * Math.PI) * 2.2;
            uTrail = -7.0 - tW * 2.5 + scallop;
            hTrail = 7.2 - tW * 0.4;
          } else {
            const tW = (absV - 15.0) / 20.0;
            uLead = 10.5 - tW * 15.0;
            hLead = 16.2 - tW * 5.0 + Math.sin(tW * Math.PI) * 1.6;
            // 3 scalloped bays between Finger 1 (v=12), Finger 2 (v=20.5), Finger 3 (v=28), and Wingtip (v=35)
            const scallop = Math.abs(Math.sin(tW * Math.PI * 3.0)) * 2.8;
            uTrail = -11.5 + tW * 7.0 + scallop;
            hTrail = 6.8 + tW * 4.4;
          }

          if (u <= uLead && u >= uTrail) {
            const chord = Math.max(1.0, uLead - uTrail);
            const tChord = (u - uTrail) / chord; // 0 at trailing edge, 1 at leading edge
            // Vaulted 3D camber arch across the wing chord
            const camber = Math.sin(tChord * Math.PI) * 1.85;
            const targetH = hTrail + (hLead - hTrail) * tChord + camber;
            if (Math.abs(h - targetH) <= 0.95) {
              chosenMat = tChord < 0.12 ? scaleMat : membraneMat;
            }
          }
        }
      }

      if (chosenMat !== 0) {
        layer.setBlock(x, z, chosenMat);
      }
    }
  }
}

function stampDragonStatueAtY(layer, relY) {
  for (const dragon of dragonStatues) {
    const rad = (dragon.angleDeg * Math.PI) / 180;
    const baseR = 40;
    const cx = Math.cos(rad) * baseR;
    const cz = Math.sin(rad) * baseR;
    const inX = -Math.cos(rad);
    const inZ = -Math.sin(rad);
    const perpX = -inZ;
    const perpZ = inX;

    // Ornate Stepped Pedestal (relY = 1..5)
    if (relY >= 1 && relY <= 5) {
      const pr = relY === 1 ? 6 : relY === 5 ? 6 : 5;
      layer.addCircle(Math.round(cx), Math.round(cz), pr, 3, true);
      if (relY === 2 || relY === 5) {
        layer.addCircle(Math.round(cx), Math.round(cz), pr, 20, false, 1);
      }
    }

    // Dragon Lower Body, 4 Muscular Legs/Talons & Sweeping Tail with Weapon (relY = 6..12)
    if (relY >= 6 && relY <= 12) {
      const bodyRadius = relY <= 9 ? 4 : 3;
      layer.addCircle(Math.round(cx), Math.round(cz), bodyRadius, dragon.blockId, true);

      // 4 distinct legs & golden front talons gripping the pedestal rim
      for (const side of [-1, 1]) {
        const flX = cx + inX * 3.5 + perpX * side * 3.5;
        const flZ = cz + inZ * 3.5 + perpZ * side * 3.5;
        const hlX = cx - inX * 2.5 + perpX * side * 3.8;
        const hlZ = cz - inZ * 2.5 + perpZ * side * 3.8;
        layer.addCircle(Math.round(flX), Math.round(flZ), 1, relY === 6 ? 20 : dragon.blockId, true);
        layer.addCircle(Math.round(hlX), Math.round(hlZ), 1, relY === 6 ? 20 : dragon.blockId, true);
      }

      const tailLen = 11 - Math.abs(relY - 8);
      for (let t = 1; t <= tailLen; t++) {
        const tx = cx - inX * (t * 0.75) + perpX * Math.sin(t * 0.38) * 4.5;
        const tz = cz - inZ * (t * 0.75) + perpZ * Math.sin(t * 0.38) * 4.5;
        layer.addCircle(Math.round(tx), Math.round(tz), 1, dragon.blockId, true);
        if (t === tailLen && relY >= 8 && relY <= 10) {
          layer.addCircle(Math.round(tx), Math.round(tz), 2, 20, true);
        }
      }
    }

    // Chest, Dorsal Spine & Ribbed 3D Bat-Wings (relY = 13..23)
    if (relY >= 13 && relY <= 23) {
      const leanIn = (relY - 12) * 0.45;
      const bx = cx + inX * leanIn;
      const bz = cz + inZ * leanIn;
      layer.addCircle(Math.round(bx), Math.round(bz), 3, dragon.blockId, true);
      // Golden Dorsal Spine Crest
      if (relY % 2 === 1) {
        layer.setBlock(bx - inX * 3.5, bz - inZ * 3.5, 20);
      }

      const wingSpan = 7 + (relY - 12) * 1.25;
      for (const side of [-1, 1]) {
        for (let w = 3; w <= wingSpan; w++) {
          const archBack = Math.sin((w / wingSpan) * Math.PI) * 4.2;
          const wx = bx + perpX * side * w - inX * archBack;
          const wz = bz + perpZ * side * w - inZ * archBack;
          layer.setBlock(wx, wz, dragon.blockId);
          layer.setBlock(wx + inX, wz + inZ, dragon.blockId);
          // Wing Finger Ribs extending backward
          if (Math.round(w) % 4 === 0 && relY >= 16) {
            layer.setBlock(wx - inX * 2, wz - inZ * 2, 20);
            layer.setBlock(wx - inX * 3, wz - inZ * 3, dragon.blockId);
          }
          if (relY === 23 || Math.abs(w - wingSpan) < 1.2) {
            layer.setBlock(wx, wz, 20);
          }
        }
      }
    }

    // Neck, Open Jaws, Glowing Eyes & Swept-Back Horns (relY = 24..30)
    if (relY >= 24 && relY <= 30) {
      const reachIn = 5 + (relY - 24) * 1.15;
      const hx = cx + inX * reachIn;
      const hz = cz + inZ * reachIn;
      const headRadius = relY >= 27 ? 2 : 3;
      layer.addCircle(Math.round(hx), Math.round(hz), headRadius, dragon.blockId, true);

      if (relY === 26) {
        // Lower Jaw & Glowing Throat Fire
        for (let s = 1; s <= 4; s++) {
          layer.setBlock(hx + inX * s, hz + inZ * s, s === 2 ? 34 : dragon.blockId);
        }
      }
      if (relY === 27 || relY === 28) {
        // Upper Snout & Glowing Eyes
        for (let s = 1; s <= 5; s++) {
          layer.setBlock(hx + inX * s, hz + inZ * s, dragon.blockId);
        }
        layer.setBlock(hx + perpX * 2, hz + perpZ * 2, 12);
        layer.setBlock(hx - perpX * 2, hz - perpZ * 2, 12);
      }

      if (relY >= 29) {
        for (const side of [-1, 1]) {
          layer.setBlock(hx - inX * 2 + perpX * side * 2, hz - inZ * 2 + perpZ * side * 2, 20);
          layer.setBlock(hx - inX * 3 + perpX * side * 3, hz - inZ * 3 + perpZ * side * 3, 20);
          layer.setBlock(hx - inX * 4 + perpX * side * 4, hz - inZ * 4 + perpZ * side * 4, 20);
        }
      }
    }
  }
}

/**
 * Sculpts a monumental, ancient 3D Lore Tree (e.g. Violet & Xaden's First Kiss Tree at the Flight Field Cliff
 * and the Marked Ones' Listening Tree in the Riders Courtyard) with gnarled roots, twisted trunk,
 * 6 continuous wooden boughs, and a dense, 100% connected multi-lobed golden/green canopy.
 */
function stampAncientLoreTreeAtY(layer, relY, cfg) {
  const {
    cx,
    cz,
    height = 22,
    trunkMat = 35,
    primaryLeafMat = 27,
    secondaryLeafMat = 36,
    snowDusted = false
  } = cfg;

  if (relY < 1 || relY > height) return;

  // Slight organic twist of the trunk center with height
  const twistX = cx + Math.sin(relY * 0.25) * 1.1;
  const twistZ = cz + Math.cos(relY * 0.25) * 1.1;

  // 1. Sprawling Gnarled Roots (relY = 1..3)
  if (relY <= 3) {
    const numRoots = 6;
    const rootReach = 8 - relY * 2;
    for (let r = 0; r < numRoots; r++) {
      const ang = r * ((Math.PI * 2) / numRoots) + 0.25;
      for (let d = 2; d <= rootReach; d++) {
        const rx = Math.round(cx + Math.cos(ang + Math.sin(d * 0.5) * 0.2) * d);
        const rz = Math.round(cz + Math.sin(ang + Math.sin(d * 0.5) * 0.2) * d);
        layer.setBlock(rx, rz, trunkMat);
      }
    }
  }

  // 2. Massive Gnarled Trunk (relY = 1 .. Math.floor(height * 0.65))
  const trunkTop = Math.floor(height * 0.65);
  if (relY <= trunkTop) {
    const trunkR = relY <= 2 ? 3 : 2;
    layer.addCircle(Math.round(twistX), Math.round(twistZ), trunkR, trunkMat, true);
  }

  // 3. 6 Continuous Sweeping Main Boughs & Connected Multi-Lobed Canopy
  const branchAngles = [0, 1.05, 2.1, 3.14, 4.19, 5.24];
  const branchStart = Math.floor(height * 0.36);

  if (relY >= branchStart) {
    const bProgress = Math.min(1, (relY - branchStart) / Math.max(1, height - 3 - branchStart));
    const maxReach = height >= 20 ? 8.5 : 6.5;
    const reach = 1.5 + bProgress * maxReach;

    // Central Crown Dome (starts right at branchStart + 1 so all branch lobes fuse into a single solid canopy!)
    if (relY >= branchStart + 1) {
      const crownT = (relY - (branchStart + 1)) / Math.max(1, height - (branchStart + 1));
      const baseCrownR = height >= 20 ? 10.5 : 8.0;
      const crownR = Math.max(2, Math.round(baseCrownR * Math.sin(crownT * Math.PI * 0.92)));
      for (let dz = -crownR; dz <= crownR; dz++) {
        for (let dx = -crownR; dx <= crownR; dx++) {
          if (dx * dx + dz * dz <= crownR * crownR) {
            const lx = Math.round(twistX) + dx;
            const lz = Math.round(twistZ) + dz;
            const hash = Math.abs((lx * 41 + lz * 67 + relY * 29) % 100);
            const mat =
              snowDusted && relY >= height - 1 && hash < 45
                ? 26
                : hash < 58
                ? primaryLeafMat
                : secondaryLeafMat;
            layer.setBlock(lx, lz, mat);
          }
        }
      }
    }

    // 6 Spreading Wooden Branches & Outer Leaf Lobes (relY = branchStart .. height - 2)
    if (relY <= height - 2) {
      for (let i = 0; i < branchAngles.length; i++) {
        const ang = branchAngles[i] + bProgress * 0.2;
        const bx = Math.round(twistX + Math.cos(ang) * reach);
        const bz = Math.round(twistZ + Math.sin(ang) * reach);

        // Leaf lobe around each branch
        if (relY >= branchStart + 1) {
          const clusterR = Math.max(2, Math.round(5.0 * Math.sin(bProgress * Math.PI * 0.95)));
          for (let dz = -clusterR; dz <= clusterR; dz++) {
            for (let dx = -clusterR; dx <= clusterR; dx++) {
              if (dx * dx + dz * dz <= clusterR * clusterR) {
                const lx = bx + dx;
                const lz = bz + dz;
                const hash = Math.abs((lx * 37 + lz * 53 + relY * 19) % 100);
                const mat =
                  snowDusted && relY >= height - 2 && hash < 35
                    ? 26
                    : hash < 55
                    ? primaryLeafMat
                    : secondaryLeafMat;
                layer.setBlock(lx, lz, mat);
              }
            }
          }
        }

        // Continuous wooden branch core from trunk out to (bx, bz) so zero branches disconnect!
        if (relY <= height - 4) {
          layer.addLine(Math.round(twistX), Math.round(twistZ), bx, bz, trunkMat, 1);
        }
      }
    }

    if (relY <= trunkTop + 2) {
      layer.addCircle(Math.round(twistX), Math.round(twistZ), 1, trunkMat, true);
    }
  }
}

// ============================================================================
// 6. GENERATE ALL 187 LAYERS (Y = -30 TO Y = 156, STEP = 1) WITH FULL INTERIORS!
// ============================================================================
const allLayers = [];
const sortedYLevels = [];
for (let y = -30; y <= 156; y += 1) {
  sortedYLevels.push(y);
}

for (const y of sortedYLevels) {
  let label = `Gebirgsebene (Y=${y})`;
  let zone = 'all';
  let desc = 'Topografischer Bergschnitt & Festungsstrukturen';

  if (y <= -20) {
    label = `Schlucht & Gebirgsfluss (Y=${y})`;
    zone = 'ravine';
    desc = 'Tief eingeschnittene Felsschlucht (The Ravine) unter dem Parapet';
  } else if (y >= -15 && y <= 9) {
    label = `Wardstone-Kammer (Schutzzauber-Obelisk) & Tiefe Kavernen (Y=${y})`;
    zone = 'wardstone-obelisk';
    desc = 'Uralte unterirdische Felskaverne mit dem 27 Blöcke hohen Schutzzauber-Obelisken (Wardstone), 7 Drachenfeuer-Kanälen & geheimem Runen-Stollen';
  } else if (y >= 10 && y <= 36) {
    label = `Das Tal (Vorstellen & Dreschen), Scribe-Katakomben & Wardstone-Kuppel (Y=${y})`;
    zone = y >= 16 && y <= 36 ? 'threshing-valley' : 'scribe-quadrant';
    desc =
      'Das westliche Tal (Fields): Kaoris Drachenkunde-Lehrplatz, Aufmarsch des Vorstellens (3 Drachen), Lichtung des Dreschens (Andarna & Tairn), Drachen-Weiden & Scribe-Katakomben';
  } else if (y >= 55 && y <= 69) {
    label = `Süd-Campus Zitadelle, Innenräume & Hofgärten (Y=${y})`;
    zone = 'south-campus';
    desc = 'Heiler-Krankensäle, Infanterie-Kasernen, Verwaltung, Sorrengails Büro & Drachenbrunnen im Hof';
  } else if (y >= 70 && y <= 79) {
    label = `Das Parapet, Ostbrücke & Süd-Campus Obergeschosse (Y=${y})`;
    zone = 'parapet';
    desc = 'Brücken über die 100 Blöcke tiefe Schlucht & Dächer des Süd-Campus';
  } else if (y >= 80 && y <= 110) {
    label = `Riders Quadrant, Dragon Rotunda & Innenräume (Y=${y})`;
    zone = 'dragon-rotunda';
    desc = 'Dragon Rotunda (6 Drachenstatuen), Mattenraum, Gathering Hall, Schlafsäle, Nordzitadelle & Appellplatz';
  } else if (y >= 111 && y <= 130) {
    label = `Rotunden-Kuppel, Nordburg-Türme & Gauntlet (Y=${y})`;
    zone = 'dragon-rotunda';
    desc = 'Gerippte Rotunden-Kuppel mit Kronleuchter, Ecktürme der Nordburg & Gauntlet-Hindernisse';
  } else if (y >= 131) {
    label = `Hochgebirge, Gauntlet-Gipfel & Flight Field (Y=${y})`;
    zone = 'gauntlet-flight-field';
    desc = 'Schneebedeckte Alpengipfel, vertikaler Gauntlet-Kamin, Drachen-Flugfeld & Violet/Xadens Baum';
  }

  const b = new LayerBuilder(y, label, zone, desc);

  // --------------------------------------------------------------------------
  // A) WATERTIGHT 3D MOUNTAIN LANDSCAPE & FOREST TREES
  // --------------------------------------------------------------------------
  stampMountainTerrainAtY(b, y);

  // --------------------------------------------------------------------------
  // B.0) THE WARDSTONE CHAMBER & SCHUTZZAUBER-OBELISK (Y = -12..18, Center: X = -25, Z = 378)
  // Deep inside the mountain massif beneath the South Campus, connected via:
  //  1) A secret stepped Rune Tunnel (X = -108..-60, Z = 378, Y = 10 down to Y = -11) from the Scribe Underground Archive
  //  2) A monumental subterranean Dragon Cavern Tunnel (X = -32..-18, Z = 205..342, Y = -12..3) to the Ravine Gorge
  // --------------------------------------------------------------------------
  if (y >= -12 && y <= 18) {
    const wCx = -25;
    const wCz = 378;
    const relW = y + 12; // 0..30 (0 = Floor at Y=-12, 30 = Dome Apex at Y=18)

    // Vaulted cavern radius tapers above relW = 14 into a subterranean rock dome
    const cavOuterR =
      relW <= 14
        ? 38
        : Math.max(10, Math.round(38 * Math.cos(((relW - 14) / 17) * (Math.PI / 2) * 0.88)));
    const cavInnerR = Math.max(0, cavOuterR - 3);

    // 1. Outer Ancient Blackstone & Rune Cavern Shell
    b.addCircle(wCx, wCz, cavOuterR, relW % 6 === 0 ? 28 : 2, true);

    // 2. Carve Hollow Cavern Interior (relW = 1..29)
    if (relW >= 1 && relW <= 29 && cavInnerR > 0) {
      b.carveCircle(wCx, wCz, cavInnerR);
    }

    // 3. Cavern Floor, Sunken Dragonfire Basin & 7 Breed Fire Channels (relW = 0..4)
    if (relW === 0) {
      b.addCircle(wCx, wCz, 35, 1, true);
      b.addCircle(wCx, wCz, 32, 28, false, 2);
      b.addCircle(wCx, wCz, 24, 40, false, 2);
      // Sunken Dragonfire Basin (r = 15) filled with blazing Dragonfire (#34) & Arcane Crystal (#12)
      b.addCircle(wCx, wCz, 16, 28, true);
      b.addCircle(wCx, wCz, 14, 34, true);
      b.addCircle(wCx, wCz, 10, 12, false, 2);
    } else if (relW === 1) {
      // Raised Outer Walkway & Basin Rim around the sunken Dragonfire pit
      b.addCircle(wCx, wCz, 35, 1, false, 11); // Outer ring walkway (r = 24..35)
      b.addCircle(wCx, wCz, 16, 40, false, 2); // Gilded Blackstone Basin Rim (r = 14..16)
      // 7 Radiant Dragonfire Channels & Altars for the 6 Dragon Breeds + Andarna's 7th Golden Breed!
      const breedMats = [14, 15, 16, 17, 18, 19, 20];
      for (let i = 0; i < 7; i++) {
        const ang = (i * ((Math.PI * 2) / 7)) - Math.PI / 2;
        const ax = Math.round(wCx + Math.cos(ang) * 23);
        const az = Math.round(wCz + Math.sin(ang) * 23);
        const bx = Math.round(wCx + Math.cos(ang) * 14);
        const bz = Math.round(wCz + Math.sin(ang) * 14);
        // Channel walls in breed dragonscale + blazing fire core (#34)
        b.addLine(ax, az, bx, bz, breedMats[i], 3);
        b.addLine(ax, az, bx, bz, 34, 1);
        b.addCircle(ax, az, 3, breedMats[i], true);
        b.setBlock(ax, az, 34);
      }
    } else if (relW >= 2 && relW <= 4) {
      // 7 Dragon Breed Brazier Pillars at r = 23
      const breedMats = [14, 15, 16, 17, 18, 19, 20];
      for (let i = 0; i < 7; i++) {
        const ang = (i * ((Math.PI * 2) / 7)) - Math.PI / 2;
        const ax = Math.round(wCx + Math.cos(ang) * 23);
        const az = Math.round(wCz + Math.sin(ang) * 23);
        b.addCircle(ax, az, relW === 4 ? 2 : 1, relW === 4 ? 34 : breedMats[i], true);
      }
    }

    // 4. 12 Monumental Rune Pillars around the Cavern Perimeter (relW = 1..20)
    if (relW >= 1 && relW <= 20) {
      for (let deg = 15; deg < 360; deg += 30) {
        const rad = (deg * Math.PI) / 180;
        const px = Math.round(wCx + Math.cos(rad) * 31);
        const pz = Math.round(wCz + Math.sin(rad) * 31);
        if ((px - wCx) * (px - wCx) + (pz - wCz) * (pz - wCz) <= (cavInnerR - 1) * (cavInnerR - 1)) {
          const pMat = relW % 5 === 0 ? 12 : relW % 3 === 0 ? 40 : 3;
          b.addCircle(px, pz, 2, pMat, true);
        }
      }
    }

    // 5. THE WARDSTONE OBELISK (Der 27 Blöcke hohe Schutzzauber-Obelisk im Zentrum, relW = 1..29)
    if (relW >= 1 && relW <= 29) {
      if (relW <= 4) {
        // Stepped Runic Pedestal rising out of the Dragonfire Basin
        const pedR = 8 - relW; // r = 7, 6, 5, 4
        b.addCircle(wCx, wCz, pedR, relW % 2 === 0 ? 40 : 2, true);
        b.addCircle(wCx, wCz, pedR, 28, false, 1);
      } else if (relW <= 24) {
        // Tapering Monolithic Black Obelisk Shaft (relW = 5..24, 20 blocks tall shaft!)
        const halfW = relW <= 10 ? 4 : relW <= 17 ? 3 : 2;
        b.addRect(wCx - halfW, wCz - halfW, wCx + halfW, wCz + halfW, 14, true); // Black Dragonscale / Ironstone Monolith
        // Chamfer corners on wider lower sections for an octagonal/monolithic profile
        if (halfW >= 3) {
          b.setBlock(wCx - halfW, wCz - halfW, 2);
          b.setBlock(wCx + halfW, wCz - halfW, 2);
          b.setBlock(wCx - halfW, wCz + halfW, 2);
          b.setBlock(wCx + halfW, wCz + halfW, 2);
        }
        // Glowing Carved Ward-Runes on all 4 Obelisk Faces (#12 Arcane Crystal, #34 Dragonfire, #40 Gilded Blackstone)
        const runeMat = relW % 4 === 0 ? 12 : relW % 2 === 0 ? 34 : 40;
        b.setBlock(wCx, wCz - halfW, runeMat);
        b.setBlock(wCx, wCz + halfW, runeMat);
        b.setBlock(wCx - halfW, wCz, runeMat);
        b.setBlock(wCx + halfW, wCz, runeMat);
        // Spiraling Golden Rune Band around the Obelisk
        const spiralSide = relW % 4;
        if (spiralSide === 0) b.addLine(wCx - halfW + 1, wCz - halfW, wCx + halfW - 1, wCz - halfW, 20, 1);
        if (spiralSide === 1) b.addLine(wCx + halfW, wCz - halfW + 1, wCx + halfW, wCz + halfW - 1, 20, 1);
        if (spiralSide === 2) b.addLine(wCx - halfW + 1, wCz + halfW, wCx + halfW - 1, wCz + halfW, 20, 1);
        if (spiralSide === 3) b.addLine(wCx - halfW, wCz - halfW + 1, wCx - halfW, wCz + halfW - 1, 20, 1);
      } else if (relW <= 27) {
        // Golden & Arcane Crystal Pyramidion Tip (relW = 25..27)
        const tipW = 27 - relW; // 2, 1, 0
        b.addRect(wCx - tipW, wCz - tipW, wCx + tipW, wCz + tipW, relW === 27 ? 12 : 20, true);
      } else {
        // Vertical Ward Energy Beam shooting into the Cavern Ceiling Rune Rose (relW = 28..29)
        b.addCircle(wCx, wCz, 1, 12, true);
        if (relW === 28) {
          b.addCircle(wCx, wCz, 10, 12, false, 2);
          b.addCircle(wCx, wCz, 6, 20, false, 1);
        }
      }

      // 3 Floating Magical Ward-Resonance Rings hovering around the Obelisk (relW = 9, 15, 21)
      if (relW === 9 || relW === 15 || relW === 21) {
        const ringR = relW === 9 ? 9 : relW === 15 ? 8 : 7;
        b.addCircle(wCx, wCz, ringR, 12, false, 1);
        for (let deg = 0; deg < 360; deg += 45) {
          const rad = (deg * Math.PI) / 180;
          b.setBlock(wCx + Math.cos(rad) * ringR, wCz + Math.sin(rad) * ringR, 20);
        }
      }
    }

    // 6. Subterranean Dragon Cavern Tunnel North to the Ravine Gorge (X = -32..-18, Z = 195..342, Y = -12..2)
    if (y >= -12 && y <= 2) {
      const dRel = y + 12; // 0..14
      const archInset = dRel > 9 ? dRel - 9 : 0;
      const leftX = -33 + archInset;
      const rightX = -17 - archInset;
      for (let z = 195; z <= 343; z++) {
        if (dRel === 0) {
          b.addLine(-33, z, -17, z, 1, 1);
          b.addLine(-28, z, -22, z, 33, 1);
        } else if (dRel === 14) {
          b.addLine(leftX, z, rightX, z, 2, 1);
        } else {
          b.setBlock(leftX, z, z % 10 === 0 ? 28 : 2);
          b.setBlock(rightX, z, z % 10 === 0 ? 28 : 2);
          if (z % 10 === 0 && dRel === 6) {
            b.setBlock(leftX + 1, z, 34);
            b.setBlock(rightX - 1, z, 34);
          }
          for (let x = leftX + 1; x <= rightX - 1; x++) {
            b.clearBlock(x, z);
          }
        }
      }
    }
  }

  // --------------------------------------------------------------------------
  // B) SCRIBE QUADRANT UNDERGROUND ARCHIVES (Y = 10..22) + SPIRAL STAIR / ELEVATOR (Y = 10..55)
  // --------------------------------------------------------------------------
  if (y >= 10 && y <= 22) {
    const cx = -142;
    const cz = 378;
    const relA = y - 10; // 0..12
    const angles = [144, 156, 168, 180, 192, 204, 216];

    // 1. Stamp Outer Limestone Masonry Walls (#6) of Central Vault & 7 Radial Archive Halls
    b.addCircle(cx, cz, 38, 6, true);
    for (const deg of angles) {
      const rad = (deg * Math.PI) / 180;
      const ex = Math.round(cx + Math.cos(rad) * 102);
      const ez = Math.round(cz + Math.sin(rad) * 102);
      b.addLine(cx, cz, ex, ez, 6, 9);
    }

    // 2. Carve Walkable Hollow Interior on relA = 1..11 (relA=0 is Floor, relA=12 is Vaulted Ceiling)
    if (relA >= 1 && relA <= 11) {
      b.carveCircle(cx, cz, 35);
      // Carve the East Portal (X = -109..-103, Z = 375..381) leading into the Secret Wardstone Rune Tunnel!
      if (relA <= 7) {
        b.carveRect(-109, 375, -103, 381);
      }
      for (const deg of angles) {
        const rad = (deg * Math.PI) / 180;
        const ex = Math.round(cx + Math.cos(rad) * 99);
        const ez = Math.round(cz + Math.sin(rad) * 99);
        if (relA <= 9) {
          // Line the inside walls of the radial corridors with Bookshelves (#7), then carve 3-block walkable aisle!
          b.addLine(cx, cz, ex, ez, 7, 5);
          b.carveLine(cx, cz, ex, ez, 3);
        } else {
          // Arched limestone ceiling crown inside the radial corridors
          b.carveLine(cx, cz, ex, ez, 3);
        }
      }
      // Clear central rotunda again so radial bookshelf walls don't intrude into the rotunda
      b.carveCircle(cx, cz, 34);

      // Concentric Bookshelf Galleries inside the Underground Rotunda (relA = 1..10)
      if (relA <= 10) {
        b.addCircle(cx, cz, 28, 7, false, 2);
        b.addCircle(cx, cz, 19, 7, false, 2);
        // Carve 4 Cardinal Aisle Passages through the concentric bookshelf rings
        b.carveRect(cx - 34, cz - 2, cx + 34, cz + 2);
        b.carveRect(cx - 2, cz - 34, cx + 2, cz + 34);
      }

      // Upper Gallery Walkway at relA === 6
      if (relA === 6) {
        b.addCircle(cx, cz, 34, 29, false, 5);
      }

      // Reading Desks (#11), Red Carpets (#30) & Magelights (#12) on Ground Floor (relA === 1)
      if (relA === 1) {
        for (const deg of angles) {
          const rad = (deg * Math.PI) / 180;
          const ex = Math.round(cx + Math.cos(rad) * 98);
          const ez = Math.round(cz + Math.sin(rad) * 98);
          b.addLine(cx, cz, ex, ez, 30, 1); // Red carpet runner down every radial hall
        }
        b.addLine(cx - 33, cz, cx + 38, cz, 30, 3); // Extends East into the Secret Wardstone Tunnel!
        b.addLine(cx, cz - 33, cx, cz + 33, 30, 3);
        for (let deg = 25; deg < 360; deg += 45) {
          const rad = (deg * Math.PI) / 180;
          const dx = Math.round(cx + Math.cos(rad) * 23);
          const dz = Math.round(cz + Math.sin(rad) * 23);
          b.addRect(dx - 1, dz - 1, dx + 1, dz + 1, 11, true);
          b.setBlock(dx, dz, 12);
        }
      }
    }
  }

  // Secret Stepped Rune Tunnel connecting Scribe Underground Archive (X=-108, Y=10) to Wardstone Chamber (X=-56, Y=-11)
  // Drawn AFTER both Wardstone Chamber & Scribe Underground Archive with 2-block-thick steps so both ends are 100% open & connected!
  if (y >= -13 && y <= 19) {
    for (let x = -109; x <= -56; x++) {
      const tStep = Math.max(0, Math.min(1, (x + 107) / 49)); // 0 at Scribe Archive (-107), 1 at Wardstone Chamber (-58)
      const stepFloorY = Math.round(10 - tStep * 21); // Descends smoothly from Y=10 down to Y=-11
      const relT = y - stepFloorY;
      if (relT === -1 || relT === 0) {
        b.addLine(x, 373, x, 383, 6, 1);
        if (relT === 0) {
          b.addLine(x, 375, x, 381, 30, 1); // Continuous red carpet runner down the secret stairs
        }
      } else if (relT >= 1 && relT <= 7) {
        const inset = relT >= 6 ? relT - 5 : 0;
        const northZ = 373 + inset;
        const southZ = 383 - inset;
        b.setBlock(x, northZ, x % 6 === 0 ? 28 : 6);
        b.setBlock(x, southZ, x % 6 === 0 ? 28 : 6);
        for (let z = northZ + 1; z <= southZ - 1; z++) {
          b.clearBlock(x, z);
        }
        if (x % 8 === 0 && relT === 4) {
          b.setBlock(x, northZ + 1, 12);
          b.setBlock(x, southZ - 1, 12);
        }
      } else if (relT === 8) {
        b.addLine(x, 375, x, 381, 6, 1);
      }
    }
  }

  // Hollow Limestone Shaft with Continuous Helical Staircase & Bronze Book Elevator from Y = 10 up to Scribe West Hall (Y = 55)!
  if (y >= 10 && y <= 55) {
    const cx = -142;
    const cz = 378;
    b.addCircle(cx, cz, 10, 6, false, 2);
    b.carveCircle(cx, cz, 8);
    // Continuous spiral staircase steps climbing around the central Book Elevator (arrives at angle 0° East at Y = 55!)
    const stairAngle = ((55 - y) * 24 * Math.PI) / 180;
    const prevAngle = ((55 - (y - 1)) * 24 * Math.PI) / 180;
    const sx = Math.round(cx + Math.cos(stairAngle) * 6);
    const sz = Math.round(cz + Math.sin(stairAngle) * 6);
    const prevSx = Math.round(cx + Math.cos(prevAngle) * 6);
    const prevSz = Math.round(cz + Math.sin(prevAngle) * 6);
    b.addLine(prevSx, prevSz, sx, sz, 29, 3);
    b.addCircle(sx, sz, 2, 29, true);
    b.addCircle(cx, cz, 2, 13, true); // Central Bronze Book Elevator Mechanism
    if (y >= 11 && y <= 17) {
      // Open East/West/North/South Archways at the bottom of the shaft into the Underground Rotunda
      b.carveRect(cx - 11, cz - 2, cx + 11, cz + 2);
      b.carveRect(cx - 2, cz - 11, cx + 2, cz + 11);
      b.addLine(prevSx, prevSz, sx, sz, 29, 3);
      b.addCircle(cx, cz, 2, 13, true);
    }
  }

  // --------------------------------------------------------------------------
  // B.2) DAS WESTLICHE TAL (FIELDS): SERPENTINEN-ABSTIEG, DAS VORSTELLEN
  //      (PRESENTATION & KAORIS LEHRPLATZ), DIE LICHTUNG DES DRESCHENS
  //      (THRESHING GLADE – VIOLET, ANDARNA & TAIRN), TALBACH & DRACHEN-WEIDEN
  // --------------------------------------------------------------------------
  // 1. Serpentinen-Felsweg (Valley Switchback Staircase, Y = 16..80):
  //    Exits the West Bastion Tower (-172, -35) via an outer Upper Cliff Landing (-186, -35, Y=80),
  //    descends along the outer western cliff slope to the Mid-Cliff Bastion (-196, -89, Y=48),
  //    and turns southwards down to the Valley Gatehouse (-202, -62, Y=16).
  //    All terrain above the steps is carved open to the sky (up to Y=88) and solid masonry anchors every step into the cliff!
  if (y >= 16 && y <= 88) {
    // Helper for exact step coordinates along the two switchback legs on the outer cliff face
    const getSwitchbackPos = (sY) => {
      if (sY >= 48) {
        const t1 = (80 - sY) / 32; // 0 at Y=80 (-186, -41), 1 at Y=48 (-196, -89)
        return [Math.round(-186 - t1 * 10), Math.round(-41 - t1 * 48)];
      } else {
        const t2 = (48 - sY) / 32; // 0 at Y=48 (-198, -85), 1 at Y=16 (-202, -62)
        return [Math.round(-198 - t2 * 4), Math.round(-85 + t2 * 23)];
      }
    };

    // Upper Cliff Terrace Landing outside the West Bastion Tower Gate (X = -190..-182, Z = -41..-29, Y = 58..84)
    if (y >= 58 && y <= 80) {
      b.addRect(-190, -41, -180, -29, y === 80 ? 33 : 2, true);
      if (y === 80) {
        b.addRect(-190, -41, -182, -29, 3, false, 1);
      }
    } else if (y === 81) {
      b.addLine(-190, -41, -190, -29, 3, 1);
      b.addLine(-190, -29, -183, -29, 3, 1);
      b.carveRect(-189, -41, -183, -30); // Open northern edge at Z = -41 onto Step 80!
    } else if (y === 82) {
      b.setBlock(-190, -40, 34);
      b.setBlock(-190, -30, 34);
      b.carveRect(-189, -41, -183, -30);
    } else if (y >= 83 && y <= 87) {
      b.carveRect(-189, -41, -183, -30);
    }

    // Solid Mid-Cliff Bastion Tower at (-196, -89, r = 6) anchored from the valley floor (Y=16) up to Y=51!
    if (y >= 16 && y <= 48) {
      b.addCircle(-196, -89, 6, y === 48 ? 33 : 2, true);
      b.addRect(-196, -93, -180, -85, 2, true); // Solid masonry anchor into the eastern cliff wall!
      if (y === 48) {
        b.addCircle(-196, -89, 5, 33, true);
        b.addCircle(-196, -89, 6, 3, false, 1);
      }
    } else if (y === 49) {
      b.addCircle(-196, -89, 6, 3, false, 1);
      b.carveCircle(-196, -89, 5);
    } else if (y === 50) {
      b.setBlock(-201, -89, 34);
      b.setBlock(-196, -94, 34);
      b.carveCircle(-196, -89, 5);
    } else if (y >= 51 && y <= 88) {
      b.carveCircle(-196, -89, 5);
    }

    // First pass: Solid rock-anchored masonry substructure & continuous connected cobblestone stairs
    for (let stepY = 16; stepY <= 80; stepY++) {
      const [sx, sz] = getSwitchbackPos(stepY);
      const [nextSx, nextSz] = getSwitchbackPos(Math.max(16, stepY - 1));
      const relStep = y - stepY;

      if (relStep < 0 && y >= 16) {
        // Fill solid masonry underneath every step and anchor horizontally East into the cliff wall (up to X = -180)
        // so the staircase is 100% solid and NEVER floats or exposes a hollow cliff interior!
        const cliffAnchorX = stepY >= 48 ? -180 : -190;
        b.addRect(sx - 3, sz - 1, Math.max(sx + 3, cliffAnchorX), sz + 1, relStep === -1 ? 3 : 2, true);
      } else if (relStep === 0) {
        b.addLine(sx, sz, nextSx, nextSz, 33, 5);
        b.addRect(sx - 2, sz - 1, sx + 2, sz + 1, 33, true);
      }
    }

    // Second pass: Carve open sky above every step all the way up to Y = 88 so ZERO cliff or tower blocks ever hide the stairs!
    for (let stepY = 16; stepY <= 80; stepY++) {
      const [sx, sz] = getSwitchbackPos(stepY);
      const [nextSx, nextSz] = getSwitchbackPos(Math.max(16, stepY - 1));
      const relStep = y - stepY;
      if (relStep >= 1) {
        b.carveLine(sx, sz, nextSx, nextSz, 5);
        b.carveRect(sx - 2, sz - 1, sx + 2, sz + 1);
      }
    }

    // Third pass: Place outer & inner stone curbs, guardrails, and torch braziers along the cleared staircase edges
    for (let stepY = 16; stepY <= 80; stepY++) {
      const [sx, sz] = getSwitchbackPos(stepY);
      const relStep = y - stepY;
      if (relStep === 0 || relStep === 1) {
        b.setBlock(sx - 3, sz, relStep === 0 || stepY % 8 === 0 ? 3 : 29); // Outer western parapet & guardrail
        if (stepY >= 48) {
          b.setBlock(sx + 3, sz, 3); // Inner eastern cliff retaining curb
        }
      } else if (relStep === 2 && stepY % 8 === 0) {
        b.setBlock(sx - 3, sz, 34); // Torch brazier every 8 vertical blocks
      }
    }

    // Valley Gatehouse Arch at the bottom of the Switchback Staircase (-204, -62, Y = 16..23)
    if (y >= 16 && y <= 23) {
      const relG = y - 16;
      b.carveArchway(-206, -66, -200, -58, relG, 7, 'x', 2, 33);
      if (relG === 7) {
        b.setBlock(-206, -65, 34);
        b.setBlock(-206, -59, 34);
      }
    }
  }

  // 2. Valley Floor Lore Details: Stream, Presentation Meadow, Kaori's Arena, Threshing Glade & Pastures (Y = 16..37)
  if (y >= 16 && y <= 37) {
    const relV = y - 16; // 0..21 (Y = 16 is Valley Ground)

    // 2a) Der Talbach (Winding Valley Stream from Z = -355 down to the Ravine Cliff at Z = 135) + 2 Timber Bridges
    if (relV === 0) {
      for (let z = -355; z <= 135; z++) {
        const stX = getValleyStreamX(z);
        b.addLine(stX - 3, z, stX + 3, z, 47, 1); // River gravel banks
        b.addLine(stX - 2, z, stX + 2, z, 46, 1); // Mossy cobblestone edge
        b.addLine(stX - 1, z, stX + 1, z, 21, 1); // Flowing mountain stream
      }
    }
    // Two Rustic Timber & Stone Bridges across the Valley Stream (North Bridge at Z = -124, South Bridge at Z = 14)
    for (const brZ of [-124, 14]) {
      const stX = getValleyStreamX(brZ);
      if (relV === 0) {
        b.addRect(stX - 5, brZ - 2, stX + 5, brZ + 2, 5, false, 1);
      } else if (relV === 1) {
        b.addRect(stX - 4, brZ - 2, stX + 4, brZ + 2, 29, true); // Timber bridge deck
      } else if (relV === 2) {
        b.addLine(stX - 4, brZ - 2, stX + 4, brZ - 2, 35, 1); // North timber railing
        b.addLine(stX - 4, brZ + 2, stX + 4, brZ + 2, 35, 1); // South timber railing
        b.setBlock(stX - 4, brZ - 2, 34);
        b.setBlock(stX + 4, brZ - 2, 34);
        b.setBlock(stX - 4, brZ + 2, 34);
        b.setBlock(stX + 4, brZ + 2, 34);
      }
    }

    // 2b) DAS VORSTELLEN (PRESENTATION MEADOW) & PROFESSOR KAORIS LEHRPLATZ (X = -266..-196, Z = -100..-24)
    if (relV === 0) {
      // Main cobbled road from the Valley Gatehouse (-202, -62) to Kaori's Lecture Circle (-215, -62) and the Presentation Walk (-232, -62)
      b.addLine(-200, -62, -232, -62, 33, 5);

      // Professor Kaori's Dragonkind Lecture Amphitheater (Center: X = -212, Z = -62, r = 11)
      b.addCircle(-212, -62, 11, 6, true);
      b.addCircle(-212, -62, 9, 32, false, 1);
      b.addCircle(-212, -62, 4, 28, true); // Arcane projection dais

      // Cadet Presentation Inspection Line (Aufmarschlinie des Vorstellens: X = -232, Z = -96..-26)
      b.addRect(-234, -96, -230, -26, 33, true);
      b.addRect(-235, -96, -235, -26, 6, true); // Western border facing the dragons
      b.addRect(-229, -96, -229, -26, 6, true);

      // Scorched Dragonfire Patch on the Presentation Line (-232, -46) where a panicked cadet bolted and was torched!
      b.addCircle(-233, -46, 4, 1, true);
      b.addCircle(-233, -46, 2, 14, true);
      b.setBlock(-233, -46, 34);

      // Stone & Gravel Dragon Perch Pads on the Western side of the Presentation Meadow (X = -255)
      b.addCircle(-255, -86, 12, 47, true);
      b.addCircle(-257, -60, 13, 47, true);
      b.addCircle(-254, -34, 12, 47, true);
    }

    // Kaori's Raised Teaching Podium, Dragon-Illusion Holo-Crystal & Cadet Benches (relV = 1..5)
    if (relV === 1) {
      // Raised lectern & arcane projection pedestal at (-212, -62)
      b.addCircle(-212, -62, 3, 28, true);
      b.setBlock(-212, -62, 20);
      // 2 Curved semi-circles of Dark Oak Cadet Benches (#11) on the East side facing Kaori & the Dragons
      for (let deg = -65; deg <= 65; deg += 12) {
        const rad = (deg * Math.PI) / 180;
        b.setBlock(-212 + Math.round(Math.cos(rad) * 6), -62 + Math.round(Math.sin(rad) * 6), 11);
        b.setBlock(-212 + Math.round(Math.cos(rad) * 8), -62 + Math.round(Math.sin(rad) * 8), 11);
      }
      // Presentation Line Braziers & Banner Posts along X = -228 and X = -236
      for (let z = -94; z <= -28; z += 11) {
        b.setBlock(-228, z, 3);
        b.setBlock(-236, z, 3);
      }
    } else if (relV === 2) {
      b.setBlock(-212, -62, 11); // Kaori's Lectern
      b.setBlock(-214, -62, 12); // Arcane Signet Projection Crystal
      for (let z = -94; z <= -28; z += 11) {
        b.setBlock(-228, z, 34); // Torch Braziers along the Presentation Walk
        b.setBlock(-236, z, 34);
      }
    } else if (relV >= 3 && relV <= 5) {
      // Floating Arcane Dragon-Illusion Ring above Kaori's Podium (Kaori's Signet in Chapter 13!)
      if (relV === 4) {
        b.addCircle(-214, -62, 3, 12, false, 1);
        b.setBlock(-214, -62, 34);
      } else {
        b.setBlock(-214, -62, 12);
      }
    }

    // 3 Detailed Inspection Dragons on the Presentation Meadow (relV = 1..15) examining the Cadet Line!
    if (relV >= 1 && relV <= 15) {
      // 1) Green Clubtail Dragon (Grüner Keulenschwanz-Drache, perched North-West at -255, -86, facing East toward cadets)
      stampDetailedDragonAtY(b, relV, {
        cx: -255,
        cz: -86,
        facingDeg: 355,
        scale: 0.58,
        scaleMat: 16,     // Green Veridium Dragonscale
        bellyMat: 6,      // Limestone Underbelly
        membraneMat: 36,  // Deep Green Wing Membranes
        hornMat: 20,      // Gold Horns & Clubtail Studs
        eyeMat: 34,
        tailType: 'clubtail'
      });

      // 2) Red Swordtail Dragon (Roter Schwertschwanz-Drache, perched Center-West at -257, -60, facing East)
      stampDetailedDragonAtY(b, relV, {
        cx: -257,
        cz: -60,
        facingDeg: 0,
        scale: 0.64,
        scaleMat: 17,     // Crimson Dragonscale
        bellyMat: 3,      // Polished Blackstone Underbelly
        membraneMat: 30,  // Deep Crimson Wing Membranes
        hornMat: 9,       // Steel Swordtail Blades & Horns
        eyeMat: 34,
        tailType: 'swordtail'
      });

      // 3) Brown Scorpiontail Dragon (Brauner Skorpionschwanz-Drache, perched South-West at -254, -34, facing East)
      stampDetailedDragonAtY(b, relV, {
        cx: -254,
        cz: -34,
        facingDeg: 8,
        scale: 0.56,
        scaleMat: 19,     // Bronze/Scoria Brown Dragonscale
        bellyMat: 5,      // Cobblestone Underbelly
        membraneMat: 29,  // Dark Timber Wing Membranes
        hornMat: 20,      // Golden Scorpion Stinger & Horns
        eyeMat: 12,
        tailType: 'scorpiontail'
      });
    }

    // 2c) DIE WALDLICHTUNG DES DRESCHENS (THE THRESHING CLEARING – KAPITEL 16: VIOLET, ANDARNA & TAIRN)
    // Center: X = -312, Z = -188, surrounded by a dense ring of 10 monumental ancient trees & mossy crag boulders!
    if (relV === 0) {
      // Winding forest trail from Presentation Meadow (-232, -96) over North Stream Bridge (-264, -124) into the Threshing Glade (-312, -188)
      b.addLine(-232, -96, getValleyStreamX(-124) + 3, -124, 47, 3);
      b.addLine(getValleyStreamX(-124) - 3, -124, -295, -172, 47, 3);

      // Mossy Forest Glade Floor (Center: -312, -188, r = 24)
      b.addCircle(-312, -188, 22, 23, true);
      b.addCircle(-318, -192, 9, 46, false, 2); // Mossy stone ring around Andarna's shelter

      // Scorched Earth & Lightning Blast Crater at (-300, -180) where Tairn lands & incinerates Oren during Threshing!
      b.addCircle(-300, -180, 7, 1, true);
      b.addCircle(-300, -180, 4, 14, true);
      b.addCircle(-300, -180, 2, 34, true);
      b.setBlock(-296, -178, 12);
      b.setBlock(-303, -183, 12);
    }

    // Protective Mossy Rock Outcrop / Crag Boulders (-326, -196, relV = 0..7) where Violet shields Andarna!
    if (relV <= 7) {
      const boulderR = Math.max(1, 6 - Math.floor(relV * 0.75));
      b.addCircle(-326, -196, boulderR, relV <= 2 ? 25 : 22, true);
      if (relV <= 5) {
        b.addCircle(-321, -202, Math.max(1, 4 - Math.floor(relV * 0.7)), 46, true);
        b.addCircle(-330, -189, Math.max(1, 4 - Math.floor(relV * 0.7)), 22, true);
      }
    }

    // Golden Feathertail ANDARNA on the Threshing Clearing (-316, -191, relV = 1..12) sheltered beside the boulders!
    if (relV >= 1 && relV <= 12) {
      stampDetailedDragonAtY(b, relV, {
        cx: -316,
        cz: -191,
        facingDeg: 42,
        scale: 0.48,
        scaleMat: 20,     // Golden Feathertail Scales
        bellyMat: 6,      // Limestone Underbelly
        membraneMat: 13,  // Bronze Wing Membranes
        hornMat: 12,      // Glowing Crystal Horns & Feathertail Plume
        eyeMat: 34,
        tailType: 'feathertail'
      });
    }

    // Ring of 10 Monumental Ancient Oak & Golden Aurum Trees encircling the Threshing Glade (relV = 1..20)
    if (relV >= 1 && relV <= 20) {
      const threshingTreeRing = [
        { cx: -312, cz: -216, height: 19, pMat: 36, sMat: 27 },
        { cx: -334, cz: -208, height: 20, pMat: 27, sMat: 36 },
        { cx: -340, cz: -186, height: 18, pMat: 36, sMat: 27 },
        { cx: -332, cz: -165, height: 17, pMat: 27, sMat: 36 },
        { cx: -310, cz: -158, height: 19, pMat: 36, sMat: 27 },
        { cx: -288, cz: -166, height: 16, pMat: 27, sMat: 36 },
        { cx: -282, cz: -190, height: 18, pMat: 36, sMat: 27 },
        { cx: -290, cz: -210, height: 17, pMat: 27, sMat: 36 },
        { cx: -268, cz: -146, height: 16, pMat: 36, sMat: 27 },
        { cx: -248, cz: -116, height: 17, pMat: 27, sMat: 36 }
      ];
      for (const tt of threshingTreeRing) {
        stampAncientLoreTreeAtY(b, relV, {
          cx: tt.cx,
          cz: tt.cz,
          height: tt.height,
          trunkMat: 35,
          primaryLeafMat: tt.pMat,
          secondaryLeafMat: tt.sMat,
          snowDusted: false
        });
      }
    }

    // 2d) DRACHEN-WEIDEN & HIRTENHOF IM SÜDLICHEN TAL (SHEEP & CATTLE PASTURES FOR DRAGON FEEDING, X = -330..-230, Z = 22..114)
    if (relV === 0) {
      // Dirt & gravel pasture paths connecting South Stream Bridge (-272, 14) to the Shepherd Lodge (-246, 65) and Paddocks
      b.addLine(-232, -26, getValleyStreamX(14) + 3, 14, 47, 3);
      b.addLine(getValleyStreamX(14) - 3, 14, -295, 24, 47, 3);
      b.addLine(getValleyStreamX(14) + 3, 14, -246, 52, 47, 3);
      // Water troughs (#5 stone border, #21 water) & Golden Hay Bales (#20) inside North & South Paddocks
      b.addRect(-318, 34, -310, 38, 5, true);
      b.addRect(-317, 35, -311, 37, 21, true);
      b.addCircle(-292, 48, 4, 20, true);
      b.addRect(-318, 82, -310, 86, 5, true);
      b.addRect(-317, 83, -311, 85, 21, true);
      b.addCircle(-294, 96, 4, 20, true);
    } else if (relV === 1) {
      // Timber Fences around North Sheep Paddock (X = -326..-282, Z = 24..64) & South Cattle Paddock (X = -326..-282, Z = 72..112)
      b.addRect(-326, 24, -282, 64, 29, false, 1);
      b.addRect(-326, 72, -282, 112, 29, false, 1);
      // Hay bale tops (#20)
      b.addCircle(-292, 48, 2, 20, true);
      b.addCircle(-294, 96, 2, 20, true);
      // Grazing Sheep (#26 white wool) & Cattle (#19 brown hides) scattered in the paddocks
      const sheepCoords = [
        [-305, 32], [-312, 46], [-298, 56], [-288, 36], [-318, 54], [-302, 42]
      ];
      for (const [sx, sz] of sheepCoords) b.setBlock(sx, sz, 26);
      const cattleCoords = [
        [-306, 80], [-314, 94], [-296, 104], [-288, 84], [-316, 102]
      ];
      for (const [cxP, czP] of cattleCoords) b.addRect(cxP, czP, cxP + 1, czP, 19, true);
    }

    // Shepherd & Beastmaster Lodge (X = -256..-234, Z = 52..76, relV = 0..9)
    if (relV <= 5) {
      b.addRect(-256, 52, -234, 76, relV <= 1 ? 5 : 29, relV === 0, 2);
      if (relV >= 1 && relV <= 4) {
        b.carveRect(-254, 54, -236, 74);
        if (relV <= 3) b.carveRect(-256, 62, -254, 66); // West Doorway facing the paddocks
        if (relV === 1) {
          b.addRect(-242, 56, -238, 60, 20, true); // Fodder & grain storage inside lodge
          b.setBlock(-238, 72, 34); // Warm hearth fire
        }
      }
    } else if (relV >= 6 && relV <= 9) {
      b.addGableRoof(-257, 51, -233, 77, relV - 5, 4, true, 8, 29);
    }
  }

  // --------------------------------------------------------------------------
  // C) SOUTH CAMPUS CITADEL & DETAILED COURTYARD / INTERIORS (Y = 55..112)
  // --------------------------------------------------------------------------
  if (y >= 55 && y <= 102) {
    const relS = y - 55; // 0..47
    const isGround = relS === 0;
    const isFloor2 = relS === 9;
    const isFloor3 = relS === 18;

    // 1. GRAND CENTRAL COURTYARD (X = -54..44, Z = 242..478)
    if (isGround) {
      b.addRect(-54, 242, 47, 478, 33, true);
      // 4 Lush Courtyard Gardens with grass & stone borders
      b.addRect(-44, 265, -12, 340, 23, true);
      b.addRect(2, 265, 34, 340, 23, true);
      b.addRect(-44, 390, -12, 462, 23, true);
      b.addRect(2, 390, 34, 462, 23, true);
      // Ornamental Cross-Walkways leading directly to all 4 Quadrant Portals!
      b.addRect(-10, 242, 4, 478, 32, true);
      b.addRect(-54, 358, 47, 372, 32, true);
      b.addRect(-54, 252, 47, 264, 32, true);
    } else if (relS <= 20) {
      // Keep Courtyard airspace 100% free of any stray terrain blocks
      b.carveRect(-49, 244, 39, 477);
    }

    // Cloister Arcade Pillars around the Courtyard (relS = 1..8)
    if (relS >= 1 && relS <= 8) {
      for (let z = 255; z <= 475; z += 10) {
        if (z >= 354 && z <= 376) continue;
        if (z >= 250 && z <= 268) continue;
        b.addRect(-52, z, -50, z + 2, 6, true);
        b.addRect(40, z, 42, z + 2, 6, true);
      }
      if (relS >= 6) {
        b.addLine(-51, 268, -51, 354, 6, 3);
        b.addLine(-51, 376, -51, 476, 6, 3);
        b.addLine(41, 268, 41, 354, 6, 3);
        b.addLine(41, 376, 41, 476, 6, 3);
      }
    }
    // Central Dragon Fountain in the Courtyard (X = -5, Z = 365, relS = 0..11)
    if (relS <= 11) {
      if (relS <= 2) {
        b.addCircle(-5, 365, 14, 6, false, 2);
        b.addCircle(-5, 365, 12, 21, true);
      }
      if (relS >= 1 && relS <= 6) {
        b.addCircle(-5, 365, 4, 32, true);
      }
      if (relS === 6) {
        b.addCircle(-5, 365, 7, 6, true);
      }
      if (relS >= 7 && relS <= 11) {
        b.addCircle(-5, 365, Math.max(1, 4 - (relS - 7)), 20, true);
      }
    }
    // Courtyard Golden Aurum Trees & Benches (relS = 1..9)
    const courtyardTrees = [
      [-28, 302],
      [18, 302],
      [-28, 426],
      [18, 426]
    ];
    for (const [tx, tz] of courtyardTrees) {
      if (relS >= 1 && relS <= 6) b.setBlock(tx, tz, 35);
      if (relS >= 4 && relS <= 9) {
        b.addCircle(tx, tz, Math.max(1, 5 - Math.abs(relS - 6)), 27, true);
      }
    }

    // 2. HEALER QUADRANT (NW Wing: X = -135..-48, Z = 235..325)
    if (relS <= 18) {
      b.addRect(-135, 235, -48, 325, 6, isGround || isFloor2 || isFloor3, 3);
      if (!isGround && !isFloor2 && !isFloor3) {
        b.carveRect(-132, 238, -51, 322);
      }
      // Arched Windows
      if ((relS >= 3 && relS <= 6) || (relS >= 12 && relS <= 15)) {
        for (let z = 266; z <= 315; z += 12) {
          b.addRect(-135, z, -133, z + 4, 10, true);
          b.addRect(-50, z, -48, z + 4, 10, true);
        }
      }
      // Interior Furnishings: Hospital Beds (White Wool #31) & Herb Greenhouse
      if (relS === 1 || relS === 10) {
        b.addRect(-96, 240, -88, 322, 32, true);
        b.addRect(-130, 254, -50, 262, 32, true);
        for (let z = 268; z <= 312; z += 8) {
          b.addRect(-128, z, -118, z + 3, 31, true);
          b.addRect(-118, z, -116, z + 3, 11, true);
          b.addRect(-72, z, -62, z + 3, 31, true);
          b.addRect(-62, z, -60, z + 3, 11, true);
        }
      }
      b.carveArchway(-51, 252, -47, 264, relS, 7, 'x', 28, 32);
      b.carveArchway(-98, 322, -86, 328, relS, 7, 'z', 28, 32);
    } else if (relS <= 27) {
      b.addGableRoof(-135, 235, -48, 325, relS - 18, 9, true, 8, 6);
    }

    // 3. WEST WING & SCRIBE OVERGROUND HALL (Main Wing X = -135..-55, Z = 325..480 + West Cross-Gable Hall X = -162..-55, Z = 348..408)
    if (relS <= 18) {
      b.addRect(-135, 325, -55, 480, 5, isGround || isFloor2 || isFloor3, 3);
      b.addRect(-162, 348, -55, 408, 6, isGround || isFloor2 || isFloor3, 3);
      // Clear BOTH interior volumes so there is ZERO internal wall clipping between the Main Wing and West Cross-Gable Hall!
      if (!isGround && !isFloor2 && !isFloor3) {
        b.carveRect(-132, 328, -58, 477);
        b.carveRect(-159, 351, -58, 405);
      }
      // Preserve the Book Elevator & Continuous Spiral Staircase Landing at (-142, 378) on the Ground Floor (Y = 55)!
      if (relS <= 6) {
        b.addCircle(-142, 378, 10, 6, false, 2);
        b.carveCircle(-142, 378, 8);
        if (relS === 0) {
          // Solid Stone & Timber Landing Platform on the East side of the shaft (X = -140..-132, Z = 374..382, Y = 55)
          // connecting the top spiral step (-136, 378, Y = 55) flush into the Scribe Overground Hall!
          b.addRect(-140, 374, -132, 382, 29, true);
          b.addLine(-139, 376, -130, 378, 30, 3);
        }
        b.addCircle(-142, 378, 2, 13, true);
        // Open East Archway from the Elevator Rotunda into the Scribe Hall
        b.carveArchway(-135, 372, -130, 384, relS, 6, 'x', 28, relS === 0 ? 30 : null);
      }
      // Windows on West Cross-Gable Facade
      if ((relS >= 3 && relS <= 6) || (relS >= 12 && relS <= 15)) {
        for (let z = 356; z <= 400; z += 12) {
          b.addRect(-162, z, -160, z + 4, 10, true);
        }
      }
      if (relS === 1 || relS === 10) {
        b.addRect(-130, 361, -58, 369, 30, true); // Central Red Carpet Runner to Courtyard Portal
        for (let z = 335; z <= 468; z += 12) {
          if (z >= 354 && z <= 386) continue;
          b.addRect(-125, z, -102, z + 2, 7, true);
          b.addRect(-88, z, -68, z + 3, 11, true);
        }
      }
      // OPEN ARCHWAYS IN SCRIBE QUADRANT:
      b.carveArchway(-58, 358, -54, 372, relS, 8, 'x', 28, 32);
      b.carveArchway(-98, 322, -86, 329, relS, 7, 'z', 28, 32);
      b.carveArchway(-98, 477, -86, 484, relS, 7, 'z', 28, 32);
    } else if (relS <= 27) {
      const rY = relS - 18;
      b.addGableRoof(-135, 325, -55, 480, rY, 9, true, 8, 5);
      b.addGableRoof(-162, 348, -55, 408, rY, 9, false, 8, 6);
      // Cleanly hollow the cross-gable intersection so neither roof slices through the other's attic!
      const crossInset = Math.min(28, Math.ceil((rY / 9) * 28));
      if (351 + crossInset <= 405 - crossInset) {
        b.carveRect(-158, 351 + crossInset, -60, 405 - crossInset);
      }
    }

    // 4. ADMINISTRATION BUILDING (Massive East Wing: X = 45..135, Z = 286..480)
    if (relS <= 18) {
      b.addRect(45, 286, 135, 480, 4, isGround || isFloor2 || isFloor3, 3);
      if (!isGround && !isFloor2 && !isFloor3) {
        b.carveRect(48, 289, 132, 477);
      }
      // Windows
      if ((relS >= 3 && relS <= 6) || (relS >= 12 && relS <= 15)) {
        for (let z = 302; z <= 466; z += 12) {
          if (z >= 355 && z <= 375) continue;
          b.addRect(45, z, 47, z + 4, 10, true);
          b.addRect(133, z, 135, z + 4, 10, true);
        }
      }
      // Interior: Red Carpet Grand Corridor, Partition Walls & Officer Room Doors!
      if ((relS >= 1 && relS <= 7) || (relS >= 10 && relS <= 16)) {
        const floorRel = relS >= 10 ? relS - 9 : relS;
        b.addLine(82, 290, 82, 476, 4, 1);
        b.addLine(98, 290, 98, 476, 4, 1);
        for (let z = 310; z <= 460; z += 22) {
          b.addLine(48, z, 82, z, 4, 2);
          b.addLine(98, z, 132, z, 4, 2);
          b.carveArchway(81, z - 12, 83, z - 6, floorRel, 5, 'x', 11, 29);
          b.carveArchway(97, z - 12, 99, z - 6, floorRel, 5, 'x', 11, 29);
        }
      }
      if (relS === 1 || relS === 10) {
        b.addRect(85, 290, 95, 476, 30, true);
        b.addRect(48, 360, 95, 370, 30, true);
        for (let z = 320; z <= 455; z += 22) {
          b.addRect(58, z - 3, 72, z + 3, 11, true);
          b.addRect(108, z - 3, 122, z + 3, 11, true);
        }
      }
      b.carveArchway(44, 358, 49, 372, relS, 8, 'x', 28, 30);
      b.carveArchway(68, 283, 82, 290, relS, 8, 'z', 28, 32);
      b.carveArchway(83, 477, 97, 484, relS, 7, 'z', 28, 30);
    } else if (relS <= 28) {
      b.addGableRoof(45, 286, 135, 480, relS - 18, 10, true, 8, 4);
    }

    // 5. INFANTRY QUADRANT (South Wing: X = -135..135, Z = 480..558)
    if (relS <= 18) {
      b.addRect(-135, 480, 135, 558, 5, isGround || isFloor2 || isFloor3, 4);
      if (!isGround && !isFloor2 && !isFloor3) {
        b.carveRect(-131, 484, 131, 554);
      }
      if (relS === 1 || relS === 10) {
        for (let x = -112; x <= -25; x += 10) {
          b.addRect(x, 492, x + 4, 504, 30, true);
          b.addRect(x, 535, x + 4, 547, 30, true);
        }
        for (let x = 25; x <= 112; x += 10) {
          b.addRect(x, 492, x + 4, 504, 30, true);
          b.addRect(x, 535, x + 4, 547, 30, true);
        }
      }
      // GRAND SOUTH GATEHOUSE ARCHWAY (Walkable Tunnel from Z = 478 to Z = 560!)
      b.carveArchway(-13, 478, 7, 560, relS, 12, 'z', 28, 33);
      b.carveArchway(-15, 514, -10, 526, relS, 7, 'x', 28, 32);
      b.carveArchway(4, 514, 9, 526, relS, 7, 'x', 28, 32);
      b.carveArchway(-98, 477, -86, 484, relS, 7, 'z', 28, 32);
      b.carveArchway(83, 477, 97, 484, relS, 7, 'z', 28, 30);
    } else if (relS <= 27) {
      b.addGableRoof(-135, 480, 135, 558, relS - 18, 9, false, 8, 5);
    }

    // 6. CORNER TOWERS OF SOUTH CAMPUS (Drawn AFTER rectangular wings & roofs with carved interiors so ZERO roofs clip inside!)
    if (relS <= 42) {
      const isSpire = relS >= 26;
      const rT = isSpire ? Math.max(2, Math.round(24 * (1 - (relS - 26) / 16))) : 24;
      const tMat = isSpire ? 8 : 4;

      // --- A) NW Healer Parapet Tower (X = -115, Z = 235) ---
      // Open stairwell from Ground (relS = 0, Y = 55) up to Parapet Exit Level (relS = 17, Y = 72) so stairs are NEVER buried under a tower floor!
      if (!isSpire && !isGround) {
        b.carveCircle(-115, 235, rT - 3); // Clear any Healer wall/roof clipping inside the tower!
      }
      b.addCircle(-115, 235, rT, tMat, isGround || rT <= 4, 3);
      if (!isSpire && relS <= 17) {
        // Continuous helical staircase from South Entrance (90° at relS=0, Z=249) winding 1.5 turns to North Parapet Exit (270° at relS=17, Z=221)!
        const stairAngle = ((90 + (relS / 17) * 540) * Math.PI) / 180;
        const prevAngle = ((90 + (Math.max(0, relS - 1) / 17) * 540) * Math.PI) / 180;
        const sx = Math.round(-115 + Math.cos(stairAngle) * 14);
        const sz = Math.round(235 + Math.sin(stairAngle) * 14);
        const prevSx = Math.round(-115 + Math.cos(prevAngle) * 14);
        const prevSz = Math.round(235 + Math.sin(prevAngle) * 14);
        b.addLine(prevSx, prevSz, sx, sz, 29, 5);
        b.addCircle(sx, sz, 4, 29, true);
        b.addCircle(-115, 235, 5, 4, true); // Central masonry column supporting the spiral stairs
        if (relS === 17) {
          // Upper Parapet Landing Platform on the North side of the tower (Z = 212..226, Y = 72) leading directly onto the Parapet!
          b.addRect(-123, 212, -107, 226, 32, true);
          b.addRect(-118, 212, -112, 224, 24, true);
        }
      }
      b.carveArchway(-121, 255, -109, 262, relS, 7, 'z', 28, 32);
      if (relS >= 17 && relS <= 25) {
        b.carveArchway(-120, 209, -110, 224, relS - 17, 8, 'z', 28, 24);
      }

      // --- B) SE Gen. Sorrengail's Office Tower (X = 135, Z = 485) ---
      if (!isSpire && !isGround && !isFloor2 && !isFloor3) {
        b.carveCircle(135, 485, rT - 3); // Clear any Admin/Infantry wall or gable roof clipping inside!
      }
      b.addCircle(135, 485, rT, tMat, isGround || isFloor2 || isFloor3 || rT <= 4, 3);
      if (relS === 1 || relS === 19) {
        b.addCircle(135, 485, 13, 20, true);
        b.addCircle(135, 485, 10, 23, true);
        b.addCircle(135, 485, 4, 26, true);
        b.addRect(129, 468, 141, 473, 11, true);
        b.addCircle(135, 502, 4, 34, true);
      }
      b.carveArchway(109, 478, 118, 488, relS, 7, 'x', 28, 30);

      // --- C) SW Infantry Corner Tower (X = -135, Z = 485) ---
      if (!isSpire && !isGround && !isFloor2 && !isFloor3) {
        b.carveCircle(-135, 485, rT - 3); // Clear any Scribe/Infantry wall or gable roof clipping inside!
      }
      b.addCircle(-135, 485, rT, isSpire ? 8 : 5, isGround || isFloor2 || isFloor3 || rT <= 4, 3);
      b.carveArchway(-118, 478, -109, 488, relS, 7, 'x', 28, 32);
    }
  }

  // Bell Tower & East Bridge South Gatehouse (X = 48..102, Z = 232..286, Y = 55..114)
  if (y >= 55 && y <= 114) {
    const relB = y - 55;
    if (relB <= 42) {
      if (relB !== 0 && relB !== 20 && relB !== 28) {
        b.carveRect(52, 236, 98, 282); // Clear any adjacent roof/wall clipping inside the Bell Tower!
      }
      b.addRect(48, 232, 102, 286, 4, relB === 0 || relB === 20 || relB === 28, 4);
      b.addRect(45, 229, 53, 237, 3, true);
      b.addRect(97, 229, 105, 237, 3, true);
      b.addRect(45, 281, 53, 289, 3, true);
      b.addRect(97, 281, 105, 289, 3, true);

      // Grand Staircase inside the Bell Tower Gatehouse:
      // Starts at Z = 256 (leaving Z = 256..282 completely open for the West Courtyard Portal & South Admin Portal!)
      // and rises smoothly (2 Z-blocks per step) up to the Upper Bridge Landing (Z = 232..238, Y = 64, relB = 9)!
      if (relB === 0) {
        b.addRect(52, 254, 98, 282, 32, true);
        b.addRect(52, 256, 81, 263, 30, true); // Red carpet from West Courtyard Portal
        b.addRect(69, 254, 81, 284, 30, true); // Red carpet from South Admin Portal to Staircase base
      }
      if (relB >= 0 && relB <= 9) {
        const stepZ = 256 - relB * 2; // 256 at relB=0 (Y=55) -> 238 at relB=9 (Y=64)
        b.addRect(66, 234, 84, stepZ, 32, true);
        b.addRect(69, Math.max(234, stepZ - 3), 81, stepZ, 30, true);
        if (relB === 9) {
          // Flush Upper Landing connecting to East Viaduct Bridge at Z = 232, Y = 64
          b.addRect(64, 232, 86, 240, 32, true);
          b.addRect(69, 232, 81, 240, 33, true);
        }
      }
      b.carveArchway(46, 252, 54, 266, relB, 8, 'x', 28, 32);
      b.carveArchway(68, 282, 82, 290, relB, 8, 'z', 28, 32);
      if (relB >= 9 && relB <= 20) {
        b.carveArchway(67, 230, 83, 240, relB - 9, 10, 'z', 28, 33);
      }

      if (relB >= 28 && relB <= 38) {
        b.carveArchway(65, 231, 85, 237, relB - 28, 9, 'z', 28, null);
        b.carveArchway(65, 281, 85, 287, relB - 28, 9, 'z', 28, null);
        b.carveArchway(47, 249, 53, 269, relB - 28, 9, 'x', 28, null);
        b.carveArchway(97, 249, 103, 269, relB - 28, 9, 'x', 28, null);
        b.addCircle(75, 259, 11, 13, relB === 38, 3);
      }
    } else {
      const spireShrink = Math.round((relB - 42) * 1.6);
      if (27 - spireShrink >= 2) {
        b.addRect(48 + spireShrink, 232 + spireShrink, 102 - spireShrink, 286 - spireShrink, 8, true);
      } else {
        b.addCircle(75, 259, 2, 20, true);
      }
    }
  }

  // --------------------------------------------------------------------------
  // D) 3 VERTICALLY SLOPING & ARCHED 3D BRIDGES (WITH CLEAR ROADWAY AIRSPACE)
  // --------------------------------------------------------------------------
  // 1. EAST VIADUCT BRIDGE (X = 69..81, Z = 80..232): Rises from Y = 64 (Bell Tower) to Y = 80 (Riders Quadrant)!
  if (y >= -20 && y <= 88) {
    const pierCentersZ = [80, 118, 156, 194, 232];
    for (let z = 80; z <= 232; z++) {
      const t = (232 - z) / (232 - 80);
      const deckY = Math.round(64 + t * 16 + Math.sin(t * Math.PI) * 1.8);

      let minPierDist = 999;
      for (const pz of pierCentersZ) {
        minPierDist = Math.min(minPierDist, Math.abs(z - pz));
      }

      if (minPierDist <= 4 && y <= deckY && y >= Math.max(-20, getH(75, z) - 2)) {
        b.addLine(69, z, 81, z, 3, 1);
      }

      const archRatio = Math.min(1, Math.max(0, (minPierDist - 3) / 16));
      const archCurveDrop = Math.round((1 - archRatio * archRatio) * 14);
      const archBottomY = deckY - 2 - archCurveDrop;

      if (y >= archBottomY && y < deckY) {
        if (y >= deckY - 2 || y <= archBottomY + 2) {
          b.addLine(70, z, 80, z, y <= archBottomY + 1 ? 28 : 3, 1);
        } else {
          b.setBlock(70, z, 3);
          b.setBlock(71, z, 2);
          b.setBlock(79, z, 2);
          b.setBlock(80, z, 3);
        }
      }

      // Clear any cliff rock above the bridge deck so roadway is 100% passable!
      if (y >= deckY + 1 && y <= deckY + 6 && z > 82 && z < 230) {
        b.carveRect(71, z, 79, z);
      }

      if (y === deckY || y === deckY - 1) {
        b.addLine(72, z, 78, z, 33, 1);
        b.setBlock(71, z, 3);
        b.setBlock(79, z, 3);
      }

      if (y === deckY + 1) {
        b.setBlock(71, z, 3);
        b.setBlock(79, z, 3);
      }
      if (z % 8 === 0) {
        if (y === deckY + 2) {
          b.setBlock(71, z, 28);
          b.setBlock(79, z, 28);
        } else if (y === deckY + 3) {
          b.setBlock(71, z, 34);
          b.setBlock(79, z, 34);
        }
      }
    }
  }

  // 2. THE PARAPET / TODESPARAPET (X = -116..-114, Z = 78..214):
  if (y >= 40 && y <= 88) {
    for (let z = 78; z <= 214; z++) {
      const tP = (214 - z) / (214 - 78);
      const pDeckY = Math.round(72 + tP * 8 + Math.sin(tP * Math.PI) * 2.6);

      const endDist = Math.min(z - 78, 214 - z);
      if (endDist <= 8 && y <= pDeckY && y >= 45) {
        b.addLine(-118, z, -112, z, 1, 1);
      }

      const archDepth = endDist < 28 ? Math.round((1 - endDist / 28) * 12) : 2;
      if (y >= pDeckY - 2 - archDepth && y < pDeckY) {
        b.addLine(-116, z, -114, z, 1, 1);
      }

      if (y >= pDeckY + 1 && y <= pDeckY + 6 && z > 80 && z < 211) {
        b.carveRect(-117, z, -113, z);
      }

      if (y === pDeckY || y === pDeckY - 1) {
        b.addLine(-116, z, -114, z, 24, 1);
      }
    }
  }

  // 3. FLIGHT FIELD VIADUCT BRIDGE (X = 116..196, Z = -152..-140):
  // Rises from Y = 80 at the Riders North-East Terrace up to Y = 132 at the distant Flight Field!
  if (y >= 70 && y <= 140) {
    for (let x = 116; x <= 196; x++) {
      const tF = (x - 116) / (196 - 116);
      const ffDeckY = Math.round(80 + tF * 52);

      const pierDist = Math.min(
        Math.abs(x - 118),
        Math.abs(x - 137),
        Math.abs(x - 156),
        Math.abs(x - 175),
        Math.abs(x - 194)
      );
      if (pierDist <= 2 && y <= ffDeckY && y >= getH(x, -146) - 2) {
        b.addLine(x, -152, x, -140, 3, 1);
      }

      if (y >= ffDeckY + 1 && y <= ffDeckY + 6) {
        b.carveRect(x, -151, x, -141);
      }

      if (y >= ffDeckY - 3 && y <= ffDeckY) {
        b.addLine(x, -150, x, -142, y === ffDeckY ? 32 : 2, 1);
        b.setBlock(x, -151, 3);
        b.setBlock(x, -141, 3);
      }
      if (y === ffDeckY + 1) {
        b.setBlock(x, -151, 3);
        b.setBlock(x, -141, 3);
      }
      if (x % 8 === 0 && (y === ffDeckY + 2 || y === ffDeckY + 3)) {
        b.setBlock(x, -151, y === ffDeckY + 3 ? 34 : 28);
        b.setBlock(x, -141, y === ffDeckY + 3 ? 34 : 28);
      }
    }
  }

  // --------------------------------------------------------------------------
  // E) RIDERS QUADRANT, COURTYARD, DRAGON ROTUNDA & FURNISHED INTERIORS (Y = 80..146)
  // --------------------------------------------------------------------------
  if (y >= 80 && y <= 146) {
    const relY = y - 80; // 0..66
    const isGround = relY === 0;
    const isFloor2 = relY === 9;
    const isFloor3 = relY === 18;

    // ========================================================================
    // 1. RIDERS COURTYARD (Roll Call Plaza, Combat Pit & Outer Bastion Ramparts)
    // ========================================================================
    if (relY <= 24) {
      if (isGround) {
        // Exact polygon paving inside the angled Outer Courtyard Rampart Wall
        // ((-148, 40) -> (-172, -35) -> (-132, -135) -> (-28, -162)) so ZERO slate blocks stick out outside the wall!
        for (let cz = -160; cz <= 40; cz++) {
          let wallWestX;
          if (cz >= -35) {
            wallWestX = -172 + ((cz + 35) / 75) * 24;
          } else if (cz >= -135) {
            wallWestX = -132 - ((cz + 135) / 100) * 40;
          } else {
            wallWestX = -28 - ((cz + 162) / 27) * 104;
          }
          const minCourtX = Math.ceil(wallWestX) + 2;
          if (minCourtX <= -28) {
            b.addLine(minCourtX, cz, -28, cz, 1, 1);
          }
        }
        // Paved East Terrace & Approach to the Flight Field Viaduct Bridge (X = 34..120, Z = -156..46)
        b.addRect(34, -156, 120, 46, 1, true);
        // Grand Cobblestone Roadways across the Riders Quadrant
        b.addRect(-162, -7, -52, 7, 33, true); // West Road to Rotunda
        b.addLine(-160, 0, -160, -35, 33, 7);  // Cobblestone Road leading directly to the West Bastion Gate (-161, -35)!
        b.addRect(-121, -65, -109, 40, 33, true); // Parapet Road north to Combat Pit
        b.addRect(69, -152, 81, 84, 33, true); // East Viaduct Roadway north to Citadel & Flight Field Bridge
        b.addRect(81, -152, 118, -140, 33, true); // Turn East to Flight Field Viaduct Bridge (X=116, Z=-146)
        // 4 Sparring & Formation Quadrants in Main Courtyard
        b.addRect(-148, 8, -124, 32, 32, false, 2);
        b.addRect(-104, 8, -76, 32, 32, false, 2);
        b.addRect(-148, -50, -124, -22, 32, false, 2);
        b.addRect(-104, -50, -76, -22, 32, false, 2);
        // Circular Hand-to-Hand Combat Pit in the W/NW Courtyard (shifted cleanly inside the courtyard at -122, -78)
        b.addCircle(-122, -78, 14, 30, false, 2);
        b.addCircle(-122, -78, 12, 29, true);
        // Secluded Garden Bed for the Courtyard Listening Tree (Kapitel 6 – Treffen der Gezeichneten)
        // Placed at (-92, -118) with 27+ blocks of clearance from the outer rampart walls so ZERO leaves touch the wall!
        b.addCircle(-92, -118, 9, 32, false, 2);
        b.addCircle(-92, -118, 7, 23, true);
      }

      // The Courtyard Listening Tree (Kapitel 6: where Violet hides in the branches during the Marked Ones' secret meeting)
      if (relY >= 1 && relY <= 18) {
        stampAncientLoreTreeAtY(b, relY, {
          cx: -92,
          cz: -118,
          height: 18,
          trunkMat: 35,
          primaryLeafMat: 36,
          secondaryLeafMat: 27,
          snowDusted: false
        });
      }

      if (relY >= 1 && relY <= 4) {
        b.addRect(-68, -28, -58, -12, 3, true);
        if (relY === 4) b.addRect(-66, -26, -60, -14, 30, true);
      }

      if (relY >= 1 && relY <= 4) {
        const braziers = [
          [-75, -25],
          [-75, 15],
          [-115, -25],
          [-115, 15],
          [-148, -25],
          [-148, 15]
        ];
        for (const [bx, bz] of braziers) {
          b.addCircle(bx, bz, 1, relY === 4 ? 34 : 3, true);
        }
      }

      // Outer Courtyard Rampart Wall:
      // Connects (-148, 40) -> (-172, -35) -> (-132, -135) -> (-28, -162) [NW Corner Tower of the North Citadel!]
      if (relY <= 15) {
        const isBattlement = relY >= 13;
        if (!isBattlement || relY % 2 === 1) {
          b.addLine(-148, 40, -172, -35, isBattlement ? 3 : 2, isBattlement ? 2 : 6);
          b.addLine(-172, -35, -132, -135, isBattlement ? 3 : 2, isBattlement ? 2 : 6);
          b.addLine(-132, -135, -28, -162, isBattlement ? 3 : 2, isBattlement ? 2 : 6);
        }
        if (relY === 12) {
          b.addLine(-148, 40, -172, -35, 24, 4);
          b.addLine(-172, -35, -132, -135, 24, 4);
          b.addLine(-132, -135, -28, -162, 24, 4);
        }
      }

      const bastionTowers = [
        [-148, 40],
        [-172, -35],
        [-132, -135]
      ];
      for (const [tx, tz] of bastionTowers) {
        const isRoof = relY >= 16;
        const rB = isRoof ? Math.max(2, 11 - (relY - 16)) : 11;
        if (!isRoof && !isGround && relY !== 12) {
          b.carveCircle(tx, tz, rB - 2); // Prevent rampart walls from clipping inside bastion towers!
        }
        b.addCircle(tx, tz, rB, isRoof ? 8 : 3, isGround || relY === 12 || rB <= 3, 2);
        // Spiral stairs inside SW (-148, 40) and NW (-132, -135) Bastion Towers up to the relY = 12 Rampart Walkway!
        if ((tx !== -172) && relY >= 1 && relY <= 12) {
          if (relY === 12) b.carveCircle(tx, tz, 6);
          const bAng = ((relY * 28) * Math.PI) / 180;
          const prevBAng = (((relY - 1) * 28) * Math.PI) / 180;
          b.addLine(
            Math.round(tx + Math.cos(prevBAng) * 6),
            Math.round(tz + Math.sin(prevBAng) * 6),
            Math.round(tx + Math.cos(bAng) * 6),
            Math.round(tz + Math.sin(bAng) * 6),
            29,
            3
          );
          b.addCircle(tx, tz, 2, 3, true);
        }
      }
      // Walkable Cobblestone Gatehouse Passage straight through the West Bastion Tower (-172, -35)
      // from the Courtyard (X = -159) out to the Upper Cliff Terrace Landing (X = -184..-190, Z = -41..-29, Y = 80)!
      if (isGround) {
        b.addCircle(-172, -35, 9, 33, true);
      }
      b.carveArchway(-140, 36, -135, 44, relY, 6, 'x', 28, 32);
      b.carveArchway(-184, -39, -159, -31, relY, 7, 'x', 28, 33); // Straight Gatehouse Tunnel through West Bastion Tower to Upper Cliff Landing!
      if (relY >= 1 && relY <= 7) {
        b.carveRect(-189, -42, -184, -30); // Guarantee unobstructed transition from West Gate onto Step 80 (-186, -41)!
      }
      b.carveArchway(-136, -127, -128, -122, relY, 6, 'z', 28, 32);
    }

    // ========================================================================
    // 2. FIRST-YEARS, DORMS & GATHERING HALL (Cleanly separated outside Rotunda r=55!)
    // ========================================================================
    if (relY <= 28) {
      // --- A) FIRST-YEARS BARRACKS (X = -145..-72, Z = 40..84) ---
      if (relY <= 18) {
        b.addRect(-145, 40, -72, 84, 3, isGround || isFloor2 || isFloor3, 3);
        if (!isGround && !isFloor2 && !isFloor3) {
          b.carveRect(-142, 43, -75, 81);
        }
        if (relY === 1 || relY === 10) {
          b.addRect(-141, 43, -76, 80, 29, true);
          b.addRect(-102, 43, -94, 80, 30, true);
          for (let z = 46; z <= 75; z += 7) {
            b.addRect(-138, z, -126, z + 3, 30, true);
            b.addRect(-126, z, -124, z + 3, 31, true);
            b.addRect(-88, z, -78, z + 3, 30, true);
            b.addRect(-78, z, -76, z + 3, 31, true);
          }
        }
        b.carveArchway(-121, 39, -109, 85, relY, 9, 'z', 28, 33);
        b.carveArchway(-123, 55, -119, 65, relY, 6, 'x', 28, 29);
        b.carveArchway(-111, 55, -107, 65, relY, 6, 'x', 28, 29);
        b.carveArchway(-102, 39, -92, 44, relY, 7, 'z', 28, 30);
        b.carveArchway(-75, 67, -69, 75, relY, 7, 'x', 28, 30);
      } else if (relY <= 26) {
        b.addGableRoof(-145, 40, -72, 84, relY - 18, 8, false, 8, 3);
      }

      // --- B) UPPER-CLASS DORMS (X = -70..34, Z = 58..84 — starts at Z=58 so it never clips Rotunda r=55!) ---
      if (relY <= 18) {
        b.addRect(-70, 58, 34, 84, 3, isGround || isFloor2 || isFloor3, 3);
        if (!isGround && !isFloor2 && !isFloor3) {
          b.carveRect(-67, 61, 31, 81);
        }
        if ((relY >= 1 && relY <= 7) || (relY >= 10 && relY <= 16)) {
          const floorRel = relY >= 10 ? relY - 9 : relY;
          b.addLine(-67, 67, 31, 67, 3, 1);
          b.addLine(-67, 75, 31, 75, 3, 1);
          for (let x = -54; x <= 20; x += 14) {
            b.addLine(x, 61, x, 67, 3, 1);
            b.addLine(x, 75, x, 81, 3, 1);
          }
          for (let x = -64; x <= 18; x += 14) {
            b.carveArchway(x + 2, 66, x + 7, 68, floorRel, 5, 'z', 11, 29);
            b.carveArchway(x + 2, 74, x + 7, 76, floorRel, 5, 'z', 11, 29);
          }
        }
        if (relY === 1 || relY === 10) {
          b.addRect(-67, 68, 31, 74, 30, true);
          for (let x = -64; x <= 18; x += 14) {
            b.addRect(x, 61, x + 4, 65, 30, true);
            b.addRect(x + 6, 61, x + 9, 63, 11, true);
            b.addRect(x, 77, x + 4, 81, 30, true);
            b.addRect(x + 6, 78, x + 9, 81, 7, true);
          }
        }
        // Vaulted South Vestibule connecting Rotunda South Portal (Z=53) to Dorms North Portal (Z=58)
        if (relY <= 10) {
          b.addRect(-8, 52, 8, 60, 3, relY === 0 || relY === 10, 2);
        }
        b.carveArchway(-7, 52, 7, 61, relY, 8, 'z', 28, 30);
        b.carveArchway(-72, 67, -66, 75, relY, 7, 'x', 28, 30);
        b.carveArchway(30, 67, 39, 75, relY, 7, 'x', 28, 30);
      } else if (relY <= 25) {
        b.addGableRoof(-70, 58, 34, 84, relY - 18, 7, false, 8, 3);
      }

      // --- C) GATHERING HALL & EAST BRIDGE GATEHOUSE (X = 36..118, Z = 46..84 — outside Rotunda r=55!) ---
      if (relY <= 18) {
        b.addRect(36, 46, 118, 84, 2, isGround || isFloor3, 3);
        if (!isGround && !isFloor3) {
          b.carveRect(39, 49, 115, 81);
        }
        if (isGround) {
          b.addRect(39, 49, 115, 81, 29, true);
        }
        if (relY === 1 || relY === 2) {
          for (let z = 51; z <= 76; z += 8) {
            b.addRect(42, z, 65, z + 3, 11, true);
            b.addRect(84, z, 102, z + 3, 11, true);
          }
          b.addRect(105, 50, 114, 79, 30, true);
          b.addRect(108, 52, 111, 77, 11, true);
          b.addRect(113, 60, 117, 68, 34, true);
        }
        if (relY === 13) {
          b.addCircle(54, 65, 5, 12, false, 2);
          b.addCircle(92, 65, 5, 12, false, 2);
        }
        b.carveArchway(68, 45, 82, 85, relY, 10, 'z', 28, 33);
        b.carveArchway(66, 58, 70, 70, relY, 7, 'x', 28, 29);
        b.carveArchway(80, 58, 84, 70, relY, 7, 'x', 28, 29);
        b.carveArchway(48, 45, 60, 50, relY, 8, 'z', 28, 30);
        b.carveArchway(33, 67, 40, 75, relY, 7, 'x', 28, 30);
      } else {
        b.addGableRoof(36, 46, 118, 84, relY - 18, 10, false, 8, 2);
      }
    }

    // ========================================================================
    // 3. ACADEMIC WING & CHALLENGES SPARRING HALL (X = 60..118, Z = -58..36 — starts at X=60 outside Rotunda r=55!)
    // ========================================================================
    if (relY <= 30) {
      if (relY <= 18) {
        b.addRect(60, -58, 118, 36, 2, isGround || isFloor2 || isFloor3, 3);
        if (!isGround && !isFloor2 && !isFloor3) {
          b.carveRect(63, -55, 115, 33);
        }
        if (relY === 1) {
          b.addRect(63, -55, 115, 33, 29, true);
          const matCentersZ = [-38, -11, 16];
          for (const mz of matCentersZ) {
            b.addCircle(89, mz, 10, 20, true);
            b.addCircle(89, mz, 8, 30, true);
            b.addCircle(89, mz, 2, 28, true);
          }
          b.addRect(64, -52, 68, -12, 11, true);
          b.addRect(64, 12, 68, 30, 11, true);
          b.addRect(110, -52, 114, 30, 11, true);
        }
        if (relY >= 10 && relY <= 16) {
          const floorRel = relY - 9;
          for (let z = -48; z <= 18; z += 22) {
            b.addLine(63, z, 115, z, 3, 2);
            b.carveArchway(65, z - 2, 73, z + 2, floorRel, 5, 'z', 11, 29);
            if (relY === 10) {
              b.addRect(75, z + 5, 108, z + 8, 11, true);
              b.addRect(75, z + 11, 108, z + 14, 11, true);
              b.addRect(84, z + 17, 98, z + 19, 7, true);
            }
          }
        }
        // Vaulted East Vestibule connecting Rotunda East Portal (X=53) to Academic Wing West Portal (X=60)
        if (relY <= 10) {
          b.addRect(52, -8, 61, 8, 3, relY === 0 || relY === 10, 2);
        }
        b.carveArchway(52, -7, 63, 7, relY, 9, 'x', 28, 30);
        b.carveArchway(68, 32, 82, 37, relY, 9, 'z', 28, 33);
        b.carveArchway(68, -59, 82, -54, relY, 9, 'z', 28, 33);
      } else {
        b.addGableRoof(60, -58, 118, 36, relY - 18, 12, true, 8, 2);
      }
    }

    // ========================================================================
    // 4. RIDERS NORTH CITADEL (X = -28..88, Z = -162..-86)
    // Shifted north so its South Corner Towers (Z = -86, r = 13 -> Z = -73) have an 18-block separation
    // from the Dragon Rotunda (Z = -55) and a 15-block separation from the Academic Wing (Z = -58)!
    // ========================================================================
    if (relY <= 66) {
      if (relY <= 34) {
        const isKeepFloor = relY === 0 || relY === 11 || relY === 22 || relY === 34;
        const wallMat = relY === 10 || relY === 21 || relY === 33 ? 28 : 2;
        b.addRect(-28, -162, 88, -86, wallMat, isKeepFloor, 4);
        if (!isKeepFloor) {
          b.carveRect(-24, -158, 84, -90);
        }

        if ((relY >= 4 && relY <= 8) || (relY >= 15 && relY <= 19) || (relY >= 26 && relY <= 30)) {
          for (let x = -14; x <= 72; x += 16) {
            if (x >= 14 && x <= 36) continue;
            b.addRect(x, -162, x + 5, -159, 10, true);
            b.addRect(x, -89, x + 5, -86, 10, true);
          }
        }

        if (relY >= 1 && relY <= 8) {
          if (relY === 1) {
            b.addRect(-24, -158, 84, -90, 1, true);
            b.addRect(18, -158, 32, -90, 30, true);
            b.addRect(-24, -128, 84, -120, 30, true);
            for (let z = -148; z <= -100; z += 16) {
              b.addCircle(8, z, 2, 3, true);
              b.addCircle(42, z, 2, 3, true);
              b.setBlock(12, z, 34);
              b.setBlock(38, z, 34);
            }
          }
          for (let z = -152; z <= -102; z += 14) {
            if (z >= -132 && z <= -114) continue;
            b.addLine(-24, z, -4, z, 3, 2);
            b.addLine(-4, z, -4, z + 12, 9, 1);
            if (relY <= 5) {
              b.carveRect(-5, z + 4, -3, z + 7);
            }
          }
        }

        if (relY === 12) {
          b.addRect(-24, -158, 84, -90, 29, true);
          b.addCircle(25, -124, 12, 30, true);
          b.addCircle(25, -124, 9, 23, true);
          for (let x = -18; x <= 72; x += 20) {
            b.addRect(x, -154, x + 12, -151, 7, true);
            b.addRect(x + 2, -100, x + 10, -96, 11, true);
          }
        }

        if (relY === 23) {
          b.addRect(-24, -158, 84, -90, 32, true);
          b.addCircle(25, -124, 14, 11, false, 3);
          b.addCircle(25, -124, 4, 12, true);
        }

        // Vaulted North Vestibule Gallery connecting Rotunda North Portal (Z=-53) to Citadel South Portal (Z=-86)
        if (relY <= 11) {
          b.addRect(-8, -87, 8, -52, 3, relY === 0 || relY === 11, 2);
        }
        b.carveArchway(-7, -90, 7, -52, relY, 10, 'z', 28, 30);
        b.carveArchway(22, -90, 36, -85, relY, 10, 'z', 28, 30);
        b.carveArchway(18, -163, 32, -158, relY, 10, 'z', 28, 30);
        b.carveArchway(-29, -128, -24, -118, relY, 9, 'x', 28, 30);
        b.carveArchway(84, -128, 89, -118, relY, 9, 'x', 28, 30);
      } else if (relY <= 48) {
        b.addGableRoof(-28, -162, 88, -86, relY - 34, 14, false, 8, 2);
      }

      // 4 Towering Corner Fortress Towers on the North Citadel (Drawn AFTER Keep walls/roof with cleared interiors!)
      const keepTowers = [
        [-28, -162, 15],
        [88, -162, 15],
        [-28, -86, 13],
        [88, -86, 13]
      ];
      for (const [tx, tz, baseR] of keepTowers) {
        if (relY <= 48) {
          if (relY % 12 !== 0) {
            b.carveCircle(tx, tz, baseR - 3); // Clear any Keep wall, rampart wall, or gable roof clipping inside the tower!
          }
          const isBattlement = relY === 47 || relY === 48;
          b.addCircle(tx, tz, baseR, isBattlement ? 28 : 3, relY % 12 === 0, 3);
        } else {
          const spireR = Math.max(1, Math.round(baseR * (1 - (relY - 48) / 18)));
          b.addCircle(tx, tz, spireR, relY >= 64 ? 20 : 8, true);
        }
      }
      // Clean interior doorways connecting the 4 Corner Towers into the Citadel Keep
      b.carveArchway(-20, -155, -14, -149, relY, 7, 'x', 28, 32);
      b.carveArchway(74, -155, 80, -149, relY, 7, 'x', 28, 32);
      b.carveArchway(-20, -97, -14, -91, relY, 7, 'x', 28, 32);
      b.carveArchway(74, -97, 80, -91, relY, 7, 'x', 28, 32);
    }

    // ========================================================================
    // 5. THE DRAGON ROTUNDA (Center X=0, Z=0, Ø 111 -> r=55, Y=80..124 — Drawn LAST with cleared interior!)
    // ========================================================================
    if (relY <= 30) {
      if (!isGround) {
        b.carveCircle(0, 0, 52); // Guarantee 100% clip-free interior inside the Dragon Rotunda!
      }
      const wallMat = relY === 2 || relY === 15 || relY === 28 ? 28 : 2;
      b.addCircle(0, 0, 55, wallMat, isGround, 3);

      if ((relY >= 5 && relY <= 13) || (relY >= 17 && relY <= 26)) {
        for (let deg = 15; deg < 360; deg += 30) {
          const rad = (deg * Math.PI) / 180;
          const wx = Math.round(Math.cos(rad) * 54);
          const wz = Math.round(Math.sin(rad) * 54);
          b.addCircle(wx, wz, 3, 10, true);
        }
      }

      for (let deg = 0; deg < 360; deg += 30) {
        if (deg === 0 || deg === 90 || deg === 180 || deg === 270) continue;
        const rad = (deg * Math.PI) / 180;
        b.addCircle(Math.round(Math.cos(rad) * 54), Math.round(Math.sin(rad) * 54), 3, 3, true);
      }

      if (relY === 14) {
        b.addCircle(0, 0, 52, 29, false, 7);
      }

      if (relY <= 2) {
        b.addCircle(0, 0, 15, 3, true);
        b.addCircle(0, 0, 13, 20, false, 1);
        b.addCircle(0, 0, 11, 23, true);
        b.addLine(-6, -4, 5, 6, 26, 3);
        b.addLine(-8, 2, 7, -3, 21, 2);
        const stageBraziers = [
          [11, 11],
          [-11, 11],
          [11, -11],
          [-11, -11]
        ];
        for (const [bx, bz] of stageBraziers) {
          b.addCircle(bx, bz, 1, relY === 2 ? 34 : 3, true);
        }
      }

      if (relY >= 1 && relY <= 12) {
        const seatRadius = 16 + relY * 2;
        b.addCircle(0, 0, seatRadius, 11, false, 2);
        b.addLine(-seatRadius, 0, seatRadius, 0, 30, 3);
        b.addLine(0, -seatRadius, 0, seatRadius, 30, 3);
      }

      stampDragonStatueAtY(b, relY);

      // 4 MONUMENTAL CARDINAL TORBÖGEN (ARCHWAYS) INTO THE DRAGON ROTUNDA:
      // Frame walls are strictly confined to the Rotunda outer wall thickness (52..56) so zero side-walls jut into the Rotunda!
      b.carveArchway(-56, -7, -52, 7, relY, 10, 'x', 28, 30);
      b.carveArchway(52, -7, 56, 7, relY, 9, 'x', 28, 30);
      b.carveArchway(-7, -56, 7, -52, relY, 10, 'z', 28, 30);
      b.carveArchway(-7, 52, 7, 56, relY, 8, 'z', 28, 30);

      // Clear inner approach aisles (r = 38..52) without building side walls inside the Rotunda
      if (isGround) {
        b.addRect(-52, -5, -38, 5, 30, true);
        b.addRect(38, -5, 52, 5, 30, true);
        b.addRect(-5, -52, 5, -38, 30, true);
        b.addRect(-5, 38, 5, 52, 30, true);
      } else if (relY <= 10) {
        b.carveRect(-52, -5, -38, 5);
        b.carveRect(38, -5, 52, 5);
        b.carveRect(-5, -52, 5, -38);
        b.carveRect(-5, 38, 5, 52);
      }

      if (relY >= 20 && relY <= 30) {
        b.addCircle(0, 0, 1, 9, true);
        if (relY === 22) {
          b.addCircle(0, 0, 10, 13, false, 2);
          for (let deg = 0; deg < 360; deg += 30) {
            const rad = (deg * Math.PI) / 180;
            b.setBlock(Math.cos(rad) * 10, Math.sin(rad) * 10, 12);
          }
        }
        if (relY === 26) {
          b.addCircle(0, 0, 16, 13, false, 2);
          for (let deg = 0; deg < 360; deg += 20) {
            const rad = (deg * Math.PI) / 180;
            b.setBlock(Math.cos(rad) * 16, Math.sin(rad) * 16, 12);
          }
        }
      }
    } else if (relY <= 44) {
      if (relY <= 35) {
        for (let deg = 0; deg < 360; deg += 30) {
          const rad = (deg * Math.PI) / 180;
          b.addCircle(
            Math.round(Math.cos(rad) * 54),
            Math.round(Math.sin(rad) * 54),
            Math.max(1, 3 - (relY - 31)),
            relY === 35 ? 20 : 3,
            true
          );
        }
      }

      const domeProgress = (relY - 30) / 15;
      const domeRadius = Math.round(55 * Math.cos(domeProgress * (Math.PI / 2) * 0.92));
      if (domeRadius >= 6) {
        if (domeRadius > 10) {
          b.carveCircle(0, 0, domeRadius - 2);
        }
        b.addCircle(0, 0, domeRadius, 10, domeRadius <= 10, 2);
        for (let deg = 0; deg < 360; deg += 30) {
          const rad = (deg * Math.PI) / 180;
          b.addCircle(
            Math.round(Math.cos(rad) * domeRadius),
            Math.round(Math.sin(rad) * domeRadius),
            2,
            9,
            true
          );
        }
      }
      b.addCircle(0, 0, 1, 9, true);
      if (relY === 44) {
        b.addCircle(0, 0, 8, 20, true);
        b.addCircle(0, 0, 4, 12, true);
      }
    }
  }

  // --------------------------------------------------------------------------
  // F) GAUNTLET APPROACH TRAIL (Z = -163..-225), THE GAUNTLET (Z = -225..-385) & FLIGHT FIELD (Y = 132..145)
  // --------------------------------------------------------------------------
  // 1. Scenic Alpine Approach Trail from the Citadel North Gate (Z = -163, Y = 80) to the Gauntlet Base Plaza (Z = -225, Y = 85)
  if (y >= 79 && y <= 92) {
    for (let z = -163; z >= -225; z--) {
      const tA = (-163 - z) / (225 - 163);
      const trailY = Math.round(80 + tA * 5);
      const trailX = Math.round(25 - tA * 7 + Math.sin((z + 163) * 0.05) * 6);
      if (y === trailY || y === trailY - 1) {
        b.addRect(trailX - 4, z, trailX + 4, z, 33, true);
        b.setBlock(trailX - 5, z, 3);
        b.setBlock(trailX + 5, z, 3);
      } else if (y >= trailY + 1 && y <= trailY + 6) {
        b.carveRect(trailX - 4, z, trailX + 4, z);
        if (y === trailY + 1 && Math.abs(z) % 12 === 0) {
          b.setBlock(trailX - 5, z, 34);
          b.setBlock(trailX + 5, z, 34);
        }
      }
    }
    if (y === 84 || y === 85) {
      // Gauntlet Base Starting Plaza at Z = -225 (Over 60 blocks north of the Riders Citadel!)
      b.addCircle(18, -225, 11, 2, true);
      b.addCircle(18, -225, 9, 32, false, 2);
    } else if (y >= 86 && y <= 91) {
      b.carveCircle(18, -225, 10);
    }
  }

  // 2. The Gauntlet Obstacles (Stretched across Z = -228 to Z = -385 in the deep northern alpine canyon!)
  if (y >= 85 && y <= 144) {
    const gauntletProgress = (y - 85) / (144 - 85);
    const gz = Math.round(-228 - gauntletProgress * 154); // Spans from Z = -228 to Z = -382!
    const gx = Math.round(18 + Math.sin((gz + 168) * 0.038) * 14);
    // Stone & Timber Climbing Platforms + Rotating Bronze Cogwheels + Balance Beams
    if (y % 6 === 0) {
      b.addCircle(gx, gz, 11, 13, false, 2); // Rotating Bronze Wheel
      b.addLine(gx - 24, gz, gx + 24, gz, 9, 2); // Steel Axle anchored in Canyon Cliffs
    } else if (y % 3 === 0) {
      b.addLine(gx - 20, gz, gx + 20, gz, 29, 3); // Timber Suspension Bridge
    }
    // The Vertical Chimney at the far northern summit of the Gauntlet (X = 12, Z = -382, Y = 125..144)
    if (y >= 125) {
      b.addCircle(12, -382, 8, 3, y === 144, 2);
      if (y === 144) b.addCircle(12, -382, 4, 20, true); // Gauntlet Summit Podium
    }
  }

  // 3. Flight Field Landing Rings, 3D Anatomical Dragons & Violet/Xaden's Cliff Tree + Grove (Y = 115..155)
  // Ensure solid masonry/cliff foundation beneath the Overlook Terrace (174, -238, r = 14) so zero blocks ever hang in mid-air!
  if (y >= 115 && y < 132) {
    for (let z = -252; z <= -224; z++) {
      for (let x = 160; x <= 188; x++) {
        const dSq = (x - 174) * (x - 174) + (z + 238) * (z + 238);
        if (dSq <= 14 * 14 && y >= getH(x, z)) {
          b.setBlock(x, z, y >= 128 ? 5 : 22);
        }
      }
    }
  }

  if (y >= 132 && y <= 155) {
    const relF = y - 132;
    if (relF === 0) {
      // Stone Causeway connecting Flight Field Viaduct (X = 196, Z = -146) to the Main Landing Pad (X = 242, Z = -218)
      b.addLine(196, -146, 224, -184, 33, 12);
      // Main Dragon Landing Pad (Expanded Ø 104 so Tairn, Sgaeyl & Andarna all stand majestically on the pad!)
      b.addCircle(242, -218, 52, 1, true);
      b.addCircle(242, -218, 48, 20, false, 2);
      b.addCircle(242, -218, 32, 32, false, 2);
      b.addCircle(242, -218, 14, 28, false, 2);

      // Winding Mossy Stone Path from the Flight Field Pad West Rim (194, -225) to Violet & Xaden's Cliff Promontory (174, -238)
      b.addLine(194, -225, 174, -238, 33, 5);

      // Violet & Xaden's Cliff Overlook Promontory (X = 174, Z = -238, r = 14) overlooking the northern mountain gorge
      b.addCircle(174, -238, 14, 5, true);
      b.addCircle(174, -238, 12, 23, true); // High Alpine Meadow Grass
      // Snow-dusted patches (Kapitel 22: First Kiss in the mountain snow after Violet's lightning strike!)
      b.addCircle(168, -242, 4, 26, true);
      b.addCircle(179, -245, 3, 26, true);
      b.addCircle(166, -233, 3, 26, true);
    }

    // Secluded Bench, Low Cliff Parapet, Lanterns, Violet/Xaden's Monumental Ancient Tree & Surrounding Grove (relF = 1..23)
    if (relF >= 1 && relF <= 23) {
      // Low weathered stone parapet along the western cliff drop-off of the promontory
      if (relF === 1) {
        for (let deg = 110; deg <= 260; deg += 6) {
          const rad = (deg * Math.PI) / 180;
          b.setBlock(174 + Math.cos(rad) * 13, -238 + Math.sin(rad) * 13, 5);
        }
        // Carved Dark-Oak Bench with Red Velvet Cushion beneath the western boughs facing the mountain sunset
        b.addRect(167, -241, 169, -235, 11, true);
        b.addRect(168, -240, 168, -236, 30, true);
        // Subtle Lore Details: Xaden's Shadow wisp (#14) & Violet's Lightning Crystal spark (#12) beside the bench
        b.setBlock(170, -242, 14);
        b.setBlock(170, -234, 12);
      }
      if (relF >= 1 && relF <= 3) {
        // Two warm stone lanterns flanking the cliff overlook path
        b.setBlock(183, -231, relF === 3 ? 34 : 3);
        b.setBlock(180, -245, relF === 3 ? 34 : 3);
      }

      // Monumental 23-block-tall Gnarled Oak/Aurum Hero Tree ("Violet & Xadens Baum")
      stampAncientLoreTreeAtY(b, relF, {
        cx: 174,
        cz: -238,
        height: 23,
        trunkMat: 35,
        primaryLeafMat: 27,   // Golden Aurum Leaves
        secondaryLeafMat: 36, // Deep Mountain Leaves
        snowDusted: true      // Snow-dusted upper crown (Kapitel 22)
      });

      // Surrounding Grove of 8 Companion Ancient Oak & Mountain Trees framing the Cliff Overlook & Flight Field!
      const companionGrove = [
        { cx: 162, cz: -216, height: 16, pMat: 36, sMat: 27 },
        { cx: 164, cz: -260, height: 17, pMat: 27, sMat: 36 },
        { cx: 184, cz: -266, height: 15, pMat: 36, sMat: 27 },
        { cx: 204, cz: -272, height: 14, pMat: 27, sMat: 36 },
        { cx: 182, cz: -206, height: 15, pMat: 36, sMat: 27 },
        { cx: 160, cz: -194, height: 14, pMat: 27, sMat: 36 },
        { cx: 288, cz: -266, height: 16, pMat: 36, sMat: 27 },
        { cx: 298, cz: -192, height: 15, pMat: 27, sMat: 36 }
      ];
      for (const gt of companionGrove) {
        stampAncientLoreTreeAtY(b, relF, {
          cx: gt.cx,
          cz: gt.cz,
          height: gt.height,
          trunkMat: 35,
          primaryLeafMat: gt.pMat,
          secondaryLeafMat: gt.sMat,
          snowDusted: false
        });
      }
    }

    if (relF >= 1 && relF <= 22) {
      // 1. TAIRN — Colossal Black Morningstail Dragon (Scale 1.0, 21 blocks tall, ~68-block wingspan, facing SW toward Basgiath)
      stampDetailedDragonAtY(b, relF, {
        cx: 256,
        cz: -222,
        facingDeg: 132,
        scale: 1.0,
        scaleMat: 14,     // Black Dragonscale
        bellyMat: 28,     // Arcane Gold-Darkstone Underbelly
        membraneMat: 2,   // Chiseled Blackstone Wing Membranes
        hornMat: 20,      // Gold Horns, Dorsal Spikes, Talons & Morningstail Spikes
        eyeMat: 12,       // Glowing Arcane Crystal Eyes
        tailType: 'morningstail'
      });

      // 2. SGAEYL — Ruthless Blue Daggertail Dragon (Scale 0.68, perched NW on the pad, facing SSW)
      stampDetailedDragonAtY(b, relF, {
        cx: 216,
        cz: -248,
        facingDeg: 112,
        scale: 0.68,
        scaleMat: 15,     // Blue Dragonscale
        bellyMat: 3,      // Polished Blackstone Underbelly
        membraneMat: 8,   // Deepslate Tile Wing Membranes
        hornMat: 9,       // Bolted Steel Horns, Talons & Daggertail Blades
        eyeMat: 12,
        tailType: 'daggertail'
      });

      // 3. ANDARNA — Golden Feathertail Dragon (Scale 0.52, perched SW near the causeway, looking up toward Tairn)
      stampDetailedDragonAtY(b, relF, {
        cx: 214,
        cz: -190,
        facingDeg: 38,
        scale: 0.52,
        scaleMat: 20,     // Golden Scales
        bellyMat: 6,      // Chiseled Limestone Underbelly
        membraneMat: 13,  // Bolted Bronze Wing Membranes
        hornMat: 12,      // Glowing Crystal Horns, Spikes & Feathertail Tips
        eyeMat: 34,
        tailType: 'feathertail'
      });
    }
  }

  const json = b.toJSON();
  const filePath = path.join(LAYERS_DIR, `layer.${y}.json`);
  fs.writeFileSync(filePath, JSON.stringify(json));
  allLayers.push({
    y: json.y,
    label: json.label,
    zone: json.zone,
    description: json.description,
    totalBlocks: json.totalBlocks,
    materials: json.materials,
    file: `/data/layers/layer.${json.y}.json`
  });
}

// ============================================================================
// 7. WRITE MANIFEST
// ============================================================================
const globalMaterials = {};
let globalTotalBlocks = 0;
for (const l of allLayers) {
  globalTotalBlocks += l.totalBlocks;
  for (const [blockId, count] of Object.entries(l.materials)) {
    globalMaterials[blockId] = (globalMaterials[blockId] || 0) + count;
  }
}

const manifest = {
  project: 'Basgiath War College – Minecraft ATM 11 Visualizer',
  updatedAt: new Date().toISOString(),
  bounds: {
    minX: MIN_X,
    maxX: MAX_X,
    minZ: MIN_Z,
    maxZ: MAX_Z,
    minY: -30,
    maxY: 156
  },
  zones: [
    {
      id: 'all',
      name: 'Gesamtes Basgiath & Bergmassiv',
      center: { x: 0, y: 85, z: 120 },
      yRange: [-30, 156],
      description: 'Komplettes 3D-Gebirge inkl. Wäldern, Schlucht, Süd-Campus, Reiter-Zitadelle, Gauntlet & Flight Field'
    },
    {
      id: 'dragon-rotunda',
      name: 'Dragon Rotunda & Riders Quadrant',
      center: { x: 0, y: 95, z: 0 },
      yRange: [80, 146],
      description: 'Kuppelbau (Ø 111 Blöcke) mit 6 Drachenstatuen, Kronleuchter, Mattenraum, Gathering Hall, Dorms & Nordzitadelle'
    },
    {
      id: 'parapet',
      name: 'Das Parapet & Die Schlucht',
      center: { x: -20, y: 70, z: 155 },
      yRange: [-30, 85],
      description: 'Todesbrücke über die 100 Blöcke tiefe Felsschlucht'
    },
    {
      id: 'south-campus',
      name: 'Süd-Campus (Healer, Infantry, Admin)',
      center: { x: 0, y: 60, z: 390 },
      yRange: [55, 114],
      description: 'Monumentale Hauptzitadelle inkl. Hofgärten, Drachenbrunnen, Krankensälen, Bell Tower & Sorrengails Büro'
    },
    {
      id: 'scribe-quadrant',
      name: 'Scribe Quadrant (Underground)',
      center: { x: -130, y: 12, z: 350 },
      yRange: [10, 22],
      description: 'Unterirdisches Zentralarchiv mit Lesetischen, Bücherregal-Ringen und 7 strahlenförmigen Katakomben'
    },
    {
      id: 'wardstone-obelisk',
      name: 'Wardstone-Kammer (Schutzzauber-Obelisk)',
      center: { x: -25, y: 0, z: 378 },
      yRange: [-12, 16],
      description: 'Tief im Felsmassiv verborgene Runen-Kaverne (Y = -12..18) mit dem 27 Blöcke hohen Schutzzauber-Obelisken, 7 Drachenfeuer-Kanälen, Runen-Stollen zum Archiv & Drachen-Tunnel zur Schlucht'
    },
    {
      id: 'threshing-valley',
      name: 'Das Tal: Vorstellen & Dreschen (Fields)',
      center: { x: -265, y: 24, z: -115 },
      yRange: [15, 45],
      description: 'Weitläufiges westliches Tal (Fields): Serpentinen-Abstieg, Kaoris Drachenkunde-Lehrplatz, Aufmarsch des Vorstellens (3 Drachen), Waldlichtung des Dreschens (Andarna & Tairn), Talbach & Drachen-Weiden'
    },
    {
      id: 'gauntlet-flight-field',
      name: 'The Gauntlet & Flight Field',
      center: { x: 215, y: 140, z: -225 },
      yRange: [85, 156],
      description: 'Weitläufiger Hindernisparcours im nördlichen Hochgebirge und Drachen-Flugfeld (Tairn, Sgaeyl & Andarna) im fernen Nordosten'
    },
    {
      id: 'violet-xaden-tree',
      name: 'Violet & Xadens Baum (Flight Field Klippe)',
      center: { x: 174, y: 140, z: -238 },
      yRange: [130, 156],
      description: 'Uralter Baum auf dem verschneiten Klippenvorsprung am Rande des Flight Fields (Kapitel 22 – Erster Kuss von Violet & Xaden)'
    }
  ],
  totalLayers: allLayers.length,
  totalBlocksAllLayers: globalTotalBlocks,
  globalMaterials,
  layers: allLayers.sort((a, b) => a.y - b.y)
};

fs.writeFileSync(path.join(DATA_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2));

console.log(
  `Successfully generated ${allLayers.length} detailed layer.Y.json files (${globalTotalBlocks.toLocaleString()} total blocks) in ${LAYERS_DIR}`
);
