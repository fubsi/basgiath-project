<script setup>
import { ref, onMounted, onBeforeUnmount, watch, nextTick } from 'vue';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { useLayerStore } from '../composables/useLayerStore';

const {
  state,
  loadAllLayersFor3D,
  availableYLevels,
  getBlockInfo,
  isTerrainBlock,
  getBlockAt,
  mutateBlocks
} = useLayerStore();

const containerRef = ref(null);
const highlightCurrentY = ref(true);
const useRealTextures = ref(true);
const renderedVoxelCount = ref(0);
const moveSpeed = ref(120); // blocks per second
const isPointerLocked = ref(false);
const activeKeysList = ref([]);

let scene = null;
let camera = null;
let renderer = null;
let controls = null;
let voxelGroup = null;
let yPlaneMesh = null;
let targetWireframeMesh = null;
let ghostBlockMesh = null;
let animId = null;
let resizeObserver = null;
let lastFrameTime = performance.now();

// Raycaster & pointer interaction state for 3D Block Inspector & Editor
const raycaster = new THREE.Raycaster();
const pointerNDC = new THREE.Vector2();
let pointerDownPos = { x: 0, y: 0 };
let lastRaycastTime = 0;

// Per-layer cached instance transform arrays so single-layer edits rebuild in <10ms
// y -> { revision, showTerrain, stepH, byBlock: Map<blockId, number[]>, count }
const layerBucketCache = new Map();
const sharedBoxGeo = new THREE.BoxGeometry(1, 1, 1);

// WASD / flight key state
const pressedKeys = new Set();
const euler = new THREE.Euler(0, 0, 0, 'YXZ');

function syncActiveKeysUI() {
  activeKeysList.value = Array.from(pressedKeys);
}

function isInputFocused(e) {
  const tag = e.target?.tagName;
  if (!tag) return false;
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag === 'INPUT') {
    const type = (e.target.type || '').toLowerCase();
    return type !== 'checkbox' && type !== 'range' && type !== 'button';
  }
  return false;
}

function onKeyDown(e) {
  if (isInputFocused(e)) return;
  const code = e.code;

  if (code === 'KeyF') {
    e.preventDefault();
    togglePointerLock();
    return;
  }

  // Quick tool hotkeys 1..4 when in Edit Mode
  if (state.editMode && !e.ctrlKey && !e.metaKey) {
    if (code === 'Digit1') {
      state.editTool = 'add';
      update3DCursorVisuals();
      return;
    } else if (code === 'Digit2') {
      state.editTool = 'convert';
      update3DCursorVisuals();
      return;
    } else if (code === 'Digit3') {
      state.editTool = 'remove';
      update3DCursorVisuals();
      return;
    } else if (code === 'Digit4') {
      state.editTool = 'pick';
      update3DCursorVisuals();
      return;
    }
  }

  const navCodes = [
    'KeyW', 'KeyA', 'KeyS', 'KeyD',
    'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight',
    'Space', 'KeyE', 'KeyQ', 'KeyC',
    'ShiftLeft', 'ShiftRight'
  ];

  if (navCodes.includes(code)) {
    if (code === 'Space' || code.startsWith('Arrow')) {
      e.preventDefault();
    }
    if (document.activeElement && document.activeElement.tagName === 'INPUT') {
      document.activeElement.blur();
    }
    pressedKeys.add(code);
    syncActiveKeysUI();
  }
}

function onKeyUp(e) {
  if (pressedKeys.has(e.code)) {
    pressedKeys.delete(e.code);
    syncActiveKeysUI();
  }
}

function clearKeys() {
  pressedKeys.clear();
  syncActiveKeysUI();
}

function togglePointerLock() {
  if (!renderer?.domElement) return;
  if (document.pointerLockElement === renderer.domElement) {
    document.exitPointerLock();
  } else {
    renderer.domElement.requestPointerLock();
  }
}

function onPointerLockChange() {
  const locked = document.pointerLockElement === renderer?.domElement;
  isPointerLocked.value = locked;
  if (!camera || !controls) return;

  if (locked) {
    controls.enabled = false;
    euler.setFromQuaternion(camera.quaternion);
    pointerNDC.set(0, 0);
    perform3DRaycast();
  } else {
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    controls.target.copy(camera.position).addScaledVector(forward, 80);
    controls.enabled = true;
    controls.update();
  }
}

function onMouseMoveFreeLook(e) {
  if (!isPointerLocked.value || !camera) return;
  const sensitivity = 0.0022;
  euler.setFromQuaternion(camera.quaternion);
  euler.y -= e.movementX * sensitivity;
  euler.x -= e.movementY * sensitivity;
  const maxPitch = Math.PI / 2 - 0.04;
  euler.x = Math.max(-maxPitch, Math.min(maxPitch, euler.x));
  camera.quaternion.setFromEuler(euler);

  // In pointer-lock mode, only raycast when editMode is active and throttle to 75ms
  if (state.editMode) {
    const now = performance.now();
    if (now - lastRaycastTime > 75) {
      lastRaycastTime = now;
      pointerNDC.set(0, 0);
      perform3DRaycast();
    }
  }
}

