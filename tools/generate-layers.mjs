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
const MIN_X = -260;
const MAX_X = 320;
const MIN_Z = -410;
const MAX_Z = 570;

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

  // 1. Western Cliff Boundary (Separates the low-lying NW FIELDS from the Mountain Massif)
  // On basgiath-map.jpg, the low-lying FIELDS are ONLY in the North-West (x < -178, z < 205).
  // South of the Ravine (z >= 210), the entire Southern Plateau (Y = 55) extends all the way to the western map edge
  // so the Scribe Quadrant (Underground) sits 100% underground beneath the Y = 55 forest plateau!
  let westCliffX = -178;
  if (z < -135) {
    westCliffX = -138 + (z + 135) * 0.28 + Math.sin(z * 0.05) * 6;
  } else if (z >= -135 && z <= 175) {
    westCliffX = -182 + Math.sin(z * 0.04) * 5;
  } else {
    // At z = 175..220, the cliff turns sharply WEST to the left edge of the map (x = -265)
    westCliffX = -182 - smoothstep(175, 218, z) * 95;
  }

  const fieldToMountain = smoothstep(westCliffX - 32, westCliffX + 2, x);
  const fieldsHeight = 16 + Math.round(Math.sin(x * 0.025 + z * 0.025) * 2.5);

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
      smoothstep(145, 198, x) * smoothstep(-40, -155, z) * 52;

    const mountainAdd = Math.max(
      peakWest + rNoise * 0.65,
      peakNorthWall + rNoise * 0.65,
      peakEastGauntlet + rNoise * 0.65,
      peakFarNE + rNoise * 0.5,
      flightFieldShoulder
    );

    if (z < -172 || x > 130) {
      const blendIn = Math.max(smoothstep(-172, -220, z), smoothstep(130, 185, x));
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
    if (x >= 182 && x <= 305 && z >= -285 && z <= -140) {
      const edgeBlend =
        smoothstep(182, 196, x) *
        smoothstep(305, 290, x) *
        smoothstep(-285, -268, z) *
        smoothstep(-140, -154, z);
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

// Returns true if (x, z) is within a safety margin of ANY building, tower, courtyard, or bridge
// so forest trees never clip through walls or roofs!
function isNearAnyBuildingOrBridge(x, z) {
  // 1. Riders Quadrant, North Citadel, Courtyard & Towers (with 10-block safety buffer)
  if (x >= -188 && x <= 132 && z >= -182 && z <= 92) return true;
  // 2. Flight Field Bridge & Flight Field Landing Pad
  if (x >= 110 && x <= 305 && z >= -285 && z <= -130) return true;
  // 3. Gauntlet Approach Trail & Gauntlet Canyon
  if (x >= -58 && x <= 80 && z >= -400 && z <= -160) return true;
  // 4. Bridges across the Ravine (Parapet & East Bridge)
  if (z >= 70 && z <= 240 && ((x >= -130 && x <= -100) || (x >= 60 && x <= 90))) return true;
  // 5. South Campus Citadel, Scribe West Projection, Bell Tower & Corner Towers (with 10-block buffer)
  if (x >= -172 && x <= 170 && z >= 202 && z <= 568) return true;
  return false;
}

// ============================================================================
// 2. GENERATE FOREST TREES AROUND BASGIATH (WITH STRICT NO-CLIPPING BUFFER)
// ============================================================================
const forestTrees = [];
for (let z = MIN_Z + 15; z <= MAX_Z - 15; z += 14) {
  for (let x = MIN_X + 15; x <= MAX_X - 15; x += 14) {
    const jx = x + Math.round(Math.sin(z * 0.37) * 4);
    const jz = z + Math.round(Math.cos(x * 0.41) * 4);
    if (isNearAnyBuildingOrBridge(jx, jz)) continue;

    const h = getH(jx, jz);
    const slope = Math.abs(h - getH(jx + 3, jz)) + Math.abs(h - getH(jx - 3, jz)) + Math.abs(h - getH(jx, jz + 3));
    if (slope > 4) continue;

    // Place trees in the exact wooded zones from basgiath-map.jpg:
    // 1. East of Riders Quadrant & North of Ravine (x > 132, z in [-75..85])
    // 2. East & West of South Campus on the Y=55 plateau (x > 172 or x < -174, z in [235..545])
    // 3. Scattered clumps in the North-Western Fields (x < -195, z < 165)
    const inEastWoods = jx >= 132 && jx <= 248 && jz >= -75 && jz <= 85 && h >= 75 && h <= 115;
    const inSouthEastWoods = jx >= 172 && jx <= 252 && jz >= 235 && jz <= 545 && h >= 54 && h <= 82;
    const inSouthWestWoods = jx >= -248 && jx <= -174 && jz >= 235 && jz <= 535 && h >= 53 && h <= 62;
    const inFieldClumps =
      jx <= -198 && jz <= 160 && h <= 22 && Math.sin(jx * 0.08) + Math.cos(jz * 0.08) > 0.85;

    if (inEastWoods || inSouthEastWoods || inSouthWestWoods || inFieldClumps) {
      const isGolden = (Math.abs(jx + jz) % 5) === 0;
      forestTrees.push({
        x: jx,
        z: jz,
        baseY: h + 1,
        height: 8 + (Math.abs(jx * jz) % 4),
        leafMat: isGolden ? 27 : 36
      });
    }
  }
}

// ============================================================================
// 3. LAYER BUILDER HELPER
// ============================================================================
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
    this.grid.set(`${rx},${rz}`, blockId);
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
        } else if (y === h && slope <= 1 && (y <= 24 || (y >= 54 && y <= 66) || (y >= 79 && y <= 84 && x > 120))) {
          b.setBlock(x, z, 23); // Grassland (Fields, South Campus meadows, Eastern forest floor)
        } else if (y >= 126 && (y >= h - 2 || (x + z + y) % 3 === 0)) {
          b.setBlock(x, z, 26); // High Alpine Calcite / Snow Peaks
        } else if (y < 18) {
          b.setBlock(x, z, 25); // Deep Ravine Mossy Deepslate
        } else {
          b.setBlock(x, z, 22); // Mountain Tuff / Cliff Rock
        }
      }
    }
  }

  // Stamp 3D Pine & Golden Aurum Trees on the mountain slopes & woods
  for (const tree of forestTrees) {
    const relT = y - tree.baseY;
    if (relT >= 0 && relT < tree.height) {
      b.setBlock(tree.x, tree.z, 35); // Spruce Log Trunk
      if (relT >= 2) {
        const leafR = Math.max(1, Math.round(((tree.height - relT) / tree.height) * 3.5));
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
// 5. SCULPTED 3D DRAGON STATUES FOR THE DRAGON ROTUNDA
// ============================================================================
const dragonStatues = [
  { angleDeg: 0, blockId: 14, name: 'Schwarzer Morningstail (Tairn/Codagh)' },
  { angleDeg: 60, blockId: 15, name: 'Blauer Daggertail (Sgaeyl)' },
  { angleDeg: 120, blockId: 16, name: 'Grüner Clubtail (Teine)' },
  { angleDeg: 180, blockId: 17, name: 'Roter Swordtail (Thoirt)' },
  { angleDeg: 240, blockId: 18, name: 'Oranger Scorpiontail (Baide)' },
  { angleDeg: 300, blockId: 19, name: 'Brauner Feathertail (Deigh)' }
];

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

    // Dragon Lower Body, Legs & Sweeping Tail with Weapon (relY = 6..12)
    if (relY >= 6 && relY <= 12) {
      const bodyRadius = relY <= 9 ? 4 : 3;
      layer.addCircle(Math.round(cx), Math.round(cz), bodyRadius, dragon.blockId, true);

      const tailLen = 10 - Math.abs(relY - 8);
      for (let t = 1; t <= tailLen; t++) {
        const tx = cx - inX * (t * 0.75) + perpX * Math.sin(t * 0.35) * 4;
        const tz = cz - inZ * (t * 0.75) + perpZ * Math.sin(t * 0.35) * 4;
        layer.addCircle(Math.round(tx), Math.round(tz), 1, dragon.blockId, true);
        if (t === tailLen && relY >= 8 && relY <= 10) {
          layer.addCircle(Math.round(tx), Math.round(tz), 2, 20, true);
        }
      }
    }

    // Chest & Spread Wings (relY = 13..23)
    if (relY >= 13 && relY <= 23) {
      const leanIn = (relY - 12) * 0.45;
      const bx = cx + inX * leanIn;
      const bz = cz + inZ * leanIn;
      layer.addCircle(Math.round(bx), Math.round(bz), 3, dragon.blockId, true);

      const wingSpan = 6 + (relY - 12) * 1.15;
      for (const side of [-1, 1]) {
        for (let w = 3; w <= wingSpan; w++) {
          const archBack = Math.sin((w / wingSpan) * Math.PI) * 3.5;
          const wx = bx + perpX * side * w - inX * archBack;
          const wz = bz + perpZ * side * w - inZ * archBack;
          layer.setBlock(wx, wz, dragon.blockId);
          layer.setBlock(wx + inX, wz + inZ, dragon.blockId);
          if (relY === 23 || Math.abs(w - wingSpan) < 1.2) {
            layer.setBlock(wx, wz, 20);
          }
        }
      }
    }

    // Neck, Snout, Glowing Eyes & Horns (relY = 24..30)
    if (relY >= 24 && relY <= 30) {
      const reachIn = 5 + (relY - 24) * 1.1;
      const hx = cx + inX * reachIn;
      const hz = cz + inZ * reachIn;
      const headRadius = relY >= 27 ? 2 : 3;
      layer.addCircle(Math.round(hx), Math.round(hz), headRadius, dragon.blockId, true);

      if (relY === 27 || relY === 28) {
        for (let s = 1; s <= 4; s++) {
          layer.setBlock(hx + inX * s, hz + inZ * s, dragon.blockId);
        }
        layer.setBlock(hx + perpX * 2, hz + perpZ * 2, 12);
        layer.setBlock(hx - perpX * 2, hz - perpZ * 2, 12);
      }

      if (relY >= 29) {
        for (const side of [-1, 1]) {
          layer.setBlock(hx - inX * 2 + perpX * side * 2, hz - inZ * 2 + perpZ * side * 2, 20);
          layer.setBlock(hx - inX * 3 + perpX * side * 3, hz - inZ * 3 + perpZ * side * 3, 20);
        }
      }
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
  } else if (y >= 10 && y <= 24) {
    label = `Scribe Quadrant Katakomben & West-Fields (Y=${y})`;
    zone = 'scribe-quadrant';
    desc = 'Unterirdische Archiv-Hallen mit Lesetischen & Bücherregalen sowie westliches Tiefland';
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
    desc = 'Schneebedeckte Alpengipfel, vertikaler Gauntlet-Kamin und Drachen-Flugfeld (Tairn & Andarna)';
  }

  const b = new LayerBuilder(y, label, zone, desc);

  // --------------------------------------------------------------------------
  // A) WATERTIGHT 3D MOUNTAIN LANDSCAPE & FOREST TREES
  // --------------------------------------------------------------------------
  stampMountainTerrainAtY(b, y);

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
        b.addLine(cx - 33, cz, cx + 33, cz, 30, 3);
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

  // Hollow Limestone Shaft with Spiral Staircase & Bronze Book Elevator from Y = 10 up to Scribe West Hall (Y = 55)!
  if (y >= 10 && y <= 55) {
    const cx = -142;
    const cz = 378;
    b.addCircle(cx, cz, 10, 6, false, 2);
    b.carveCircle(cx, cz, 8);
    // Spiral staircase steps climbing around the central Book Elevator
    const stairAngle = ((y - 10) * 30 * Math.PI) / 180;
    const sx = Math.round(cx + Math.cos(stairAngle) * 6);
    const sz = Math.round(cz + Math.sin(stairAngle) * 6);
    b.addCircle(sx, sz, 2, 29, true);
    b.addCircle(cx, cz, 2, 13, true); // Central Bronze Book Elevator Mechanism
    if (y >= 11 && y <= 17) {
      // Open East/West/North/South Archways at the bottom of the shaft into the Underground Rotunda
      b.carveRect(cx - 11, cz - 2, cx + 11, cz + 2);
      b.carveRect(cx - 2, cz - 11, cx + 2, cz + 11);
      b.addCircle(cx, cz, 2, 13, true);
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
      // Preserve the Book Elevator & Spiral Staircase Entrance at (-142, 378) on the Ground Floor!
      if (relS <= 6) {
        b.addCircle(-142, 378, 10, 6, false, 2);
        b.carveCircle(-142, 378, 8);
        b.addCircle(-142, 378, 2, 13, true);
        // Open East Archway from the Elevator Rotunda into the Scribe Hall
        b.carveArchway(-135, 372, -130, 384, relS, 6, 'x', 28, null);
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
      if (!isSpire && !isGround && !isFloor2 && relS !== 17) {
        b.carveCircle(-115, 235, rT - 3); // Clear any Healer wall/roof clipping inside the tower!
      }
      b.addCircle(-115, 235, rT, tMat, isGround || isFloor2 || relS === 17 || rT <= 4, 3);
      if (!isSpire && relS >= 1 && relS <= 16) {
        const stairAngle = (relS * 32 * Math.PI) / 180;
        const sx = Math.round(-115 + Math.cos(stairAngle) * 14);
        const sz = Math.round(235 + Math.sin(stairAngle) * 14);
        b.addCircle(sx, sz, 4, 29, true);
        b.addCircle(-115, 235, 4, 4, true);
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

      // Grand Staircase inside the Bell Tower Gatehouse climbing from Courtyard level (Y=55, relB=0) up to East Bridge Deck (Y=64, relB=9)!
      if (relB >= 0 && relB <= 9) {
        const stepZ = 276 - relB * 3;
        b.addRect(66, 235, 84, stepZ, 32, true);
        b.addRect(69, stepZ - 3, 81, stepZ, 30, true);
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
        // Paved slate courtyard west & north-west of the Rotunda & North Citadel
        b.addRect(-162, -130, -30, 40, 1, true);
        // Paved East Terrace & Approach to the Flight Field Viaduct Bridge (X = 34..120, Z = -156..46)
        b.addRect(34, -156, 120, 46, 1, true);
        // Grand Cobblestone Roadways across the Riders Quadrant
        b.addRect(-155, -7, -52, 7, 33, true); // West Road to Rotunda
        b.addRect(-121, -110, -109, 40, 33, true); // Parapet Road north to Combat Pit
        b.addRect(69, -152, 81, 84, 33, true); // East Viaduct Roadway north to Citadel & Flight Field Bridge
        b.addRect(81, -152, 118, -140, 33, true); // Turn East to Flight Field Viaduct Bridge (X=116, Z=-146)
        // 4 Sparring & Formation Quadrants in Main Courtyard
        b.addRect(-148, 8, -124, 32, 32, false, 2);
        b.addRect(-104, 8, -76, 32, 32, false, 2);
        b.addRect(-148, -50, -124, -22, 32, false, 2);
        b.addRect(-104, -50, -76, -22, 32, false, 2);
        // Circular Hand-to-Hand Combat Pit in the NW Courtyard
        b.addCircle(-115, -85, 14, 30, false, 2);
        b.addCircle(-115, -85, 12, 29, true);
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
      // This follows the outer cliff edge on basgiath-map.jpg and NEVER cuts into the Riders Quadrant or Citadel!
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
      }
      b.carveArchway(-140, 36, -135, 44, relY, 6, 'x', 28, 32);
      b.carveArchway(-164, -39, -159, -31, relY, 6, 'x', 28, 32);
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
  if (y >= 80 && y <= 88) {
    for (let z = -163; z >= -225; z--) {
      const tA = (-163 - z) / (225 - 163);
      const trailY = Math.round(80 + tA * 5);
      const trailX = Math.round(25 - tA * 7 + Math.sin((z + 163) * 0.05) * 6);
      if (y === trailY) {
        b.addRect(trailX - 4, z, trailX + 4, z, 33, true);
        b.setBlock(trailX - 5, z, 3);
        b.setBlock(trailX + 5, z, 3);
      } else if (y === trailY + 1 && Math.abs(z) % 12 === 0) {
        b.setBlock(trailX - 5, z, 34);
        b.setBlock(trailX + 5, z, 34);
      }
    }
    if (y === 85) {
      // Gauntlet Base Starting Plaza at Z = -225 (Over 60 blocks north of the Riders Citadel!)
      b.addCircle(18, -225, 11, 2, true);
      b.addCircle(18, -225, 9, 32, false, 2);
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

  // 3. Flight Field Landing Rings & 3D Dragons on the distant NE Mountain Shoulder (Center: X = 242, Z = -218, Y = 132..144)
  if (y >= 132 && y <= 144) {
    const relF = y - 132;
    if (relF === 0) {
      // Stone Causeway connecting Flight Field Viaduct (X = 196, Z = -146) to the Main Landing Pad (X = 242, Z = -218)
      b.addLine(196, -146, 224, -184, 33, 10);
      // Main Dragon Landing Pad
      b.addCircle(242, -218, 46, 1, true);
      b.addCircle(242, -218, 42, 20, false, 2);
      b.addCircle(242, -218, 26, 32, false, 2);
    }
    // 3D Sculpted Tairn (Colossal Black Morningstail Dragon) & Golden Andarna
    if (relF >= 1 && relF <= 10) {
      // Tairn's Body, Spread Wings, Head & Morningstail
      if (relF <= 8) {
        b.addCircle(242, -218, Math.max(3, 9 - relF), 14, true);
        const wingW = 10 + relF * 4;
        b.addLine(242 - wingW, -218 + relF, 242 + wingW, -218 + relF, 14, 5);
        b.addLine(242, -188, 242, -252, 14, Math.max(2, 6 - Math.floor(relF / 2)));
        if (relF === 3) {
          b.addCircle(242, -254, 4, 20, true); // Morningstail Spiked Club
        }
      }
      // Golden Andarna next to Tairn
      if (relF <= 5) {
        b.addCircle(208, -190, Math.max(2, 5 - relF), 20, true);
        b.addLine(196, -190, 220, -190, 20, 3);
      }
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
      id: 'gauntlet-flight-field',
      name: 'The Gauntlet & Flight Field',
      center: { x: 115, y: 135, z: -265 },
      yRange: [85, 156],
      description: 'Weitläufiger Hindernisparcours im nördlichen Hochgebirge und Drachen-Flugfeld im fernen Nordosten'
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
