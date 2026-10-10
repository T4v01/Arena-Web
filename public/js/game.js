import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { clone as skeletonClone } from 'three/addons/utils/SkeletonUtils.js';

// ===================================================================
// DATOS DE CLASE: modelo FBX real (con arma incluida en la malla),
// texturas propias, y animaciones reales que trae cada FBX.
// ===================================================================
const CLASS_ASSET = {
  warrior: {
    file: '/assets/models/warrior/character.fbx',
    textures: { 'Warrior_Texture': '/assets/models/warrior/Warrior_Texture.png',
                'Warrior_Sword_Texture': '/assets/models/warrior/Warrior_Sword_Texture.png' },
    anims: { idle:'Idle', walk:'Walk', run:'Run', attack:['Sword_Attack','Sword_AttackFast'], hit:'RecieveHit', death:'Death', roll:'Roll' },
    swingSfx: ['impactMetal_heavy_000.ogg','impactMetal_heavy_001.ogg','impactMetal_heavy_002.ogg']
  },
  rogue: {
    file: '/assets/models/rogue/character.fbx',
    textures: { 'Rogue_Texture': '/assets/models/rogue/Rogue_Texture.png',
                'Rogue_Dagger_Texture': '/assets/models/rogue/Rogue_Dagger_Texture.png' },
    anims: { idle:'Idle', walk:'Walk', run:'Run', attack:['Dagger_Attack','Dagger_Attack2'], hit:'RecieveHit', death:'Death', roll:'Roll' },
    swingSfx: ['knifeSlice.ogg','knifeSlice2.ogg']
  },
  mage: {
    file: '/assets/models/mage/character.fbx',
    textures: { 'Wizard_Texture': '/assets/models/mage/Wizard_Texture.png',
                'Wizard_Staff_Texture': '/assets/models/mage/Wizard_Staff_Texture.png' },
    anims: { idle:'Idle', walk:'Walk', run:'Run', attack:['Staff_Attack'], hit:'RecieveHit', death:'Death', roll:'Roll', spell1:'Spell1', spell2:'Spell2' },
    swingSfx: ['magic_cast.ogg']
  },
  ranger: {
    file: '/assets/models/ranger/character.fbx',
    textures: { 'Ranger_Texture': '/assets/models/ranger/Ranger_Texture.png',
                'Ranger_Bow_Texture': '/assets/models/ranger/Ranger_Bow_Texture.png' },
    anims: { idle:'Idle', walk:'Walk', run:'Run', attack:['Bow_Attack_Draw','Bow_Attack_Shoot'], hit:'RecieveHit', death:'Death', roll:'Roll' },
    swingSfx: ['magic_cast.ogg']
  },
  cleric: {
    file: '/assets/models/cleric/character.fbx',
    textures: { 'Cleric_Texture': '/assets/models/cleric/Cleric_Texture.png',
                'Cleric_Staff_Texture': '/assets/models/cleric/Cleric_Staff_Texture.png' },
    anims: { idle:'Idle', walk:'Walk', run:'Run', attack:['Staff_Attack'], hit:'RecieveHit', death:'Death', roll:'Roll', spell1:'Spell1', spell2:'Spell2' },
    swingSfx: ['impactMetal_heavy_000.ogg']
  }
};
const HIT_SFX = ['impactPunch_medium_000.ogg','impactPunch_medium_001.ogg','impactPunch_medium_002.ogg'];
const FOOTSTEP_SFX = Array.from({length:10},(_,i)=>`footstep0${i}.ogg`);

// ===================================================================
// MONSTRUOS (Quaternius Animated Monster Pack, CC0) — simple, intermedio
// y mini-boss para el sistema de experiencia/nivel.
// ===================================================================
const MONSTER_ASSET = {
  slime:    { file:'/assets/models/monsters/Slime.fbx',    anims:{ idle:'Slime_Idle',    move:'Slime_Walk',    attack:['Slime_Attack'],           death:'Slime_Death' },    targetHeight:0.75 },
  skeleton: { file:'/assets/models/monsters/Skeleton.fbx', anims:{ idle:'Skeleton_Idle', move:'Skeleton_Running', attack:['Skeleton_Attack'],     death:'Skeleton_Death' }, targetHeight:1.85 },
  dragon:   { file:'/assets/models/monsters/Dragon.fbx',   anims:{ idle:'Dragon_Flying', move:'Dragon_Flying', attack:['Dragon_Attack','Dragon_Attack2'], death:'Dragon_Death', hit:'Dragon_Hit' }, targetHeight:2.8, flying:true }
};
const GRAVITY = 24;
const PLAYER_RADIUS = 0.45;
let invertLook = localStorage.getItem('invertLook') === '1';

function rand(arr){ return arr[Math.floor(Math.random()*arr.length)]; }

// ===================================================================
// ESTADO GLOBAL
// ===================================================================
let socket = null;
let myId = null, myClass = null, myRoomCode = null;
let classesDef = null, abilitiesDef = null;
let arenaRadius = 85;
let matchState = 'waiting', matchEndsAt = 0, killLimit = 20;
let localAlive = true, inputLocked = false;
let velocityY = 0, grounded = true, onGroundY = 0;

const remotePlayers = new Map();
let localMesh=null, localMixer=null, localActions=null, localRoot=null;
const clock = new THREE.Clock();

const keys = { w:false,a:false,s:false,d:false };
let yaw = 0, pitch = 0;
let lastAttackClientTime = 0;
let lastMoveSent = 0;
const abilityCooldownUntil = {1:0,2:0,3:0,4:0};