function updateWASDMovement(dt) {
  if (!camera || !controls || pressedKeys.size === 0) return;

  const isSprint = pressedKeys.has('ShiftLeft') || pressedKeys.has('ShiftRight');
  const speed = moveSpeed.value * (isSprint ? 2.8 : 1.0) * dt;

  const forward = new THREE.Vector3();
  camera.getWorldDirection(forward);
  forward.y = 0;
  if (forward.lengthSq() < 1e-6) {
    forward.set(0, 0, -1);
  } else {
    forward.normalize();
  }

  const up = new THREE.Vector3(0, 1, 0);
  const right = new THREE.Vector3().crossVectors(forward, up).normalize();

  const moveDelta = new THREE.Vector3();

  if (pressedKeys.has('KeyW') || pressedKeys.has('ArrowUp')) {
    moveDelta.add(forward);
  }
  if (pressedKeys.has('KeyS') || pressedKeys.has('ArrowDown')) {
    moveDelta.sub(forward);
  }
  if (pressedKeys.has('KeyD') || pressedKeys.has('ArrowRight')) {
    moveDelta.add(right);
  }
  if (pressedKeys.has('KeyA') || pressedKeys.has('ArrowLeft')) {
    moveDelta.sub(right);
  }

  if (moveDelta.lengthSq() > 0) {
    moveDelta.normalize().multiplyScalar(speed);
  }

  let vertical = 0;
  if (pressedKeys.has('Space') || pressedKeys.has('KeyE')) vertical += 1;
  if (pressedKeys.has('KeyQ') || pressedKeys.has('KeyC')) vertical -= 1;
  if (vertical !== 0) {
    moveDelta.y += vertical * speed * 0.85;
  }

  if (moveDelta.lengthSq() > 0) {
    camera.position.add(moveDelta);
    controls.target.add(moveDelta);
  }
}

const textureLoader = new THREE.TextureLoader();
const loadedTextures = new Map(); // blockId -> THREE.Texture

function getOrLoadThreeTexture(blockId, info) {
  if (!info?.texture) return null;
  if (loadedTextures.has(blockId)) return loadedTextures.get(blockId);

  const tex = textureLoader.load(info.texture, () => {
    if (renderer && scene && camera) {
      renderer.render(scene, camera);
    }
  });
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  loadedTextures.set(blockId, tex);
  return tex;
}

// World-space 1x1x1 block UV shader so RLE beams tile crisp 16x16 Minecraft textures per block!
function applyWorldSpaceVoxelUV(material) {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader =
      `varying vec3 vBoxWorldPos;\nvarying vec3 vBoxLocalNormal;\n` +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vec4 wVoxelPos = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          wVoxelPos = instanceMatrix * wVoxelPos;
        #endif
        vBoxWorldPos = wVoxelPos.xyz;
        vBoxLocalNormal = normal;`
      );

    shader.fragmentShader =
      `varying vec3 vBoxWorldPos;\nvarying vec3 vBoxLocalNormal;\n` +
      shader.fragmentShader.replace(
        '#include <map_fragment>',
        `#ifdef USE_MAP
          vec2 voxelUV = abs(vBoxLocalNormal.y) > 0.5
            ? fract(vBoxWorldPos.xz + 0.5)
            : (abs(vBoxLocalNormal.x) > 0.5
                ? fract(vec2(-vBoxWorldPos.z, vBoxWorldPos.y) + 0.5)
                : fract(vBoxWorldPos.xy + 0.5));
          vec4 sampledDiffuseColor = texture2D( map, voxelUV );
          diffuseColor *= sampledDiffuseColor;
        #endif`
      );
  };
}

function update3DCursorVisuals() {
  if (!targetWireframeMesh || !ghostBlockMesh) return;
  const hv = state.hoveredVoxel;

  if (!hv || hv.blockId === null || hv.blockId === undefined) {
    targetWireframeMesh.visible = false;
    ghostBlockMesh.visible = false;
    return;
  }

  targetWireframeMesh.position.set(hv.x, hv.y, hv.z);
  targetWireframeMesh.visible = true;

  if (!state.editMode) {
    targetWireframeMesh.material.color.setHex(0x60a5fa);
    ghostBlockMesh.visible = false;
    return;
  }

  if (state.editTool === 'remove') {
    targetWireframeMesh.material.color.setHex(0xef4444);
    ghostBlockMesh.visible = false;
  } else if (state.editTool === 'convert') {
    targetWireframeMesh.material.color.setHex(0xe5a93c);
    ghostBlockMesh.visible = false;
  } else if (state.editTool === 'pick') {
    targetWireframeMesh.material.color.setHex(0x38bdf8);
    ghostBlockMesh.visible = false;
  } else if (state.editTool === 'add') {
    targetWireframeMesh.material.color.setHex(0xe5a93c);
    if (hv.adjacent && hv.adjacent.y >= -30 && hv.adjacent.y <= 156) {
      ghostBlockMesh.position.set(hv.adjacent.x, hv.adjacent.y, hv.adjacent.z);
      const selInfo = getBlockInfo(state.selectedBlockId);
      ghostBlockMesh.material.color.set(selInfo ? selInfo.color : '#22c55e');
      ghostBlockMesh.visible = true;
    } else {
      ghostBlockMesh.visible = false;
    }
  }
}

function perform3DRaycast() {
  if (!camera || !voxelGroup || voxelGroup.children.length === 0) return;

  raycaster.setFromCamera(pointerNDC, camera);
  const hits = raycaster.intersectObjects(voxelGroup.children, false);

  if (hits.length === 0) {
    state.hoveredVoxel = null;
    update3DCursorVisuals();
    return;
  }

  const hit = hits[0];
  const normal = hit.face ? hit.face.normal.clone() : new THREE.Vector3(0, 1, 0);
  // Step slightly inside the hit block along -normal to get exact integer block coordinates (even inside scaled RLE runs!)
  const insidePt = hit.point.clone().addScaledVector(normal, -0.04);
  const vx = Math.round(insidePt.x);
  const vy = Math.max(-30, Math.min(156, Math.round(insidePt.y)));
  const vz = Math.round(insidePt.z);

  const nx = Math.round(normal.x);
  const ny = Math.round(normal.y);
  const nz = Math.round(normal.z);
  const ax = vx + nx;
  const ay = vy + ny;
  const az = vz + nz;

  const actualBlockId = getBlockAt(vx, vy, vz) ?? hit.object.userData?.blockId ?? null;

  state.hoveredVoxel = {
    x: vx,
    y: vy,
    z: vz,
    blockId: actualBlockId,
    blockInfo: actualBlockId ? getBlockInfo(actualBlockId) : null,
    adjacent: { x: ax, y: ay, z: az },
    faceNormal: { x: nx, y: ny, z: nz }
  };

  update3DCursorVisuals();
}

function onCanvasPointerMove(e) {
  if (isPointerLocked.value || !renderer?.domElement) return;

  // If user is currently dragging to rotate/pan the camera, DO NOT raycast!
  const isMouseDown = (e.buttons & 1) === 1 || (e.buttons & 2) === 2 || (e.buttons & 4) === 4;
  if (isMouseDown) {
    if (state.hoveredVoxel) {
      state.hoveredVoxel = null;
      update3DCursorVisuals();
    }
    return;
  }

  // Throttle raycasting to ~16 Hz (60ms) so mouse movement has 0 impact on frame rate
  const now = performance.now();
  if (now - lastRaycastTime < 60) return;
  lastRaycastTime = now;

  const rect = renderer.domElement.getBoundingClientRect();
  pointerNDC.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  pointerNDC.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  perform3DRaycast();
}

function onCanvasPointerDown(e) {
  pointerDownPos = { x: e.clientX, y: e.clientY };
}

async function onCanvasPointerUp(e) {
  if (!state.editMode) return;
  if (e.button !== 0) return;

  // Ignore if user dragged camera in Orbit mode
  if (!isPointerLocked.value) {
    const dist = Math.hypot(e.clientX - pointerDownPos.x, e.clientY - pointerDownPos.y);
    if (dist > 5) return;

    // Ensure raycast is up-to-date at exact click point
    if (renderer?.domElement) {
      const rect = renderer.domElement.getBoundingClientRect();
      pointerNDC.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointerNDC.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    }
  } else {
    pointerNDC.set(0, 0);
  }

  perform3DRaycast();
  const hv = state.hoveredVoxel;
  if (!hv || hv.blockId === null) return;

  if (state.editTool === 'pick') {
    state.selectedBlockId = Number(hv.blockId);
    update3DCursorVisuals();
    return;
  }

  if (state.editTool === 'remove') {
    await mutateBlocks([{ x: hv.x, y: hv.y, z: hv.z, blockId: null }]);
    perform3DRaycast();
    return;
  }

  if (state.editTool === 'convert') {
    if (Number(hv.blockId) !== Number(state.selectedBlockId)) {
      await mutateBlocks([{ x: hv.x, y: hv.y, z: hv.z, blockId: state.selectedBlockId }]);
      perform3DRaycast();
    }
    return;
  }

  if (state.editTool === 'add' && hv.adjacent) {
    const { x: ax, y: ay, z: az } = hv.adjacent;
    if (ay >= -30 && ay <= 156) {
      // Automatically expand cutawayMaxY if user builds on top of the current cutaway slice
      if (ay > state.cutawayMaxY) {
        state.cutawayMaxY = ay;
      }
      if (ay < state.cutawayMinY) {
        state.cutawayMinY = ay;
      }
      await mutateBlocks([{ x: ax, y: ay, z: az, blockId: state.selectedBlockId }]);
      perform3DRaycast();
    }
  }
}