// ===================================================================
// THREE.JS BASE
// ===================================================================
const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias:true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio,2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(64, window.innerWidth/window.innerHeight, 0.1, 900);
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth/window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---- Cielo real (HDRI CC0) con degradado de respaldo mientras carga ----
const skyColorTop = new THREE.Color(0x1c3a63);
const skyColorHorizon = new THREE.Color(0xdf9a5c);
const skyGeo = new THREE.SphereGeometry(700, 24, 16);
const skyMat = new THREE.ShaderMaterial({
  side: THREE.BackSide,
  uniforms: { top:{value:skyColorTop}, bottom:{value:skyColorHorizon} },
  vertexShader:`varying vec3 vPos; void main(){ vPos=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
  fragmentShader:`
    varying vec3 vPos; uniform vec3 top; uniform vec3 bottom;
    void main(){
      float h = normalize(vPos).y;
      float t = smoothstep(-0.05, 0.55, h);
      vec3 col = mix(bottom, top, t);
      gl_FragColor = vec4(col,1.0);
    }`
});
const fallbackSky = new THREE.Mesh(skyGeo, skyMat);
scene.add(fallbackSky);
scene.fog = new THREE.FogExp2(0x9a8266, 0.0055);

const pmrem = new THREE.PMREMGenerator(renderer);
pmrem.compileEquirectangularShader();
new RGBELoader().load('/assets/sky/sky.hdr', (hdr) => {
  const envMap = pmrem.fromEquirectangular(hdr).texture;
  scene.background = envMap;
  scene.environment = envMap;
  scene.remove(fallbackSky);
  hdr.dispose();
  pmrem.dispose();
});

scene.add(new THREE.HemisphereLight(0xcfd9f0, 0x453522, 0.55));
const sun = new THREE.DirectionalLight(0xffe8c2, 1.15);
sun.position.set(60,90,30);
sun.castShadow = true;
sun.shadow.mapSize.set(2048,2048);
sun.shadow.camera.left=-70; sun.shadow.camera.right=70;
sun.shadow.camera.top=70; sun.shadow.camera.bottom=-70;
sun.shadow.camera.far = 300;
scene.add(sun);
scene.add(new THREE.AmbientLight(0x554433, 0.22));

// Antorchas de color repartidas por el mapa para dar vida visual
function addTorch(x,z,color=0xff8a3d) {
  const light = new THREE.PointLight(color, 2.2, 14, 2);
  light.position.set(x, 2.4, z);
  scene.add(light);
  const glow = new THREE.Mesh(new THREE.SphereGeometry(0.12,8,8), new THREE.MeshBasicMaterial({ color }));
  glow.position.copy(light.position);
  scene.add(glow);
}
[[16,12],[-28,20],[18,-42],[-40,8],[38,-8],[0,40],[48,2],[-48,-2],[0,-40],[-20,-38]].forEach(([x,z])=>addTorch(x,z, Math.random()>0.5?0xff8a3d:0x5fb0ff));

// ---- Suelo (textura procedural tipo losas de piedra, ya que no encontré
// una textura de piso realmente tileable y temáticamente apropiada en las
// fuentes CC0 a las que tengo acceso — ver nota en README) ----
function makeGroundTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 512;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#6b6154'; ctx.fillRect(0,0,512,512);
  for (let i=0;i<9000;i++) {
    const shade = 90+Math.random()*50;
    ctx.fillStyle = `rgba(${shade|0},${(shade-8)|0},${(shade-18)|0},${0.12+Math.random()*0.18})`;
    ctx.fillRect(Math.random()*512, Math.random()*512, 1+Math.random()*2, 1+Math.random()*2);
  }
  ctx.strokeStyle = 'rgba(20,16,12,0.5)'; ctx.lineWidth = 2;
  const tile = 64;
  for (let x=0;x<=512;x+=tile){ ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,512); ctx.stroke(); }
  for (let y=0;y<=512;y+=tile){ ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(512,y); ctx.stroke(); }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(28,28);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
const groundMat = new THREE.MeshStandardMaterial({ map: makeGroundTexture(), roughness:0.95 });
const ground = new THREE.Mesh(new THREE.CircleGeometry(arenaRadius+20, 64), groundMat);
ground.rotation.x = -Math.PI/2;
ground.receiveShadow = true;
scene.add(ground);

// ===================================================================
// OBSTACULOS Y COLISION DE PISOS POR NIVEL
// En vez de una lista de "rampas" adivinadas a mano, usamos un raycast
// hacia abajo contra las superficies reales de la escena (muros, cajas,
// escaleras propias Y las piezas del escenario descargado). Esto permite
// que cualquier plataforma elevada -incluidas las del dungeon original-
// sea pisable de verdad, resolviendo el problema de "me subo y me caigo".
// ===================================================================
const colliderBoxes = [];   // bloqueo horizontal (muros/cajas altas)
const walkableMeshes = [];  // superficies sobre las que se puede parar

function addAutoCollidersFromObject(root) {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3();
  let added = 0;
  root.traverse(o => {
    if (!o.isMesh) return;
    box.setFromObject(o);
    const size = new THREE.Vector3(); box.getSize(size);
    const footprint = Math.max(size.x, size.z);
    if (footprint < 0.6) return;                     // adornos pequeños: ignorar
    if (size.y < 0.35 && box.min.y < 0.25) return;    // decals de piso a nivel 0: ya cubre el suelo base
    // Solo aporta como SUPERFICIE PISABLE (para los niveles/escaleras del
    // propio escenario). Ya NO genera bloqueo horizontal: una caja de
    // colision alrededor de un muro con una puerta tapa tambien la puerta
    // (no hay forma de "recortar" el hueco solo con una caja), y eso era
    // lo que te impedia entrar a las estructuras. El bloqueo horizontal
    // real lo dan solo los muros/cajas que yo coloco a mano mas abajo,
    // porque ahi SI controlo dónde dejo aberturas.
    walkableMeshes.push(o);
    added++;
  });
  return added;
}

function addWallSegment(cx,cz,angle,length,thickness,height,color=0x2c2620) {
  const geo = new THREE.BoxGeometry(length, height, thickness);
  const mat = new THREE.MeshStandardMaterial({ color, roughness:0.9 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(cx, height/2, cz);
  mesh.rotation.y = angle;
  mesh.castShadow = true; mesh.receiveShadow = true;
  scene.add(mesh);
  const hl = Math.abs(Math.cos(angle))*length/2 + Math.abs(Math.sin(angle))*thickness/2;
  const hd = Math.abs(Math.sin(angle))*length/2 + Math.abs(Math.cos(angle))*thickness/2;
  colliderBoxes.push({ minX:cx-hl, maxX:cx+hl, minZ:cz-hd, maxZ:cz+hd, height });
}

function addCrate(x,z,size=1.3,color=0x8a5a2e) {
  const geo = new THREE.BoxGeometry(size,size,size);
  const mat = new THREE.MeshStandardMaterial({ color, roughness:0.85 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, size/2, z);
  mesh.rotation.y = Math.random()*Math.PI;
  mesh.castShadow = true; mesh.receiveShadow = true;
  scene.add(mesh);
  const h = size/2*1.06;
  colliderBoxes.push({ minX:x-h, maxX:x+h, minZ:z-h, maxZ:z+h, height:size });
  walkableMeshes.push(mesh);
}

function addStairs(cx,cz,angle,steps=8,stepW=3.2,stepD=0.6,stepH=0.28,color=0x574936) {
  const group = new THREE.Group();
  group.position.set(cx,0,cz);
  group.rotation.y = angle;
  for (let i=0;i<steps;i++) {
    const geo = new THREE.BoxGeometry(stepW, stepH*(i+1), stepD);
    const mat = new THREE.MeshStandardMaterial({ color, roughness:0.9 });
    const step = new THREE.Mesh(geo, mat);
    step.position.set(0, stepH*(i+1)/2, i*stepD);
    step.castShadow = true; step.receiveShadow = true;
    group.add(step);
  }
  const platGeo = new THREE.BoxGeometry(stepW, 0.3, stepW);
  const platMat = new THREE.MeshStandardMaterial({ color:0x4a4030, roughness:0.9 });
  const plat = new THREE.Mesh(platGeo, platMat);
  plat.position.set(0, steps*stepH, steps*stepD*0.5 + stepW*0.3);
  plat.castShadow = true; plat.receiveShadow = true;
  group.add(plat);
  scene.add(group);
  group.updateMatrixWorld(true);
  group.traverse(o => { if (o.isMesh) walkableMeshes.push(o); });
}

function addTower(x,z,radius=2.2,height=8,color=0x2c2620) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius,radius*1.15,height,10), new THREE.MeshStandardMaterial({ color, roughness:0.85 }));
  mesh.position.set(x,height/2,z);
  mesh.castShadow = true; mesh.receiveShadow = true;
  scene.add(mesh);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(radius*1.3,height*0.35,10), new THREE.MeshStandardMaterial({ color:0x1d1812, roughness:0.8 }));
  roof.position.set(x,height+height*0.17,z);
  roof.castShadow = true;
  scene.add(roof);
  const h = radius*1.1;
  colliderBoxes.push({ minX:x-h, maxX:x+h, minZ:z-h, maxZ:z+h, height });
  walkableMeshes.push(mesh);
}

// Muralla perimetral con 4 PORTONES reales (huecos deliberados donde
// llegan los caminos) y torres en cada esquina y en cada portón — una
// sola fortificación conectada rodeando el mapa, no piezas sueltas.
const WALL_R = arenaRadius + 3;
const WALL_SIDES = 28;
const GATE_ANGLES = [0, Math.PI/2, Math.PI, -Math.PI/2];
const GATE_WIDTH_SEGS = 2; // cuantos segmentos de muro se omiten en cada portón
for (let i=0;i<WALL_SIDES;i++) {
  const a1 = (i/WALL_SIDES)*Math.PI*2;
  const isGate = GATE_ANGLES.some(ga => {
    let diff = Math.abs(a1-ga); if (diff>Math.PI) diff = Math.PI*2-diff;
    return diff < (GATE_WIDTH_SEGS/WALL_SIDES)*Math.PI;
  });
  if (isGate) continue;
  const segLen = (2*Math.PI*WALL_R/WALL_SIDES) * 1.04;
  const cx = Math.sin(a1)*WALL_R, cz = Math.cos(a1)*WALL_R;
  addWallSegment(cx, cz, a1, segLen, 1.4, 6.2);
}
// Torres en las 4 esquinas intermedias (45/135/225/315) + flanqueando cada portón
[Math.PI/4, 3*Math.PI/4, -Math.PI/4, -3*Math.PI/4].forEach(a => addTower(Math.sin(a)*WALL_R, Math.cos(a)*WALL_R, 2.6, 9));
GATE_ANGLES.forEach(ga => {
  const side = ga + 0.19, side2 = ga - 0.19;
  addTower(Math.sin(side)*WALL_R, Math.cos(side)*WALL_R, 2.0, 7.5);
  addTower(Math.sin(side2)*WALL_R, Math.cos(side2)*WALL_R, 2.0, 7.5);
});

// Caminos que conectan el portón con el patio central, con antorchas y
// algunas cajas a los lados (nunca cruzando el paso).
[[0,1],[1,0],[0,-1],[-1,0]].forEach(([dx,dz]) => {
  for (let d=22; d<WALL_R-4; d+=12) {
    if (Math.random()>0.5) addCrate(dx*d + dz*3, dz*d + dx*3, 1.2);
    addTorch(dx*d - dz*3.6, dz*d - dx*3.6, Math.random()>0.5?0xff8a3d:0x5fb0ff);
  }
});

const crateClusters = [
  [18,10],[22,14],[-20,15],[-24,18],[12,-30],[16,-34],[-14,-26],[-30,8],[30,-8],[26,26],[-26,-26]
].filter(([x,z]) => Math.hypot(x,z) > 16); // que no queden dentro de la mazmorra central
crateClusters.forEach(([x,z]) => {
  addCrate(x,z,1.4);
  addCrate(x+1.6,z+0.7,1.1);
  if (Math.random()>0.4) addCrate(x-1.3,z+1.4,1.3);
});

addStairs(0, 16, 0, 8, 3.2, 0.55, 0.28);
addStairs(16, 0, Math.PI/2, 8, 3.2, 0.55, 0.28);
addStairs(-16, 0, -Math.PI/2, 8, 3.2, 0.55, 0.28);
addStairs(0, -16, Math.PI, 8, 3.2, 0.55, 0.28);

// Raycast hacia abajo contra las superficies reales para saber a que
// altura esta "el piso" bajo el jugador, funcione o no en varios niveles.
const _groundRay = new THREE.Raycaster();
function getGroundHeight(x, currentY, z) {
  _groundRay.set(new THREE.Vector3(x, currentY+1.6, z), new THREE.Vector3(0,-1,0));
  _groundRay.far = 6;
  const hits = _groundRay.intersectObjects(walkableMeshes, false);
  if (hits.length) return hits[0].point.y;
  return currentY > 0.5 ? -Infinity : 0; // sin superficie cercana: sigue cayendo, salvo que ya este a nivel de piso base
}

function resolveHorizontalCollision(pos) {
  for (const b of colliderBoxes) {
    if (pos.y > b.height + 0.15) continue;
    const cx = Math.max(b.minX, Math.min(pos.x, b.maxX));
    const cz = Math.max(b.minZ, Math.min(pos.z, b.maxZ));
    const dx = pos.x - cx, dz = pos.z - cz;
    const distSq = dx*dx+dz*dz;
    if (distSq < PLAYER_RADIUS*PLAYER_RADIUS) {
      const dist = Math.sqrt(distSq) || 0.001;
      const push = (PLAYER_RADIUS - dist);
      pos.x += (dx/dist)*push;
      pos.z += (dz/dist)*push;
    }
  }
  const distCenter = Math.hypot(pos.x,pos.z);
  if (distCenter > arenaRadius) {
    const k = arenaRadius/distCenter;
    pos.x *= k; pos.z *= k;
  }
}

// ===================================================================
// CARGA DE ASSETS
// ===================================================================
const gltfLoader = new GLTFLoader();
const fbxLoader = new FBXLoader();
const texLoader = new THREE.TextureLoader();
const audioLoader = new THREE.AudioLoader();
const listener = new THREE.AudioListener();
camera.add(listener);
const sfxBuffers = {};
const characterTemplates = {};
const monsterTemplates = {};
const monsters = new Map(); // id -> {root, mixer, actions, type, ...}
const monsterHealthBars = new Map(); // id -> sprite

function makeHealthBarSprite() {
  const canvas = document.createElement('canvas');
  canvas.width = 128; canvas.height = 16;
  const tex = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({ map:tex, transparent:true, depthTest:false });
  const spr = new THREE.Sprite(mat);
  spr.scale.set(1.5,0.2,1);
  spr.renderOrder = 999;
  spr.userData.ctx = canvas.getContext('2d');
  spr.userData.tex = tex;
  drawHealthBar(spr, 1);
  return spr;
}
function drawHealthBar(spr, pct) {
  const ctx = spr.userData.ctx;
  ctx.clearRect(0,0,128,16);
  ctx.fillStyle = 'rgba(8,6,4,0.85)'; ctx.fillRect(0,0,128,16);
  const w = Math.max(0, Math.min(1,pct))*124;
  ctx.fillStyle = pct>0.5?'#4ec25a':pct>0.25?'#d8b13a':'#c0392b';
  ctx.fillRect(2,2,w,12);
  spr.userData.tex.needsUpdate = true;
}

function updateLoadingProgress(pct, text) {
  document.getElementById('loadbarFill').style.width = pct + '%';
  if (text) document.getElementById('loadingText').textContent = text;
}

async function loadClassCharacter(cls) {
  const asset = CLASS_ASSET[cls];
  const fbx = await fbxLoader.loadAsync(asset.file);
  const texCache = {};
  await Promise.all(Object.entries(asset.textures).map(async ([matName, url]) => {
    const tex = await texLoader.loadAsync(url);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.flipY = false;
    texCache[matName] = tex;
  }));
  fbx.traverse(o => {
    if (o.isMesh) {
      o.castShadow = true; o.receiveShadow = true;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach(m => {
        const key = Object.keys(texCache).find(k => m.name && m.name.replace(/\s/g,'') === k) || Object.keys(texCache)[0];
        if (key && texCache[key]) { m.map = texCache[key]; m.needsUpdate = true; }
      });
    }
  });
  // Auto-escala: el FBX puede venir en unidades arbitrarias (cm, "unidades
  // genericas" de Blender, etc). En vez de adivinar un factor fijo, medimos
  // la altura real del modelo y lo reescalamos para que un personaje mida
  // ~1.8 unidades de mundo (una persona promedio), sea cual sea su unidad original.
  const box = new THREE.Box3().setFromObject(fbx);
  const rawHeight = box.max.y - box.min.y;
  const TARGET_HEIGHT = 1.8;
  const scaleFactor = rawHeight > 0.001 ? (TARGET_HEIGHT / rawHeight) : 1;
  fbx.scale.setScalar(scaleFactor);
  fbx.updateMatrixWorld(true);
  characterTemplates[cls] = { fbx, anims: fbx.animations, def: asset.anims };
}

async function loadMonsterType(type) {
  const asset = MONSTER_ASSET[type];
  const fbx = await fbxLoader.loadAsync(asset.file);
  fbx.traverse(o => { if (o.isMesh) { o.castShadow=true; o.receiveShadow=true; } });
  const box = new THREE.Box3().setFromObject(fbx);
  const rawHeight = box.max.y - box.min.y;
  const scaleFactor = rawHeight > 0.001 ? (asset.targetHeight/rawHeight) : 1;
  fbx.scale.setScalar(scaleFactor);
  fbx.updateMatrixWorld(true);
  monsterTemplates[type] = { fbx, anims: fbx.animations, def: asset.anims, flying: !!asset.flying };
}

async function preload() {
  updateLoadingProgress(4,'Cargando personajes…');
  await preloadVfxTextures();
  await loadClassCharacter('warrior'); updateLoadingProgress(14);
  await loadClassCharacter('rogue');   updateLoadingProgress(24);
  await loadClassCharacter('mage');    updateLoadingProgress(34);
  await loadClassCharacter('ranger');  updateLoadingProgress(42);
  await loadClassCharacter('cleric');  updateLoadingProgress(48);

  updateLoadingProgress(50,'Cargando criaturas…');
  await loadMonsterType('slime');
  await loadMonsterType('skeleton');
  await loadMonsterType('dragon');
  updateLoadingProgress(55);

  updateLoadingProgress(58,'Cargando escenario…');
  // Una UNICA estructura real (la mazmorra), agrandada para dominar el
  // centro del mapa, en vez de varias copias sueltas repartidas sin
  // conexion. El resto del mapa (muralla perimetral con torres y
  // portones, caminos, cajas, escaleras) es arquitectura propia que yo
  // controlo por completo, conectada entre sí a proposito, para que se
  // sienta como UN conjunto y no piezas al azar.
  const dungeonGltf = await gltfLoader.loadAsync('/assets/models/structure1.glb');
  dungeonGltf.scene.traverse(o => { if (o.isMesh){ o.castShadow=true; o.receiveShadow=true; } });
  const centralInst = dungeonGltf.scene.clone(true);
  centralInst.position.set(0,0,0);
  centralInst.scale.setScalar(2.4);
  scene.add(centralInst);
  const totalColliders = addAutoCollidersFromObject(centralInst);
  console.log('[arena] colliders generados:', totalColliders);

  updateLoadingProgress(70,'Cargando sonidos…');
  const sfxFiles = [...new Set([
    ...Object.values(CLASS_ASSET).flatMap(c=>c.swingSfx),
    ...HIT_SFX, ...FOOTSTEP_SFX, 'magic_cast.ogg','magic_hit.ogg',
    'knifeSlice.ogg','knifeSlice2.ogg',
    'sfx_heal.ogg','sfx_levelup.ogg','sfx_blink.ogg','sfx_buffcast.ogg',
    'sfx_magic2.ogg','sfx_magic3.ogg','sfx_shield.ogg','sfx_holy.ogg'
  ])];
  let loaded=0;
  await Promise.all(sfxFiles.map(f => audioLoader.loadAsync('/assets/sfx/'+f).then(buf => {
    sfxBuffers[f]=buf; loaded++; updateLoadingProgress(70+(loaded/sfxFiles.length)*28);
  })));

  updateLoadingProgress(100,'¡Listo!');
  await new Promise(r=>setTimeout(r,150));
  document.getElementById('loadingScreen').classList.add('hidden');
  document.getElementById('lobbyScreen').classList.remove('hidden');
  playMusic('musicMenu');
}

function playSfxAt(object3d, fileKey, volume=0.8) {
  const buf = sfxBuffers[fileKey];
  if (!buf || !object3d) return;
  const sound = new THREE.PositionalAudio(listener);
  sound.setBuffer(buf); sound.setRefDistance(6); sound.setVolume(volume);
  object3d.add(sound); sound.play();
  sound.onEnded = () => object3d.remove(sound);
}

// ===================================================================
// MUSICA
// ===================================================================
const musicEls = { musicMenu:document.getElementById('musicMenu'), musicBattle1:document.getElementById('musicBattle1'), musicBattle2:document.getElementById('musicBattle2') };
let currentMusic=null;
function playMusic(key){
  if (currentMusic===key) return;
  Object.values(musicEls).forEach(el=>el.pause());
  currentMusic=key;
  const el = musicEls[key]; el.volume=0.32; el.currentTime=0;
  el.play().catch(()=>{});
}

// ===================================================================
// CONSTRUCCION DE PERSONAJES
// ===================================================================
function findByNameContains(root, needle) {
  let found=null;
  root.traverse(o => { if (!found && o.name && o.name.includes(needle)) found=o; });
  return found;
}

function spawnCharacter(cls) {
  const tmpl = characterTemplates[cls];
  const root = skeletonClone(tmpl.fbx);
  const mixer = new THREE.AnimationMixer(root);
  const def = tmpl.def;
  const getClip = name => tmpl.anims.find(c => c.name === name || c.name.endsWith('|'+name));
  const actions = {};
  ['idle','walk','run','hit','death','roll'].forEach(k => {
    const clip = getClip(def[k]);
    if (clip) { actions[k] = mixer.clipAction(clip); }
  });
  actions.attacks = (def.attack||[]).map(n => { const c=getClip(n); return c?mixer.clipAction(c):null; }).filter(Boolean);
  if (def.spell1) { const c=getClip(def.spell1); if (c) actions.spell1 = mixer.clipAction(c); }
  if (def.spell2) { const c=getClip(def.spell2); if (c) actions.spell2 = mixer.clipAction(c); }
  Object.values(actions).forEach(a => {
    if (Array.isArray(a)) return;
    if (a) { a.play(); a.setEffectiveWeight(0); a.enabled=true; }
  });
  actions.attacks.forEach(a=>{ a.play(); a.setEffectiveWeight(0); a.enabled=true; a.setLoop(THREE.LoopOnce); a.clampWhenFinished=true; });
  if (actions.hit) { actions.hit.setLoop(THREE.LoopOnce); actions.hit.clampWhenFinished=true; }
  if (actions.death) { actions.death.setLoop(THREE.LoopOnce); actions.death.clampWhenFinished=true; }
  if (actions.roll) { actions.roll.setLoop(THREE.LoopOnce); actions.roll.clampWhenFinished=true; }
  if (actions.idle) actions.idle.setEffectiveWeight(1);

  return { root, mixer, actions, cls, state:'idle', oneShotUntil:0, _footTimer:0 };
}

function spawnMonster(type) {
  const tmpl = monsterTemplates[type];
  const root = skeletonClone(tmpl.fbx);
  const mixer = new THREE.AnimationMixer(root);
  const def = tmpl.def;
  const getClip = name => tmpl.anims.find(c => c.name === name || c.name.endsWith('|'+name));
  const actions = {};
  ['idle','move','hit'].forEach(k => { const n = def[k]; if (!n) return; const c = getClip(n); if (c) actions[k] = mixer.clipAction(c); });
  const dc = getClip(def.death); if (dc) actions.death = mixer.clipAction(dc);
  actions.attacks = (def.attack||[]).map(n => { const c=getClip(n); return c?mixer.clipAction(c):null; }).filter(Boolean);
  Object.values(actions).forEach(a => { if (Array.isArray(a)) return; if (a) { a.play(); a.setEffectiveWeight(0); a.enabled=true; } });
  actions.attacks.forEach(a=>{ a.play(); a.setEffectiveWeight(0); a.enabled=true; a.setLoop(THREE.LoopOnce); a.clampWhenFinished=true; });
  if (actions.hit) { actions.hit.setLoop(THREE.LoopOnce); actions.hit.clampWhenFinished=true; }
  if (actions.death) { actions.death.setLoop(THREE.LoopOnce); actions.death.clampWhenFinished=true; }
  if (actions.idle) actions.idle.setEffectiveWeight(1);
  return { root, mixer, actions, type, state:'idle', oneShotUntil:0, flying:tmpl.flying };
}

function updateMonsterAnim(entry, moving, dt) {
  const now = performance.now();
  if (entry.state === 'oneshot') {
    if (now < entry.oneShotUntil) { entry.mixer.update(dt); return; }
    entry.state = 'idle';
  }
  const a = entry.actions;
  if (a.idle) a.idle.setEffectiveWeight(THREE.MathUtils.lerp(a.idle.getEffectiveWeight(), (moving && a.move)?0:1, dt*8));
  if (a.move) a.move.setEffectiveWeight(THREE.MathUtils.lerp(a.move.getEffectiveWeight(), moving?1:0, dt*8));
  entry.mixer.update(dt);
}

function playOneShot(entry, action, durationHint=0.5) {
  if (!action) return;
  Object.values(entry.actions).forEach(a => { if (a && !Array.isArray(a) && a!==action) a.setEffectiveWeight(0); });
  entry.actions.attacks.forEach(a=>a.setEffectiveWeight(0));
  action.reset(); action.setEffectiveWeight(1); action.play();
  entry.oneShotUntil = performance.now() + durationHint*1000;
  entry.state = 'oneshot';
}

function updateLocomotion(entry, moving, running, dt) {
  const now = performance.now();
  if (entry.state === 'oneshot') {
    if (now < entry.oneShotUntil) { entry.mixer.update(dt); return; }
    entry.state = 'idle';
  }
  const a = entry.actions;
  const targetIdle = moving?0:1, targetWalk = moving?(running?0:1):0, targetRun = (moving&&running)?1:0;
  if (a.idle) a.idle.setEffectiveWeight(THREE.MathUtils.lerp(a.idle.getEffectiveWeight(), targetIdle, dt*8));
  if (a.walk) a.walk.setEffectiveWeight(THREE.MathUtils.lerp(a.walk.getEffectiveWeight(), targetWalk, dt*8));
  if (a.run)  a.run.setEffectiveWeight(THREE.MathUtils.lerp(a.run.getEffectiveWeight(), targetRun, dt*8));
  entry.mixer.update(dt);
}

// ===================================================================
// EFECTOS VISUALES DE HABILIDADES — con sprites reales (Kenney Particle
// Pack, CC0) en vez de figuras geometricas simples: fuego, humo, chispas,
// tajos y destellos magicos con blending aditivo.
// ===================================================================
const VFX_TEX = {};
const vfxTexLoader = new THREE.TextureLoader();
const VFX_FILES = ['fire_01','fire_02','flame_01','flame_02','flame_03','flame_04','flame_05','flame_06',
  'magic_01','magic_02','magic_03','magic_04','magic_05','smoke_01','smoke_02','smoke_03','smoke_04','smoke_05',
  'spark_01','spark_02','spark_03','spark_04','spark_05','slash_01','slash_02','slash_03','slash_04',
  'circle_01','circle_02','circle_03','star_01','scratch_01'];
function preloadVfxTextures() {
  return Promise.all(VFX_FILES.map(f => vfxTexLoader.loadAsync(`/assets/vfx/${f}.png`).then(t => { t.colorSpace=THREE.SRGBColorSpace; VFX_TEX[f]=t; })));
}
function vfxTex(name){ return VFX_TEX[name]; }

const activeFx = [];

function makeSprite(texName, size, color=0xffffff, opacity=1) {
  const mat = new THREE.SpriteMaterial({ map: vfxTex(texName), color, transparent:true, opacity, blending:THREE.AdditiveBlending, depthWrite:false });
  const spr = new THREE.Sprite(mat);
  spr.scale.setScalar(size);
  return spr;
}

// Rafaga de sprites que nacen en un punto y se separan/desvanecen
function spriteBurst(x,y,z, texNames, count, opts={}) {
  const speed = opts.speed ?? 2.2, size = opts.size ?? 0.9, life = opts.life ?? 550, color = opts.color ?? 0xffffff, rise = opts.rise ?? 1.2;
  const group = new THREE.Group();
  group.position.set(x,y,z);
  const parts = [];
  for (let i=0;i<count;i++) {
    const spr = makeSprite(rand(texNames), size*(0.7+Math.random()*0.6), color, 1);
    const a = Math.random()*Math.PI*2;
    const r = Math.random()*speed;
    spr.userData.vel = new THREE.Vector3(Math.cos(a)*r, rise*(0.4+Math.random()*0.8), Math.sin(a)*r);
    group.add(spr); parts.push(spr);
  }
  scene.add(group);
  activeFx.push({ kind:'burst', group, parts, born:performance.now(), life });
  return group;
}

// Un cristal de hielo real (geometria, no sprite) que crece desde el
// suelo — mucho mas legible que una particula suelta.
function growIceCrystal(x,z,delayMs=0,scaleMax=1) {
  const mat = new THREE.MeshStandardMaterial({ color:0xbfeeff, emissive:0x2a8fc8, emissiveIntensity:0.9, transparent:true, opacity:0.92, roughness:0.1, metalness:0.15 });
  const mesh = new THREE.Mesh(new THREE.ConeGeometry(0.22*scaleMax,1.1*scaleMax,6), mat);
  mesh.position.set(x,0,z);
  mesh.rotation.y = Math.random()*Math.PI;
  mesh.scale.set(1,0.01,1);
  scene.add(mesh);
  activeFx.push({ kind:'iceCrystal', mesh, born:performance.now()+delayMs, growMs:260, holdMs:1400, shrinkMs:260 });
}

function fxIceLance(fromEntry, dirYaw) {
  const startX = fromEntry.root.position.x, startZ = fromEntry.root.position.z;
  const dx = Math.sin(dirYaw), dz = Math.cos(dirYaw);
  // Cristales de hielo reales que van naciendo a lo largo de la trayectoria
  for (let i=0;i<6;i++) {
    growIceCrystal(startX+dx*i*1.1, startZ+dz*i*1.1, i*55, 0.75+Math.random()*0.3);
  }
  spriteBurst(startX, 0.4, startZ, ['spark_01','spark_02'], 6, { speed:3, size:0.5, life:400, color:0x9fe8ff, rise:0.4 });
}

function fxFrostNova(entry) {
  const cx = entry.root.position.x, cz = entry.root.position.z;
  const n = 10;
  for (let i=0;i<n;i++) {
    const a = (i/n)*Math.PI*2;
    growIceCrystal(cx+Math.cos(a)*2.4, cz+Math.sin(a)*2.4, i*30, 0.8);
  }
  spriteBurst(cx, 0.5, cz, ['spark_01','spark_02','star_01'], 10, { speed:3.6, size:0.6, life:500, color:0xbfeeff, rise:0.5 });
}

function fxFireImpact(x,z) {
  spriteBurst(x,1,z, ['fire_01','fire_02','flame_01','flame_02','flame_03'], 12, { speed:3.6, size:1.8, life:700, color:0xffaa55, rise:2.4 });
  spriteBurst(x,1,z, ['smoke_01','smoke_02','smoke_03'], 7, { speed:1.2, size:1.9, life:1500, color:0x998877, rise:1.6 });
  // marca de quemado en el piso, se desvanece
  const scorch = makeSprite('circle_01', 3.2, 0x1a1008);
  scorch.material.blending = THREE.NormalBlending;
  scorch.position.set(x,0.05,z);
  scene.add(scorch);
  activeFx.push({ kind:'fadeSprite', sprite:scorch, born:performance.now(), life:2600 });
  const light = new THREE.PointLight(0xff6a2e, 5, 13); light.position.set(x,1.2,z); scene.add(light);
  activeFx.push({ kind:'lightFade', light, born:performance.now(), life:450 });
  playSfxAt(light, 'magic_hit.ogg', 1);
}

// El veneno ahora se aplica y se ve SOBRE el objetivo real (no sobre
// quien lanza la habilidad) — se engancha a su root y lo sigue mientras
// dura el efecto, con una rafaga extra en cada tick de daño.
function fxPoisonOnTarget(entry, totalMs) {
  const group = new THREE.Group();
  for (let i=0;i<8;i++) {
    const geo = new THREE.SphereGeometry(0.1+Math.random()*0.07,6,6);
    const mat = new THREE.MeshStandardMaterial({ color:0x5fd34a, transparent:true, opacity:0.6, emissive:0x2a7a1a, emissiveIntensity:0.7 });
    const m = new THREE.Mesh(geo, mat);
    const a = Math.random()*Math.PI*2, r = Math.random()*0.7;
    m.position.set(Math.cos(a)*r, 0.4+Math.random()*1.1, Math.sin(a)*r);
    group.add(m);
  }
  scene.add(group);
  activeFx.push({ kind:'poisonFollow', group, entry, born:performance.now(), life:totalMs });
}

function fxWhirlwind(entry) {
  spriteBurst(entry.root.position.x, 1.1, entry.root.position.z, ['slash_01','slash_02','slash_03'], 6, { speed:2.8, size:1.5, life:450, color:0xd7d7e0, rise:0.1 });
  entry.spinStart = performance.now();
  entry.spinDuration = 420;
  entry.spinFrom = entry.root.rotation.y;
}

// Aura persistente (mientras dura el buff) para que se note claramente
// que el Guerrero esta bajo el efecto del Grito de Guerra.
function fxWarcryAura(entry, durationMs=5000) {
  const ring = makeSprite('circle_02', 2.6, 0xff5533);
  ring.position.copy(entry.root.position); ring.position.y = 0.15;
  ring.rotation = ring.rotation || {};
  scene.add(ring);
  spriteBurst(entry.root.position.x, 0.4, entry.root.position.z, ['spark_01','spark_03','star_01'], 10, { speed:3.4, size:0.6, life:500, color:0xff8855, rise:2.2 });
  activeFx.push({ kind:'auraFollow', sprite:ring, entry, born:performance.now(), life:durationMs, pulse:true, baseScale:2.6 });
}

// Cupula de escudo visible mientras dura el buff de reduccion de daño
// (Bloqueo de Escudo del Guerrero, Campo Sagrado del Clerigo).
function fxShieldDome(entry, durationMs=4000, color=0xffe27a) {
  const mat = new THREE.MeshStandardMaterial({ color, transparent:true, opacity:0.22, emissive:color, emissiveIntensity:0.5, side:THREE.DoubleSide, depthWrite:false });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1.15,16,12,0,Math.PI*2,0,Math.PI*0.55), mat);
  mesh.position.copy(entry.root.position);
  scene.add(mesh);
  playSfxAt(mesh, 'sfx_shield.ogg', 0.9);
  activeFx.push({ kind:'shieldDome', mesh, entry, born:performance.now(), life:durationMs });
}

function fxDashTrail(entry) {
  for (let i=0;i<4;i++) {
    const clone = entry.root.clone();
    clone.traverse(o=>{ if (o.isMesh) { o.material = o.material.clone(); o.material.transparent=true; o.material.opacity=0.35 - i*0.07; o.material.color.set(0x88bbff); } });
    scene.add(clone);
    activeFx.push({ kind:'ghost', mesh:clone, born:performance.now()+i*40, life:260 });
  }
  spriteBurst(entry.root.position.x, 0.2, entry.root.position.z, ['smoke_01','smoke_02'], 5, { speed:1.2, size:1.1, life:450, color:0xcfcfcf, rise:0.3 });
  spriteBurst(entry.root.position.x, 0.6, entry.root.position.z, ['spark_01','spark_02','star_01'], 6, { speed:1.6, size:0.7, life:400, color:0xbfe0ff, rise:0.3 });
}

function fxBladeFlurry(entry) {
  for (let i=0;i<3;i++) {
    setTimeout(()=>{
      const s = makeSprite('slash_0'+(1+i%4), 1.7, 0xdfe6ff);
      s.position.copy(entry.root.position); s.position.y = 0.9 + Math.random()*0.4;
      s.material.rotation = Math.random()*Math.PI;
      scene.add(s);
      activeFx.push({ kind:'fadeSprite', sprite:s, born:performance.now(), life:280 });
      playSfxAt(entry.root, rand(['knifeSlice.ogg','knifeSlice2.ogg']), 0.8);
    }, i*140);
  }
}

// Golpe Sagrado: haz de luz que desciende sobre el objetivo, mas claro
// que una simple rafaga de particulas.
function fxHolySmite(entry) {
  const x = entry.root.position.x, z = entry.root.position.z;
  const beamMat = new THREE.MeshBasicMaterial({ color:0xffe8a0, transparent:true, opacity:0.55, blending:THREE.AdditiveBlending, depthWrite:false, side:THREE.DoubleSide });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.5,0.05,7,10,1,true), beamMat);
  beam.position.set(x,3.5,z);
  scene.add(beam);
  activeFx.push({ kind:'beamFade', mesh:beam, born:performance.now(), life:500 });
  spriteBurst(x,0.3,z, ['circle_01','circle_03','magic_04'], 8, { speed:1.2, size:2.0, life:650, color:0xffe8a0, rise:2.2 });
  playSfxAt(entry.root, 'sfx_holy.ogg', 1);
}
function fxHeal(entry) {
  spriteBurst(entry.root.position.x, 0.4, entry.root.position.z, ['magic_01','magic_03','star_01'], 9, { speed:0.9, size:1.2, life:1000, color:0x8fffb0, rise:2.6 });
  playSfxAt(entry.root, 'sfx_heal.ogg', 1);
  if (entry === localEntry) showFloatingText('+HP', '#8fffb0');
}
function fxArrowShot(entry) {
  spriteBurst(entry.root.position.x, 1.3, entry.root.position.z, ['spark_03','spark_04'], 4, { speed:1.4, size:0.55, life:280, color:0xcfffcf, rise:0.2 });
}
function fxTrapTelegraph(x,z,radius,delayMs) {
  const ring = makeSprite('circle_03', radius*2.1, 0xff5533);
  ring.position.set(x,0.15,z);
  scene.add(ring);
  activeFx.push({ kind:'telegraph', sprite:ring, born:performance.now(), life:delayMs||1400 });
  setTimeout(()=>{
    spriteBurst(x,0.4,z, ['spark_01','spark_02','scratch_01'], 9, { speed:3.2, size:0.9, life:400, color:0xff8855, rise:0.6 });
    const light = new THREE.PointLight(0xff5533,3,9); light.position.set(x,1,z); scene.add(light);
    activeFx.push({ kind:'lightFade', light, born:performance.now(), life:350 });
  }, delayMs||1400);
}

// Destello generico de impacto: se dispara en CUALQUIER golpe recibido
// (jugador o monstruo) para que el combate en general se lea mejor.
function fxDamageFlash(x,y,z) {
  spriteBurst(x,y,z, ['spark_01','spark_02','star_01'], 5, { speed:1.8, size:0.45, life:300, color:0xffffff, rise:0.5 });
}

function updateFx(dt) {
  const now = performance.now();
  for (let i=activeFx.length-1;i>=0;i--) {
    const fx = activeFx[i];
    const age = now - fx.born;
    if (fx.kind === 'burst') {
      fx.parts.forEach(spr => { spr.position.addScaledVector(spr.userData.vel, dt); spr.userData.vel.y -= dt*1.4; });
      const t = age/fx.life;
      fx.group.children.forEach(spr => spr.material.opacity = Math.max(0, 1-t));
      if (age > fx.life) { scene.remove(fx.group); activeFx.splice(i,1); }
    } else if (fx.kind === 'iceCrystal') {
      if (now < fx.born) continue;
      const total = fx.growMs+fx.holdMs+fx.shrinkMs;
      let s;
      if (age < fx.growMs) s = age/fx.growMs;
      else if (age < fx.growMs+fx.holdMs) s = 1;
      else s = Math.max(0, 1 - (age-fx.growMs-fx.holdMs)/fx.shrinkMs);
      fx.mesh.scale.set(Math.max(0.02,s*0.9+0.1), Math.max(0.02,s), Math.max(0.02,s*0.9+0.1));
      if (age > total) { scene.remove(fx.mesh); activeFx.splice(i,1); }
    } else if (fx.kind === 'lightFade') {
      const t = age/fx.life;
      fx.light.intensity = Math.max(0, 5*(1-t));
      if (age > fx.life) { scene.remove(fx.light); activeFx.splice(i,1); }
    } else if (fx.kind === 'ghost') {
      if (now < fx.born) continue;
      const localAge = now-fx.born;
      fx.mesh.traverse(o=>{ if (o.isMesh) o.material.opacity = Math.max(0, o.material.opacity - dt*1.2); });
      if (localAge>fx.life) { scene.remove(fx.mesh); activeFx.splice(i,1); }
    } else if (fx.kind === 'fadeSprite') {
      const t = age/fx.life;
      fx.sprite.material.opacity = Math.max(0,(fx.sprite.material.opacity ?? 1)*(1-dt*2));
      if (age>fx.life) { scene.remove(fx.sprite); activeFx.splice(i,1); }
    } else if (fx.kind === 'telegraph') {
      fx.sprite.material.opacity = 0.55 + Math.sin(age*0.02)*0.2;
      if (age>fx.life) { scene.remove(fx.sprite); activeFx.splice(i,1); }
    } else if (fx.kind === 'auraFollow') {
      fx.sprite.position.set(fx.entry.root.position.x, 0.15, fx.entry.root.position.z);
      fx.sprite.material.rotation += dt*1.2;
      const t = age/fx.life;
      fx.sprite.scale.setScalar(fx.baseScale * (1+Math.sin(age*0.008)*0.06));
      fx.sprite.material.opacity = t>0.85 ? Math.max(0,(1-t)/0.15) : 0.8;
      if (age>fx.life) { scene.remove(fx.sprite); activeFx.splice(i,1); }
    } else if (fx.kind === 'shieldDome') {
      fx.mesh.position.set(fx.entry.root.position.x, fx.entry.root.position.y, fx.entry.root.position.z);
      fx.mesh.rotation.y += dt*0.4;
      const t = age/fx.life;
      fx.mesh.material.opacity = t>0.85 ? Math.max(0,0.22*(1-t)/0.15) : 0.22;
      if (age>fx.life) { scene.remove(fx.mesh); activeFx.splice(i,1); }
    } else if (fx.kind === 'poisonFollow') {
      fx.group.position.set(fx.entry.root.position.x, 0, fx.entry.root.position.z);
      fx.group.rotation.y += dt*0.8;
      const t = age/fx.life;
      fx.group.children.forEach(m=>{ m.material.opacity = Math.max(0,0.6*(1-t)); });
      if (age>fx.life) { scene.remove(fx.group); activeFx.splice(i,1); }
    } else if (fx.kind === 'beamFade') {
      const t = age/fx.life;
      fx.mesh.material.opacity = Math.max(0,0.55*(1-t));
      if (age>fx.life) { scene.remove(fx.mesh); activeFx.splice(i,1); }
    }
  }
}

function showFloatingText(text, color) {
  const el = document.createElement('div');
  el.className = 'floatText';
  el.textContent = text;
  el.style.color = color;
  document.getElementById('hud').appendChild(el);
  requestAnimationFrame(()=> el.classList.add('rise'));
  setTimeout(()=>el.remove(), 1200);
}

// ===================================================================
// PROYECTILES (visual, la posicion real la marca el servidor)
// ===================================================================
const visualProjectiles = new Map();
function spawnVisualProjectile(id, kind, x, z) {
  let texName = 'magic_03', color = 0x6fd6ff, lightColor = 0x6fd6ff;
  if (kind === 'fire') { texName='fire_01'; color=0xff8a3d; lightColor=0xff6a2e; }
  else if (kind === 'ice') { texName='spark_02'; color=0x9fe8ff; lightColor=0x6fd6ff; }
  else if (kind === 'arrow') { texName='spark_04'; color=0xd9c98a; lightColor=0xffe8a0; }
  else if (kind === 'holy') { texName='magic_02'; color=0xffe27a; lightColor=0xffd85a; }
  const spr = makeSprite(texName, kind==='arrow'?0.5:0.9, color);
  const l = new THREE.PointLight(lightColor,1.3,6); spr.add(l);
  spr.position.set(x,1.3,z);
  scene.add(spr);
  visualProjectiles.set(id, { mesh:spr, kind });
}
function updateVisualProjectile(id,x,z) {
  const p = visualProjectiles.get(id);
  if (p) p.mesh.position.set(x,1.3,z);
}
function endVisualProjectile(id,x,z,kind) {
  const p = visualProjectiles.get(id);
  if (p) { scene.remove(p.mesh); visualProjectiles.delete(id); }
  if (kind==='fire') fxFireImpact(x,z);
  else spriteBurst(x,1.2,z, ['spark_01','spark_02','star_01'], 5, { speed:1.6, size:0.6, life:350, color:0xcfe8ff, rise:0.3 });
}

function applySpin(entry) {
  if (!entry.spinStart) return false;
  const t = Math.min(1, (performance.now()-entry.spinStart)/entry.spinDuration);
  entry.root.rotation.y = entry.spinFrom + t*Math.PI*2;
  if (t>=1) entry.spinStart = null;
  return t<1;
}

// ===================================================================
// LOBBY UI
// ===================================================================
document.getElementById('createRoomBtn').addEventListener('click', () => {
  socket = io();
  socket.on('connect', () => socket.emit('createRoom'));
  attachRoomSocketHandlers();
  socket.on('roomJoined', ({code}) => {
    myRoomCode = code;
    document.getElementById('lobbyScreen').classList.add('hidden');
    document.getElementById('roomCodeDisplay').textContent = code;
    document.getElementById('roomCreatedScreen').classList.remove('hidden');
  });
});
document.getElementById('continueToClassBtn').addEventListener('click', () => {
  document.getElementById('roomCreatedScreen').classList.add('hidden');
  document.getElementById('classScreen').classList.remove('hidden');
});
document.getElementById('joinRoomBtn').addEventListener('click', () => {
  const code = document.getElementById('roomCodeInput').value.trim().toUpperCase();
  if (!code) return;
  socket = io();
  socket.on('connect', () => socket.emit('joinRoom', code));
  attachRoomSocketHandlers();
  socket.on('roomJoined', ({code}) => {
    myRoomCode = code;
    document.getElementById('lobbyScreen').classList.add('hidden');
    document.getElementById('classScreen').classList.remove('hidden');
  });
});
function attachRoomSocketHandlers() {
  socket.on('roomError', (msg) => { document.getElementById('lobbyMsg').textContent = msg; });
}

let selectedClass = null;
document.querySelectorAll('.classCard').forEach(card => {
  card.addEventListener('click', () => {
    document.querySelectorAll('.classCard').forEach(c=>c.classList.remove('selected'));
    card.classList.add('selected');
    selectedClass = card.dataset.class;
    document.getElementById('joinBtn').disabled = !document.getElementById('nameInput').value.trim() || !selectedClass;
  });
});
document.getElementById('nameInput').addEventListener('input', () => {
  document.getElementById('joinBtn').disabled = !document.getElementById('nameInput').value.trim() || !selectedClass;
});
document.getElementById('joinBtn').addEventListener('click', () => {
  const name = document.getElementById('nameInput').value.trim().slice(0,16);
  myClass = selectedClass;
  socket.emit('join', { name, cls: selectedClass });
  setupGameplaySocketHandlers();
});
const invertCb = document.getElementById('invertLookCheckbox');
invertCb.checked = invertLook;
invertCb.addEventListener('change', () => {
  invertLook = invertCb.checked;
  localStorage.setItem('invertLook', invertLook ? '1' : '0');
});

// ===================================================================
// RED — eventos de partida
// ===================================================================
function setupGameplaySocketHandlers() {
  socket.on('init', (data) => {
    myId = data.id; classesDef = data.classes; abilitiesDef = data.abilities;
    arenaRadius = data.arenaRadius; matchState = data.matchState; matchEndsAt = data.matchEndsAt; killLimit = data.killLimit;

    document.getElementById('classScreen').classList.add('hidden');
    document.getElementById('hud').classList.remove('hidden');
    document.getElementById('classLabel').textContent = (classesDef[myClass]?.name||myClass).toUpperCase();
    document.getElementById('roomBadge').textContent = 'Sala ' + data.roomCode;
    setupAbilityBarUI();

    data.players.forEach(p => { if (p.id!==myId) addRemotePlayer(p); });
    const me = data.players.find(p=>p.id===myId);
    initLocalPlayer(me);
    (data.monsters||[]).forEach(m => addMonster(m));
    renderScoreboardList(data.players.map(p=>({id:p.id,name:p.name,class:p.class,kills:p.kills,deaths:p.deaths})));
    updateMatchStatusText();
    setupPointerLock();
  });

  socket.on('playerJoined', p => addRemotePlayer(p));
  socket.on('playerLeft', ({id}) => { const e=remotePlayers.get(id); if (e){ scene.remove(e.root); remotePlayers.delete(id); } });

  socket.on('playerMoved', ({id,x,y,z,ry,moving}) => {
    const e = remotePlayers.get(id); if (!e) return;
    e.targetPos = new THREE.Vector3(x,y||0,z);
    if (!e.spinStart) e.root.rotation.y = ry;
    e.moving = moving;
  });

  socket.on('forcedMove', ({id,x,z}) => {
    if (id===myId) { localMesh.position.x=x; localMesh.position.z=z; }
    else { const e=remotePlayers.get(id); if (e){ e.root.position.x=x; e.root.position.z=z; e.targetPos=new THREE.Vector3(x,e.root.position.y,z);} }
  });

  socket.on('attackAnim', ({id,ranged}) => {
    const entry = (id===myId) ? localEntry : remotePlayers.get(id);
    if (!entry) return;
    const asset = CLASS_ASSET[entry.cls];
    const clip = rand(entry.actions.attacks.length?entry.actions.attacks:[null]);
    if (clip) playOneShot(entry, clip, 0.5);
    playSfxAt(entry.root, rand(asset.swingSfx), 0.9);
  });

  socket.on('abilityUsed', ({id,slot,name,type,element,x,z,ry,duration}) => {
    const entry = (id===myId) ? localEntry : remotePlayers.get(id);
    if (!entry) return;
    const asset = CLASS_ASSET[entry.cls];
    if (entry.cls==='mage') {
      if (slot===1) { playOneShot(entry, entry.actions.spell1||entry.actions.attacks[0], 0.6); fxIceLance(entry, ry); playSfxAt(entry.root,'sfx_magic2.ogg',0.9); }
      else if (slot===2) { playOneShot(entry, entry.actions.spell2||entry.actions.attacks[0], 0.6); playSfxAt(entry.root,'magic_cast.ogg',0.9); }
      else if (slot===3) { playOneShot(entry, entry.actions.roll, 0.4); fxDashTrail(entry); playSfxAt(entry.root,'sfx_blink.ogg',0.9); }
      else { playOneShot(entry, entry.actions.spell1||entry.actions.attacks[0], 0.6); fxFrostNova(entry); playSfxAt(entry.root,'sfx_magic2.ogg',0.9); }
    } else if (entry.cls==='warrior') {
      if (slot===1) { playOneShot(entry, entry.actions.attacks[1]||entry.actions.attacks[0], 0.5); fxWhirlwind(entry); playSfxAt(entry.root, rand(asset.swingSfx),1); }
      else if (slot===2) { playOneShot(entry, entry.actions.idle, 0.3); fxWarcryAura(entry, duration||5000); playSfxAt(entry.root,'sfx_buffcast.ogg',1); }
      else if (slot===3) { playOneShot(entry, entry.actions.idle, 0.4); fxShieldDome(entry, duration||4000, 0xd7d7ff); }
      else { playOneShot(entry, entry.actions.roll, 0.4); fxDashTrail(entry); }
    } else if (entry.cls==='rogue') {
      if (slot===1) { playOneShot(entry, entry.actions.attacks[0], 0.5); fxBladeFlurry(entry); playSfxAt(entry.root, rand(asset.swingSfx),1); }
      else if (slot===2) { playOneShot(entry, entry.actions.roll, 0.35); fxDashTrail(entry); playSfxAt(entry.root,'sfx_blink.ogg',0.9); }
      else if (slot===3) { playOneShot(entry, entry.actions.attacks[0], 0.4); playSfxAt(entry.root,'knifeSlice.ogg',0.9); }
      else { playOneShot(entry, entry.actions.attacks[1]||entry.actions.attacks[0], 0.45); fxBladeFlurry(entry); playSfxAt(entry.root, rand(asset.swingSfx),1); }
    } else if (entry.cls==='ranger') {
      if (slot===1) { playOneShot(entry, entry.actions.attacks[1]||entry.actions.attacks[0], 0.5); fxArrowShot(entry); playSfxAt(entry.root,'magic_cast.ogg',0.8); }
      else if (slot===2) { playOneShot(entry, entry.actions.attacks[0], 0.4); }
      else if (slot===3) { playOneShot(entry, entry.actions.roll, 0.35); fxDashTrail(entry); playSfxAt(entry.root,'sfx_blink.ogg',0.9); }
      else { playOneShot(entry, entry.actions.attacks[1]||entry.actions.attacks[0], 0.55); fxArrowShot(entry); playSfxAt(entry.root,'sfx_magic3.ogg',0.9); }
    } else if (entry.cls==='cleric') {
      if (slot===1) { playOneShot(entry, entry.actions.attacks[0], 0.5); fxHolySmite(entry); }
      else if (slot===2) { playOneShot(entry, entry.actions.spell1||entry.actions.idle, 0.6); fxHeal(entry); }
      else if (slot===3) { playOneShot(entry, entry.actions.spell2||entry.actions.idle, 0.5); fxShieldDome(entry, duration||5000, 0xffe27a); }
      else { playOneShot(entry, entry.actions.spell1||entry.actions.idle, 0.5); playSfxAt(entry.root,'sfx_holy.ogg',0.9); }
    }
  });

  socket.on('dotApplied', ({casterId,targetId,ticks,tickIntervalMs}) => {
    const entry = (targetId===myId) ? localEntry : remotePlayers.get(targetId);
    if (!entry) return;
    fxPoisonOnTarget(entry, ticks*tickIntervalMs + 300);
  });

  socket.on('telegraphAoe', ({x,z,radius,delayMs}) => fxTrapTelegraph(x,z,radius,delayMs));

  socket.on('projectileTick', ({id,x,z}) => {
    if (!visualProjectiles.has(id)) return;
    updateVisualProjectile(id,x,z);
  });
  socket.on('projectileEnd', ({id,x,z,kind}) => endVisualProjectile(id,x,z,kind));

  socket.on('damaged', ({id,hp,byId}) => {
    if (id===myId) { updateHealthUI(hp); flashDamage(); }
    const entry = (id===myId) ? localEntry : remotePlayers.get(id);
    if (entry && entry.actions.hit) playOneShot(entry, entry.actions.hit, 0.4);
    const targetRoot = (id===myId) ? localMesh : (entry && entry.root);
    if (targetRoot) {
      playSfxAt(targetRoot, rand(HIT_SFX), 0.9);
      fxDamageFlash(targetRoot.position.x, targetRoot.position.y+1.2, targetRoot.position.z);
    }
  });

  socket.on('kill', ({killerId,killerName,victimId,victimName}) => {
    addKillFeed(`${killerName} eliminó a ${victimName}`);
    const entry = (victimId===myId) ? localEntry : remotePlayers.get(victimId);
    if (entry && entry.actions.death) playOneShot(entry, entry.actions.death, 1.4);
    if (victimId===myId) showDeathScreen();
  });

  socket.on('respawn', ({id,x,z,hp}) => {
    if (id===myId) {
      localMesh.position.set(x,0,z); velocityY=0; grounded=true;
      updateHealthUI(hp); localMesh.visible=true; hideDeathScreen();
    } else {
      const e = remotePlayers.get(id);
      if (e) { e.root.position.set(x,0,z); e.root.visible=true; }
    }
  });

  socket.on('monsterMoved', ({id,x,z,ry}) => {
    const m = monsters.get(id);
    if (!m) return;
    m.targetPos = new THREE.Vector3(x, m.flying?2.4:0, z);
    m.root.rotation.y = ry;
    const d = m.targetPos.distanceTo(m.root.position);
    m.moving = d > 0.05;
  });

  socket.on('monsterAttackAnim', ({id}) => {
    const m = monsters.get(id);
    if (!m || !m.actions.attacks.length) return;
    playOneShot(m, rand(m.actions.attacks), 0.6);
    playSfxAt(m.root, rand(HIT_SFX), 0.7);
  });

  socket.on('monsterDamaged', ({id,hp}) => {
    const m = monsters.get(id);
    if (!m) return;
    m.hp = hp;
    const hb = monsterHealthBars.get(id);
    if (hb) drawHealthBar(hb, hp/m.maxHp);
    if (m.actions.hit) playOneShot(m, m.actions.hit, 0.35);
    playSfxAt(m.root, rand(HIT_SFX), 0.8);
    spriteBurst(m.root.position.x, m.headOffset*0.6, m.root.position.z, ['spark_01','spark_02'], 4, { speed:1.2, size:0.4, life:250, color:0xffffff, rise:0.2 });
  });

  socket.on('monsterDied', ({id,killerName}) => {
    const m = monsters.get(id);
    if (!m) return;
    addKillFeed(`${killerName} venció a ${m.type==='dragon'?'un Dragón':m.type==='skeleton'?'un Esqueleto':'un Slime'}`);
    if (m.actions.death) playOneShot(m, m.actions.death, 1.2);
    const hb = monsterHealthBars.get(id); if (hb) hb.visible = false;
    setTimeout(()=>{ m.root.visible=false; }, 900);
  });

  socket.on('monsterRespawn', ({id,x,z,hp}) => {
    const m = monsters.get(id);
    if (!m) return;
    m.root.position.set(x, m.flying?2.4:0, z);
    m.targetPos = m.root.position.clone();
    m.hp = hp;
    m.root.visible = true;
    m.state = 'idle';
    const hb = monsterHealthBars.get(id); if (hb) { hb.visible = true; drawHealthBar(hb, 1); }
  });

  socket.on('xpUpdate', ({id,xp,level,xpNeeded,leveled,hp,maxHp}) => {
    if (id !== myId) return;
    updateXpUI(level, xp, xpNeeded);
    if (hp!==undefined) { document.getElementById('healthWrap').dataset.max = maxHp; updateHealthUI(hp); }
    if (leveled) { showLevelUpFlash(level); if (localMesh) playSfxAt(localMesh, 'sfx_levelup.ogg', 1); }
  });

  socket.on('scoreboard', board => renderScoreboardList(board));

  socket.on('matchStart', ({endsAt, killLimit:kl}) => {
    matchState='active'; matchEndsAt=endsAt; killLimit=kl;
    updateMatchStatusText();
    playMusic(Math.random()<0.5?'musicBattle1':'musicBattle2');
  });
  socket.on('matchPaused', () => { matchState='waiting'; updateMatchStatusText(); });
  socket.on('matchOver', ({reason,winner,scoreboard:board}) => {
    matchState='finished'; inputLocked=true;
    document.getElementById('victoryTitle').textContent = reason==='kills' ? '¡Victoria por eliminaciones!' : '¡Se acabó el tiempo!';
    document.getElementById('victoryWinner').textContent = winner ? `Ganador: ${winner.name} (${classesDef[winner.class]?.name||winner.class}) — ${winner.kills} bajas` : 'Sin ganador';
    const ol = document.getElementById('victoryBoard'); ol.innerHTML='';
    board.forEach(p => { const li=document.createElement('li'); li.textContent=`${p.name} — ${p.kills} bajas / ${p.deaths} muertes`; ol.appendChild(li); });
    document.getElementById('victoryScreen').classList.remove('hidden');
    playMusic('musicMenu');
  });
  socket.on('matchReset', ({players}) => {
    inputLocked=false; matchState='waiting';
    document.getElementById('victoryScreen').classList.add('hidden');
    players.forEach(p => {
      if (p.id===myId) { localMesh.position.set(p.x,0,p.z); updateHealthUI(p.hp); localMesh.visible=true; }
      else { const e=remotePlayers.get(p.id); if (e){ e.root.position.set(p.x,0,p.z); e.root.visible=true; e.data=p; } }
    });
    updateMatchStatusText();
  });
}

// ===================================================================
// JUGADOR LOCAL / REMOTO
// ===================================================================
let localEntry = null;
function initLocalPlayer(meData) {
  const built = spawnCharacter(myClass);
  localEntry = built;
  localMesh = built.root; localMixer = built.mixer; localActions = built.actions;
  localMesh.position.set(meData.x,0,meData.z);
  scene.add(localMesh);
  yaw = meData.ry||0;
  updateHealthUI(meData.hp);
  document.getElementById('healthWrap').dataset.max = meData.hp;
  updateXpUI(meData.level||1, meData.xp||0, meData.xpNeeded||90);
}
function addRemotePlayer(p) {
  if (p.id===myId || remotePlayers.has(p.id)) return;
  const built = spawnCharacter(p.class);
  built.root.position.set(p.x, p.y||0, p.z);
  built.root.rotation.y = p.ry;
  built.data = p; built.targetPos = new THREE.Vector3(p.x,p.y||0,p.z); built.moving=false;
  scene.add(built.root);
  remotePlayers.set(p.id, built);
}

function addMonster(m) {
  const built = spawnMonster(m.type);
  built.root.position.set(m.x, built.flying?2.4:0, m.z);
  built.root.rotation.y = m.ry||0;
  built.targetPos = new THREE.Vector3(m.x, built.flying?2.4:0, m.z);
  built.moving = false;
  built.hp = m.hp; built.maxHp = m.maxHp; built.alive = m.alive;
  built.id = m.id;
  built.headOffset = (MONSTER_ASSET[m.type].targetHeight||1.5) + 0.35;
  scene.add(built.root);
  monsters.set(m.id, built);
  const hb = makeHealthBarSprite();
  scene.add(hb);
  monsterHealthBars.set(m.id, hb);
}

// ===================================================================
// INPUT
// ===================================================================
window.addEventListener('keydown', e => {
  const k = e.key.toLowerCase();
  if (keys.hasOwnProperty(k)) keys[k]=true;
  if (k===' ') { e.preventDefault(); tryJump(); }
  if (k==='1') useAbility(1);
  if (k==='2') useAbility(2);
  if (k==='3') useAbility(3);
  if (k==='4') useAbility(4);
});
window.addEventListener('keyup', e => { const k=e.key.toLowerCase(); if (keys.hasOwnProperty(k)) keys[k]=false; });

function tryJump() {
  if (!localMesh || inputLocked || !localAlive) return;
  if (grounded) {
    velocityY = classesDef?.[myClass]?.jumpForce || 8;
    grounded = false;
  }
}

let usingDrag = false, dragLast = {x:0,y:0};
function setupPointerLock() {
  canvas.addEventListener('click', () => {
    if (document.pointerLockElement !== canvas) {
      canvas.requestPointerLock();
    } else {
      attack();
    }
  });
  document.addEventListener('pointerlockchange', () => {
    const hint = document.getElementById('lockHint');
    if (document.pointerLockElement === canvas) hint.classList.add('hidden');
    else hint.classList.remove('hidden');
  });
  document.addEventListener('mousemove', e => {
    if (document.pointerLockElement === canvas) {
      const inv = invertLook ? -1 : 1;
      yaw -= e.movementX * 0.0022 * inv;
      pitch += e.movementY * 0.0018;
      pitch = Math.max(-0.6, Math.min(0.75, pitch));
    }
  });
  canvas.addEventListener('mousedown', e => { if (e.button===2){ usingDrag=true; dragLast={x:e.clientX,y:e.clientY}; } });
  window.addEventListener('mouseup', () => usingDrag=false);
  window.addEventListener('mousemove', e => {
    if (usingDrag) {
      const inv = invertLook ? -1 : 1;
      const dx = e.clientX-dragLast.x, dy = e.clientY-dragLast.y;
      dragLast = {x:e.clientX,y:e.clientY};
      yaw -= dx*0.0025*inv; pitch += dy*0.002; pitch=Math.max(-0.6,Math.min(0.75,pitch));
    }
  });
  canvas.addEventListener('contextmenu', e => e.preventDefault());
}

function attack() {
  if (!socket || matchState!=='active' || !localAlive || inputLocked) return;
  const now = performance.now();
  const cd = (classesDef?.[myClass]?.attackCooldown) || 800;
  if (now-lastAttackClientTime < cd) return;
  lastAttackClientTime = now;
  socket.emit('attack');
}

function useAbility(slot) {
  if (!socket || matchState!=='active' || !localAlive || inputLocked) return;
  const now = performance.now();
  if (now < abilityCooldownUntil[slot]) return;
  const ab = abilitiesDef?.[myClass]?.[slot];
  if (!ab) return;
  abilityCooldownUntil[slot] = now + ab.cooldown;
  socket.emit('ability', { slot });
  startAbilityCooldownUI(slot, ab.cooldown);
}

// ===================================================================
// HUD helpers
// ===================================================================
function setupAbilityBarUI() {
  [1,2,3,4].forEach(slot => {
    const ab = abilitiesDef[myClass][slot];
    const el = document.querySelector(`.abilitySlot[data-slot="${slot}"] .abilityName`);
    el.textContent = ab.name;
  });
}
function startAbilityCooldownUI(slot, cdMs) {
  const slotEl = document.querySelector(`.abilitySlot[data-slot="${slot}"]`);
  const fill = slotEl.querySelector('.abilityCd');
  slotEl.classList.remove('ready');
  const start = performance.now();
  function step() {
    const t = Math.min((performance.now()-start)/cdMs,1);
    fill.style.height = ((1-t)*100)+'%';
    if (t<1) requestAnimationFrame(step); else slotEl.classList.add('ready');
  }
  step();
}
function updateHealthUI(hp) {
  const max = classesDef?.[myClass]?.hp || parseInt(document.getElementById('healthWrap').dataset.max||100);
  const pct = Math.max(0,Math.min(100,(hp/max)*100));
  document.getElementById('healthBarFill').style.width = pct+'%';
  document.getElementById('healthBarFill').style.background = pct<30 ? 'var(--hp-low)' : '';
  document.getElementById('healthText').textContent = `${Math.max(0,Math.round(hp))}/${max}`;
  localAlive = hp>0;
}
function updateXpUI(level, xp, xpNeeded) {
  document.getElementById('levelLabel').textContent = 'Nv. ' + level;
  const pct = Math.max(0, Math.min(100, (xp/xpNeeded)*100));
  document.getElementById('xpBarFill').style.width = pct + '%';
  document.getElementById('xpText').textContent = `${xp}/${xpNeeded} XP`;
}
function showLevelUpFlash(level) {
  const el = document.getElementById('levelUpFlash');
  el.textContent = `¡Subiste a nivel ${level}!`;
  el.classList.remove('hidden');
  el.classList.add('show');
  setTimeout(()=>{ el.classList.remove('show'); setTimeout(()=>el.classList.add('hidden'),400); }, 1800);
}
function flashDamage() {
  document.body.style.transition='none';
  document.body.style.boxShadow='inset 0 0 140px 40px rgba(200,20,20,.55)';
  requestAnimationFrame(()=>{ document.body.style.transition='box-shadow .4s'; document.body.style.boxShadow='inset 0 0 0 0 rgba(200,20,20,0)'; });
}
function addKillFeed(text) {
  const el=document.createElement('div'); el.className='killMsg'; el.textContent=text;
  const feed=document.getElementById('killFeed'); feed.appendChild(el);
  setTimeout(()=>el.remove(),5000);
}
function showDeathScreen() {
  document.getElementById('deathScreen').classList.remove('hidden');
  let s=3; const el=document.getElementById('deathRespawn'); el.textContent=`Reapareces en ${s}…`;
  const iv=setInterval(()=>{ s--; el.textContent=`Reapareces en ${Math.max(s,0)}…`; if (s<=0) clearInterval(iv); },1000);
}
function hideDeathScreen(){ document.getElementById('deathScreen').classList.add('hidden'); }
function renderScoreboardList(board) {
  const ol=document.getElementById('scoreList'); ol.innerHTML='';
  board.slice(0,5).forEach(p => { const li=document.createElement('li'); li.textContent=`${p.name} — ${p.kills}/${p.deaths}`; if (p.id===myId) li.style.color='var(--gold)'; ol.appendChild(li); });
}
function updateMatchStatusText() {
  const el=document.getElementById('matchStatus');
  if (matchState==='waiting') el.textContent='Esperando jugadores (mín. 2)…';
  else if (matchState==='active') el.textContent=`¡Combate! Primero a ${killLimit} bajas gana`;
  else el.textContent='Partida finalizada';
}
setInterval(() => {
  const el=document.getElementById('matchTimer');
  if (matchState!=='active') { el.textContent='--:--'; return; }
  const remain=Math.max(0,matchEndsAt-Date.now());
  const m=Math.floor(remain/60000), s=Math.floor((remain%60000)/1000);
  el.textContent = `${m}:${s.toString().padStart(2,'0')}`;
}, 500);

// ===================================================================
// LOOP PRINCIPAL
// ===================================================================
function updateLocalMovement(dt) {
  if (!localMesh) return;
  const speedBase = (classesDef?.[myClass]?.speed) || 6;
  let moveX=0, moveZ=0;
  if (keys.w) moveZ+=1; if (keys.s) moveZ-=1; if (keys.a) moveX+=1; if (keys.d) moveX-=1;
  const active = !inputLocked && localAlive && matchState==='active';
  const moving = active && (moveX!==0 || moveZ!==0);

  if (moving) {
    const len = Math.hypot(moveX,moveZ)||1; moveX/=len; moveZ/=len;
    const sinY=Math.sin(yaw), cosY=Math.cos(yaw);
    const invert = invertLook ? -1 : 1;
    const worldX = (moveX*cosY + moveZ*sinY) * invert;
    const worldZ = (-moveX*sinY + moveZ*cosY) * invert;
    const pos = localMesh.position;
    pos.x += worldX*speedBase*dt;
    pos.z += worldZ*speedBase*dt;
  }
  resolveHorizontalCollision(localMesh.position);
  if (!applySpin(localEntry)) localMesh.rotation.y = yaw;

  const groundH = getGroundHeight(localMesh.position.x, localMesh.position.y, localMesh.position.z);
  velocityY -= GRAVITY*dt;
  localMesh.position.y += velocityY*dt;
  if (localMesh.position.y <= groundH) {
    localMesh.position.y = groundH; velocityY = 0; grounded = true;
  } else {
    grounded = false;
  }

  updateLocomotion(localEntry, moving, true, dt);

  if (moving && grounded) {
    localEntry._footTimer -= dt;
    if (localEntry._footTimer <= 0) { playSfxAt(localMesh, rand(FOOTSTEP_SFX), 0.32); localEntry._footTimer = 0.35; }
  }

  const camDist = 5.2;
  const camHeight = 2.6 + pitch*3.4;
  const camX = localMesh.position.x - Math.sin(yaw)*camDist;
  const camZ = localMesh.position.z - Math.cos(yaw)*camDist;
  const desired = new THREE.Vector3(camX, localMesh.position.y + camHeight, camZ);
  camera.position.lerp(desired, 1-Math.pow(0.0001,dt));
  camera.lookAt(localMesh.position.x, localMesh.position.y+1.4, localMesh.position.z);

  const now = performance.now();
  if (now-lastMoveSent > 45) {
    lastMoveSent = now;
    socket && socket.emit('move', { x:localMesh.position.x, y:localMesh.position.y, z:localMesh.position.z, ry:yaw, moving });
  }
}

function updateRemotePlayers(dt) {
  remotePlayers.forEach(e => {
    if (e.targetPos) e.root.position.lerp(e.targetPos, 1-Math.pow(0.0001,dt));
    applySpin(e);
    updateLocomotion(e, e.moving, true, dt);
    if (e.moving) {
      e._footTimer -= dt;
      if (e._footTimer<=0) { playSfxAt(e.root, rand(FOOTSTEP_SFX), 0.22); e._footTimer=0.4; }
    }
  });
}

function updateMonsters(dt) {
  monsters.forEach((m,id) => {
    if (m.targetPos) m.root.position.lerp(m.targetPos, 1-Math.pow(0.0005,dt));
    updateMonsterAnim(m, m.moving, dt);
    const hb = monsterHealthBars.get(id);
    if (hb) {
      hb.position.set(m.root.position.x, m.root.position.y+m.headOffset, m.root.position.z);
      hb.visible = m.root.visible;
    }
  });
}

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  updateLocalMovement(dt);
  updateRemotePlayers(dt);
  updateMonsters(dt);
  updateFx(dt);
  renderer.render(scene, camera);
}

preload().then(animate);