function initThree() {
  const container = containerRef.value;
  if (!container) return;

  const w = Math.max(300, container.clientWidth);
  const h = Math.max(400, container.clientHeight);

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b0c10);
  scene.fog = new THREE.FogExp2(0x0b0c10, 0.00062);

  camera = new THREE.PerspectiveCamera(48, w / h, 1, 4500);
  camera.position.set(-420, 290, 480);

  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setSize(w, h);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  container.appendChild(renderer.domElement);

  renderer.domElement.addEventListener('pointermove', onCanvasPointerMove);
  renderer.domElement.addEventListener('pointerdown', onCanvasPointerDown);
  renderer.domElement.addEventListener('pointerup', onCanvasPointerUp);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.07;
  controls.target.set(0, 65, 140);

  const ambientLight = new THREE.AmbientLight(0xffffff, 1.05);
  scene.add(ambientLight);

  const sunLight = new THREE.DirectionalLight(0xfff8e7, 1.35);
  sunLight.position.set(-350, 520, 260);
  scene.add(sunLight);

  const backLight = new THREE.DirectionalLight(0x93c5fd, 0.55);
  backLight.position.set(320, 240, -300);
  scene.add(backLight);

  // Translucent Horizontal Slice Ring indicating state.currentY
  const planeGeo = new THREE.RingGeometry(53, 58, 64);
  planeGeo.rotateX(-Math.PI / 2);
  const planeMat = new THREE.MeshBasicMaterial({
    color: 0xe5a93c,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.7
  });
  yPlaneMesh = new THREE.Mesh(planeGeo, planeMat);
  yPlaneMesh.position.set(0, state.currentY + 0.6, 0);
  scene.add(yPlaneMesh);

  // 3D Target Block Highlight Wireframe
  const wireGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(1.04, 1.04, 1.04));
  const wireMat = new THREE.LineBasicMaterial({ color: 0xe5a93c, linewidth: 2 });
  targetWireframeMesh = new THREE.LineSegments(wireGeo, wireMat);
  targetWireframeMesh.visible = false;
  scene.add(targetWireframeMesh);

  // 3D Adjacent Ghost Preview Cube (for 'add' tool)
  const ghostGeo = new THREE.BoxGeometry(0.98, 0.98, 0.98);
  const ghostMat = new THREE.MeshStandardMaterial({
    color: 0x22c55e,
    transparent: true,
    opacity: 0.58,
    roughness: 0.4
  });
  ghostBlockMesh = new THREE.Mesh(ghostGeo, ghostMat);
  ghostBlockMesh.visible = false;
  scene.add(ghostBlockMesh);

  voxelGroup = new THREE.Group();
  scene.add(voxelGroup);

  lastFrameTime = performance.now();
  const animate = (now) => {
    animId = requestAnimationFrame(animate);
    const dt = Math.min(0.1, Math.max(0.001, (now - lastFrameTime) / 1000));
    lastFrameTime = now;

    updateWASDMovement(dt);
    if (!isPointerLocked.value) {
      controls.update();
    }
    renderer.render(scene, camera);
  };
  animate(performance.now());
}

function getOrComputeLayerBuckets(y, stepH, showTerrain) {
  const layer = state.loadedLayers.get(y);
  if (!layer) return null;

  const cached = layerBucketCache.get(y);
  if (
    cached &&
    cached.revision === layer.revision &&
    cached.showTerrain === showTerrain &&
    cached.stepH === stepH
  ) {
    return cached;
  }

  const byBlock = new Map();
  let count = 0;
  const yCenter = y + (stepH - 1) * 0.5;

  for (const [z, startX, len, blockId] of layer.runs) {
    if (!showTerrain && isTerrainBlock(blockId)) continue;
    let arr = byBlock.get(blockId);
    if (!arr) {
      arr = [];
      byBlock.set(blockId, arr);
    }
    const centerX = startX + (len - 1) * 0.5;
    arr.push(centerX, yCenter, z, len, stepH, 1);
    count += len;
  }

  for (const [x, z, blockId] of layer.blocks) {
    if (!showTerrain && isTerrainBlock(blockId)) continue;
    let arr = byBlock.get(blockId);
    if (!arr) {
      arr = [];
      byBlock.set(blockId, arr);
    }
    arr.push(x, yCenter, z, 1, stepH, 1);
    count += 1;
  }

  const entry = {
    revision: layer.revision,
    showTerrain,
    stepH,
    byBlock,
    count
  };
  layerBucketCache.set(y, entry);
  return entry;
}

function rebuildVoxelMeshes() {
  if (!scene || !voxelGroup || !state.palette) return;

  while (voxelGroup.children.length > 0) {
    const child = voxelGroup.children.pop();
    if (child.material) child.material.dispose();
  }

  const buckets = new Map();
  let totalRepresentedBlocks = 0;

  const minY = state.cutawayMinY;
  const maxY = state.cutawayMaxY;
  const showTerrain = state.showTerrain;
  const yList = availableYLevels.value;

  for (let idx = 0; idx < yList.length; idx++) {
    const y = yList[idx];
    if (y < minY || y > maxY) continue;

    const nextY = idx < yList.length - 1 ? yList[idx + 1] : y + 1;
    const stepH = Math.max(1, Math.min(4, nextY - y));

    const layerEntry = getOrComputeLayerBuckets(y, stepH, showTerrain);
    if (!layerEntry) continue;

    totalRepresentedBlocks += layerEntry.count;
    for (const [blockId, arr] of layerEntry.byBlock.entries()) {
      let bucket = buckets.get(blockId);
      if (!bucket) {
        bucket = [];
        buckets.set(blockId, bucket);
      }
      bucket.push(arr);
    }
  }

  const dummy = new THREE.Object3D();

  for (const [blockId, chunkList] of buckets.entries()) {
    let totalFloats = 0;
    for (let c = 0; c < chunkList.length; c++) {
      totalFloats += chunkList[c].length;
    }
    const instanceCount = totalFloats / 6;
    if (instanceCount === 0) continue;

    const info = getBlockInfo(blockId) || { color: '#888888', roughness: 0.7 };
    const tex = useRealTextures.value ? getOrLoadThreeTexture(blockId, info) : null;

    const mat = new THREE.MeshStandardMaterial({
      color: tex ? new THREE.Color(0xffffff) : new THREE.Color(info.color),
      map: tex || null,
      roughness: info.roughness ?? 0.75,
      metalness: blockId === 9 || blockId === 13 || blockId === 20 ? 0.35 : 0.05,
      transparent: Boolean(info.transparent),
      opacity: info.transparent ? 0.72 : 1.0,
      emissive: info.emissive ? new THREE.Color(info.color) : new THREE.Color(0x000000),
      emissiveIntensity: info.emissive ? 0.65 : 0
    });

    if (tex) {
      applyWorldSpaceVoxelUV(mat);
    }

    const instanced = new THREE.InstancedMesh(sharedBoxGeo, mat, instanceCount);
    instanced.userData = { blockId };
    let mIdx = 0;
    for (let c = 0; c < chunkList.length; c++) {
      const transforms = chunkList[c];
      for (let i = 0; i < transforms.length; i += 6) {
        dummy.position.set(transforms[i], transforms[i + 1], transforms[i + 2]);
        dummy.scale.set(transforms[i + 3], transforms[i + 4], transforms[i + 5]);
        dummy.updateMatrix();
        instanced.setMatrixAt(mIdx++, dummy.matrix);
      }
    }
    instanced.instanceMatrix.needsUpdate = true;
    instanced.computeBoundingSphere();
    voxelGroup.add(instanced);
  }

  renderedVoxelCount.value = totalRepresentedBlocks;
}

function jumpCamera(preset) {
  if (!camera || !controls) return;
  if (preset === 'all') {
    state.cutawayMinY = -30;
    state.cutawayMaxY = 156;
    camera.position.set(-440, 310, 490);
    controls.target.set(0, 65, 130);
  } else if (preset === 'rotunda-inside') {
    state.cutawayMinY = 76;
    state.cutawayMaxY = 108;
    camera.position.set(0, 152, 92);
    controls.target.set(0, 92, 0);
  } else if (preset === 'riders-interiors') {
    state.cutawayMinY = 78;
    state.cutawayMaxY = 86;
    camera.position.set(15, 185, 130);
    controls.target.set(10, 82, 10);
  } else if (preset === 'rotunda-full') {
    state.cutawayMinY = -30;
    state.cutawayMaxY = 156;
    camera.position.set(-165, 175, 145);
    controls.target.set(0, 96, -10);
  } else if (preset === 'parapet') {
    state.cutawayMinY = -30;
    state.cutawayMaxY = 156;
    camera.position.set(-245, 125, 195);
    controls.target.set(-60, 45, 155);
  } else if (preset === 'threshing-valley') {
    state.cutawayMinY = 10;
    state.cutawayMaxY = 88;
    camera.position.set(-385, 95, -45);
    controls.target.set(-255, 22, -105);
  } else if (preset === 'south-campus') {
    state.cutawayMinY = 50;
    state.cutawayMaxY = 63;
    camera.position.set(0, 220, 560);
    controls.target.set(0, 58, 385);
  } else if (preset === 'scribe') {
    state.cutawayMinY = 9;
    state.cutawayMaxY = 18;
    camera.position.set(-255, 95, 455);
    controls.target.set(-155, 14, 378);
  }
  controls.update();
  rebuildVoxelMeshes();
}

function updateRendererSize() {
  const container = containerRef.value;
  if (!container || !renderer || !camera) return;
  const w = container.clientWidth;
  const h = container.clientHeight;
  if (w <= 0 || h <= 0) return;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
}

watch(
  () => [
    state.cutawayMinY,
    state.cutawayMaxY,
    state.isLoading3D,
    state.showTerrain,
    useRealTextures.value,
    state.layerRevision
  ],
  () => {
    rebuildVoxelMeshes();
  }
);

watch(
  () => [state.editMode, state.editTool, state.selectedBlockId],
  () => {
    update3DCursorVisuals();
  }
);

watch(
  () => [state.currentY, highlightCurrentY.value],
  () => {
    if (yPlaneMesh) {
      yPlaneMesh.position.y = state.currentY + 0.6;
      yPlaneMesh.visible = highlightCurrentY.value;
    }
  }
);

onMounted(async () => {
  await nextTick();
  initThree();

  if (window.ResizeObserver && containerRef.value) {
    resizeObserver = new ResizeObserver(() => {
      updateRendererSize();
    });
    resizeObserver.observe(containerRef.value);
  }
  window.addEventListener('resize', updateRendererSize);
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', clearKeys);
  document.addEventListener('pointerlockchange', onPointerLockChange);
  document.addEventListener('mousemove', onMouseMoveFreeLook);

  await loadAllLayersFor3D();
  jumpCamera('all');
  updateRendererSize();
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', updateRendererSize);
  window.removeEventListener('keydown', onKeyDown);
  window.removeEventListener('keyup', onKeyUp);
  window.removeEventListener('blur', clearKeys);
  document.removeEventListener('pointerlockchange', onPointerLockChange);
  document.removeEventListener('mousemove', onMouseMoveFreeLook);
  if (renderer?.domElement) {
    renderer.domElement.removeEventListener('pointermove', onCanvasPointerMove);
    renderer.domElement.removeEventListener('pointerdown', onCanvasPointerDown);
    renderer.domElement.removeEventListener('pointerup', onCanvasPointerUp);
  }
  if (document.pointerLockElement) {
    document.exitPointerLock();
  }
  if (resizeObserver) resizeObserver.disconnect();
  if (animId) cancelAnimationFrame(animId);
  if (renderer) renderer.dispose();
});
</script>

<template>
  <div class="viewer-3d-wrap" :class="{ 'edit-mode-cursor': state.editMode }" ref="containerRef">
    <!-- Top 3D Camera & Cutaway Controls -->
    <div class="canvas-toolbar">
      <div class="toolbar-group">
        <button class="btn-tactical" @click="jumpCamera('all')">
          🏔️ Gesamt-Gebirge &amp; Campus
        </button>
        <button class="btn-tactical" @click="jumpCamera('rotunda-inside')">
          🐉 Rotunda &amp; 6 Statuen
        </button>
        <button class="btn-tactical" @click="jumpCamera('riders-interiors')">
          🏠 Reiter-Innenräume (Y=86)
        </button>
        <button class="btn-tactical" @click="jumpCamera('threshing-valley')">
          🌲 West-Tal &amp; Dreschen
        </button>
        <button class="btn-tactical" @click="jumpCamera('south-campus')">
          🏛️ Süd-Campus Innen (Y=63)
        </button>
        <button class="btn-tactical" @click="jumpCamera('scribe')">
          📚 Scribe Archiv (Y=10)
        </button>
      </div>

      <div class="toolbar-group font-mono">
        <button
          class="btn-tactical"
          :class="{ 'btn-active-flight': isPointerLocked }"
          @click="togglePointerLock"
          title="Minecraft Creative-Freiflug mit direktem Maus-Umschauen (Taste F, Beenden mit ESC)"
        >
          {{ isPointerLocked ? '🎯 Freiflug Aktiv (ESC)' : '✈️ Freiflug-Modus (F)' }}
        </button>
        <label class="cutaway-control" title="Fluggeschwindigkeit für WASD">
          <span>WASD-Speed:</span>
          <input
            type="range"
            min="30"
            max="320"
            step="10"
            v-model.number="moveSpeed"
            class="mini-slider"
          />
        </label>
        <label class="cutaway-control">
          <input type="checkbox" v-model="useRealTextures" />
          <span>ATM11 Texturen</span>
        </label>
        <label class="cutaway-control">
          <input type="checkbox" v-model="state.showTerrain" />
          <span>Berg-Landschaft</span>
        </label>
        <label class="cutaway-control">
          <span>3D-Schnitt (Max Y={{ state.cutawayMaxY }}):</span>
          <input
            type="range"
            min="-30"
            max="156"
            step="1"
            v-model.number="state.cutawayMaxY"
            class="mini-slider"
          />
        </label>
        <label class="cutaway-control">
          <input type="checkbox" v-model="highlightCurrentY" />
          <span>Y={{ state.currentY }} Ring</span>
        </label>
      </div>
    </div>

    <!-- Center Crosshair when in Minecraft Free-Look mode -->
    <div v-if="isPointerLocked" class="crosshair-overlay">+</div>

    <!-- Interactive On-Screen WASD Key Visualizer & Touch/Mouse Pad -->
    <div class="wasd-overlay font-mono">
      <div class="wasd-row">
        <button
          class="keycap"
          :class="{ active: activeKeysList.includes('KeyQ') || activeKeysList.includes('KeyC') }"
          @mousedown="pressedKeys.add('KeyQ'); syncActiveKeysUI()"
          @mouseup="pressedKeys.delete('KeyQ'); syncActiveKeysUI()"
          @mouseleave="pressedKeys.delete('KeyQ'); syncActiveKeysUI()"
          title="Sinken (Q / C)"
        >Q↓</button>
        <button
          class="keycap"
          :class="{ active: activeKeysList.includes('KeyW') || activeKeysList.includes('ArrowUp') }"
          @mousedown="pressedKeys.add('KeyW'); syncActiveKeysUI()"
          @mouseup="pressedKeys.delete('KeyW'); syncActiveKeysUI()"
          @mouseleave="pressedKeys.delete('KeyW'); syncActiveKeysUI()"
          title="Vorwärts (W)"
        >W</button>
        <button
          class="keycap"
          :class="{ active: activeKeysList.includes('KeyE') || activeKeysList.includes('Space') }"
          @mousedown="pressedKeys.add('KeyE'); syncActiveKeysUI()"
          @mouseup="pressedKeys.delete('KeyE'); syncActiveKeysUI()"
          @mouseleave="pressedKeys.delete('KeyE'); syncActiveKeysUI()"
          title="Steigen (E / Space)"
        >E↑</button>
      </div>
      <div class="wasd-row">
        <button
          class="keycap"
          :class="{ active: activeKeysList.includes('KeyA') || activeKeysList.includes('ArrowLeft') }"
          @mousedown="pressedKeys.add('KeyA'); syncActiveKeysUI()"
          @mouseup="pressedKeys.delete('KeyA'); syncActiveKeysUI()"
          @mouseleave="pressedKeys.delete('KeyA'); syncActiveKeysUI()"
          title="Links (A)"
        >A</button>
        <button
          class="keycap"
          :class="{ active: activeKeysList.includes('KeyS') || activeKeysList.includes('ArrowDown') }"
          @mousedown="pressedKeys.add('KeyS'); syncActiveKeysUI()"
          @mouseup="pressedKeys.delete('KeyS'); syncActiveKeysUI()"
          @mouseleave="pressedKeys.delete('KeyS'); syncActiveKeysUI()"
          title="Rückwärts (S)"
        >S</button>
        <button
          class="keycap"
          :class="{ active: activeKeysList.includes('KeyD') || activeKeysList.includes('ArrowRight') }"
          @mousedown="pressedKeys.add('KeyD'); syncActiveKeysUI()"
          @mouseup="pressedKeys.delete('KeyD'); syncActiveKeysUI()"
          @mouseleave="pressedKeys.delete('KeyD'); syncActiveKeysUI()"
          title="Rechts (D)"
        >D</button>
      </div>
      <div class="wasd-hint">SHIFT = Turbo · F = Maus-Blick</div>
    </div>

    <!-- Loading Banner -->
    <div v-if="state.isLoading3D" class="loading-overlay font-mono">
      Lade alle {{ state.manifest?.totalLayers || 187 }} layer.Y.json Ebenen &amp; echte ATM 11 Block-Texturen...
    </div>

    <!-- Bottom 3D Info & Live Block Inspector HUD -->
    <div class="canvas-hud font-mono">
      <div>
        <span class="text-accent">3D VOXEL ENGINE</span>
        <span class="text-muted"> | Blöcke: </span>
        <strong>{{ renderedVoxelCount.toLocaleString('de-DE') }}</strong>
        <template v-if="state.hoveredVoxel && state.hoveredVoxel.blockId !== null">
          <span class="text-muted"> | Ziel: </span>
          <strong class="text-blue">
            ({{ state.hoveredVoxel.x }}, {{ state.hoveredVoxel.y }}, {{ state.hoveredVoxel.z }})
          </strong>
          <span class="text-accent">
            #{{ state.hoveredVoxel.blockId }} {{ state.hoveredVoxel.blockInfo?.name }}
          </span>
          <template v-if="state.editMode && state.editTool === 'add' && state.hoveredVoxel.adjacent">
            <span class="text-muted"> → Anliegend+: </span>
            <strong style="color: #86efac">
              ({{ state.hoveredVoxel.adjacent.x }}, {{ state.hoveredVoxel.adjacent.y }}, {{ state.hoveredVoxel.adjacent.z }})
            </strong>
          </template>
        </template>
      </div>
      <div class="text-muted">
        <template v-if="state.editMode">
          <strong class="text-accent">3D-EDITOR:</strong> Klick auf Block = {{ state.editTool === 'add' ? 'Anliegend platzieren' : state.editTool === 'convert' ? 'Block konvertieren' : state.editTool === 'remove' ? 'Block entfernen' : 'Pipette' }} · Tasten <strong>1–4</strong> = Werkzeug · <strong>Strg+Z</strong> = Undo
        </template>
        <template v-else>
          <strong>WASD</strong>: Bewegen · <strong>Space/E</strong>: Hoch · <strong>Q/C</strong>: Runter · <strong>Shift</strong>: Sprint · <strong>F</strong>: Freiflug · <strong>Maus</strong>: Orbit/Zoom
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.viewer-3d-wrap {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 640px;
  flex: 1;
  background: #0b0c10;
  border: 1px solid var(--border-subtle);
  border-radius: 6px;
  overflow: hidden;
  display: flex;
}

.viewer-3d-wrap.edit-mode-cursor :deep(canvas) {
  cursor: crosshair;
}

.viewer-3d-wrap :deep(canvas) {
  width: 100% !important;
  height: 100% !important;
  display: block;
}

.canvas-toolbar {
  position: absolute;
  top: 0.75rem;
  left: 0.75rem;
  right: 0.75rem;
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 0.5rem;
  z-index: 10;
  pointer-events: none;
}

.toolbar-group {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem;
  background: rgba(15, 16, 20, 0.88);
  border: 1px solid var(--border-subtle);
  padding: 0.35rem 0.6rem;
  border-radius: 5px;
  pointer-events: auto;
  backdrop-filter: blur(6px);
}

.btn-active-flight {
  background: rgba(229, 169, 60, 0.25) !important;
  border-color: var(--accent) !important;
  color: var(--accent) !important;
}

.cutaway-control {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.74rem;
  color: var(--text-white);
  cursor: pointer;
}

.mini-slider {
  width: 80px;
  accent-color: var(--accent);
}

.crosshair-overlay {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  color: rgba(229, 169, 60, 0.85);
  font-size: 1.5rem;
  font-family: monospace;
  pointer-events: none;
  z-index: 15;
  text-shadow: 0 0 4px #000;
}

.wasd-overlay {
  position: absolute;
  bottom: 3.4rem;
  right: 0.85rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.25rem;
  background: rgba(15, 16, 20, 0.82);
  border: 1px solid var(--border-subtle);
  padding: 0.45rem 0.55rem;
  border-radius: 6px;
  z-index: 12;
  backdrop-filter: blur(4px);
  user-select: none;
}

.wasd-row {
  display: flex;
  gap: 0.25rem;
}

.keycap {
  width: 30px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(30, 33, 42, 0.9);
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 4px;
  color: var(--text-white);
  font-size: 0.7rem;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.08s ease;
}

.keycap:hover {
  border-color: var(--accent);
}

.keycap.active {
  background: var(--accent);
  color: #0b0c10;
  border-color: var(--accent);
  transform: translateY(1px);
  box-shadow: 0 0 8px rgba(229, 169, 60, 0.5);
}

.wasd-hint {
  font-size: 0.62rem;
  color: var(--text-muted);
  margin-top: 0.15rem;
}

.loading-overlay {
  position: absolute;
  inset: 0;
  background: rgba(11, 12, 16, 0.82);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--accent);
  font-size: 0.95rem;
  z-index: 20;
}

.canvas-hud {
  position: absolute;
  bottom: 0.75rem;
  left: 0.75rem;
  right: 0.75rem;
  background: rgba(15, 16, 20, 0.92);
  border: 1px solid var(--border-subtle);
  border-radius: 5px;
  padding: 0.5rem 0.85rem;
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  gap: 0.75rem;
  font-size: 0.75rem;
  pointer-events: none;
}
</style>
