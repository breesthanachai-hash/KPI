"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

export type Office3DLevel = "available" | "steady" | "busy" | "overloaded";
export type Office3DBehavior = "rush" | "work" | "chill" | "walk" | "nap" | "chat";

export type Office3DPerson = {
  id: string;
  name: string;
  role: string;
  initials: string;
  level: Office3DLevel;
  behavior: Office3DBehavior;
  openCount: number;
  loadPercent: number;
  currentTask: string;
  scene: "sales" | "campaign" | "service" | "code" | "edit" | "people";
};

type CharacterRig = {
  id: string;
  behavior: Office3DBehavior;
  gag: OfficeGag;
  root: THREE.Group;
  model: THREE.Group;
  leftArm: THREE.Group;
  rightArm: THREE.Group;
  leftLeg: THREE.Group;
  rightLeg: THREE.Group;
  cape: THREE.Object3D | null;
  prop: THREE.Object3D | null;
  basePosition: THREE.Vector3;
  targetIndex: number;
  speed: number;
};

type OfficeRoom = "open" | "creative" | "meeting" | "manager" | "ceo" | "lounge" | "cafe";

type OfficeVisualMode = "cinematic" | "interactive";

type OfficeGag = "air-guitar" | "coffee-toast" | "robot-glitch" | "hero-pose" | "tiny-dance" | "cape-drama";

type HeroCostume = {
  name: string;
  primary: number;
  secondary: number;
  accent: number;
  cape: boolean;
  mask: boolean;
  headgear: "none" | "ears" | "antenna" | "crown";
};

type AudioEngine = {
  context: AudioContext;
  workGain: GainNode;
  musicGain: GainNode;
  sources: AudioScheduledSourceNode[];
  workTimer: number;
  musicTimer: number;
};

const originalHeroCostumes: HeroCostume[] = [
  { name: "ผู้พิทักษ์สุริยะ", primary: 0xc7465b, secondary: 0x142e5a, accent: 0xffcf5a, cape: true, mask: false, headgear: "crown" },
  { name: "อัศวินกะดึก", primary: 0x202541, secondary: 0x7751c9, accent: 0x62f6ff, cape: true, mask: true, headgear: "ears" },
  { name: "ช่างสายฟ้าควอนตัม", primary: 0x2776a7, secondary: 0xd7e8ee, accent: 0xb9ff45, cape: false, mask: false, headgear: "antenna" },
  { name: "แม่มดเนบิวลา", primary: 0x922f92, secondary: 0x30204f, accent: 0xff74d0, cape: true, mask: false, headgear: "crown" },
  { name: "ยักษ์เขียวฝ่ายบัญชี", primary: 0x3f9969, secondary: 0x452f6f, accent: 0xf3e665, cape: false, mask: false, headgear: "none" },
  { name: "นักวิ่งส่งเดดไลน์", primary: 0xf07837, secondary: 0x283d6f, accent: 0x72f7ff, cape: false, mask: true, headgear: "antenna" },
  { name: "ฮีโร่ฟองสบู่", primary: 0x4ebfc2, secondary: 0xec78a8, accent: 0xfff2a2, cape: true, mask: false, headgear: "ears" },
  { name: "กัปตันขนมปังปิ้ง", primary: 0xc8874b, secondary: 0x4d304a, accent: 0x7ff6d3, cape: true, mask: true, headgear: "none" },
];

const officeGags: OfficeGag[] = ["air-guitar", "coffee-toast", "robot-glitch", "hero-pose", "tiny-dance", "cape-drama"];

const cinematicWorkerSlots = [
  { left: 20, top: 40, room: "open" },
  { left: 34, top: 48, room: "open" },
  { left: 59, top: 25, room: "manager" },
  { left: 72, top: 16, room: "ceo" },
  { left: 66, top: 48, room: "creative" },
  { left: 49, top: 73, room: "cafe" },
  { left: 82, top: 72, room: "lounge" },
  { left: 18, top: 68, room: "meeting" },
] satisfies { left: number; top: number; room: OfficeRoom }[];

const gagLabels: Record<OfficeGag, string> = {
  "air-guitar": "โซโล่กีตาร์ล่องหน",
  "coffee-toast": "ชนแก้วกาแฟกับกล้อง",
  "robot-glitch": "แกล้งค้างเหมือนหุ่นยนต์",
  "hero-pose": "โพสท่ากู้เดดไลน์",
  "tiny-dance": "เต้นฉลองงานผ่าน",
  "cape-drama": "สะบัดผ้าคลุมเกินเหตุ",
};

const levelColors: Record<Office3DLevel, number> = {
  available: 0x66bd8c,
  steady: 0x719ddb,
  busy: 0xe3a43f,
  overloaded: 0xef7958,
};

const sceneColors: Record<Office3DPerson["scene"], number> = {
  sales: 0xeeb552,
  campaign: 0xd27eb1,
  service: 0x69b9aa,
  code: 0x719ddb,
  edit: 0xa486e3,
  people: 0xef8b6f,
};

const behaviorLabels: Record<Office3DBehavior, string> = {
  rush: "เร่งงานหนัก",
  work: "กำลังทำงานยุ่ง",
  chill: "ทำงานชิล ๆ",
  walk: "เดินสำรวจออฟฟิศ",
  nap: "พักบนโซฟา",
  chat: "คุยกับทีม",
};

const roomLabels: Record<OfficeRoom, string> = {
  open: "OPEN OFFICE",
  creative: "CREATIVE LAB",
  meeting: "WAR ROOM",
  manager: "MANAGER POD",
  ceo: "CEO ROOM",
  lounge: "HERO LOUNGE",
  cafe: "POWER CAFE",
};

function stableHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash);
}

function costumeFor(person: Office3DPerson, dateKey: string, funCycle: number) {
  const seed = stableHash(`${person.id}:${dateKey}:${funCycle}`);
  return originalHeroCostumes[seed % originalHeroCostumes.length];
}

function gagFor(person: Office3DPerson, dateKey: string, funCycle: number) {
  const seed = stableHash(`${dateKey}:${person.id}:gag:${funCycle}`);
  return officeGags[seed % officeGags.length];
}

function roomFor(person: Office3DPerson, index: number): OfficeRoom {
  if (/CEO|กรรมการ|ผู้บริหาร/i.test(person.role)) return "ceo";
  if (/ผู้จัดการ|Manager|หัวหน้า/i.test(person.role)) return "manager";
  if (person.scene === "edit" || person.scene === "campaign") return "creative";
  if (person.scene === "people") return "meeting";
  if (person.behavior === "nap") return "lounge";
  if (person.behavior === "chat" && index % 2 === 0) return "cafe";
  return "open";
}

function createTextSprite(title: string, subtitle: string, accent = 0x63f6ff, width = 720) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = 170;
  const context = canvas.getContext("2d");
  if (!context) return new THREE.Sprite();
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "rgba(4,12,28,.92)";
  context.beginPath();
  context.roundRect(8, 8, canvas.width - 16, 148, 24);
  context.fill();
  context.strokeStyle = `#${accent.toString(16).padStart(6, "0")}`;
  context.lineWidth = 4;
  context.stroke();
  context.fillStyle = `#${accent.toString(16).padStart(6, "0")}`;
  context.font = "800 35px sans-serif";
  context.fillText(title, 34, 65, canvas.width - 68);
  context.fillStyle = "#a9c6d7";
  context.font = "600 23px sans-serif";
  context.fillText(subtitle, 34, 112, canvas.width - 68);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false }));
  sprite.scale.set(4.2, 1, 1);
  sprite.renderOrder = 80;
  return sprite;
}

function standardMaterial(color: number, roughness = .75, metalness = .04) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}

function box(
  parent: THREE.Object3D,
  size: [number, number, number],
  position: [number, number, number],
  color: number,
  options?: { radius?: number; castShadow?: boolean; receiveShadow?: boolean; material?: THREE.Material },
) {
  const geometry = options?.radius
    ? new THREE.BoxGeometry(size[0], size[1], size[2], 2, 2, 2)
    : new THREE.BoxGeometry(...size);
  const mesh = new THREE.Mesh(geometry, options?.material ?? standardMaterial(color));
  mesh.position.set(...position);
  mesh.castShadow = options?.castShadow ?? true;
  mesh.receiveShadow = options?.receiveShadow ?? true;
  parent.add(mesh);
  return mesh;
}

function cylinder(
  parent: THREE.Object3D,
  radiusTop: number,
  radiusBottom: number,
  height: number,
  position: [number, number, number],
  color: number,
  segments = 18,
) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments), standardMaterial(color));
  mesh.position.set(...position);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function addDesk(scene: THREE.Scene, x: number, z: number, accent: number) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  scene.add(group);
  box(group, [2.35, .16, 1.05], [0, 1.05, 0], 0x9a6e4d);
  box(group, [.13, 1, .13], [-.92, .51, -.34], 0x29463d);
  box(group, [.13, 1, .13], [.92, .51, -.34], 0x29463d);
  box(group, [1.05, .68, .11], [0, 1.54, -.32], 0x173a31);
  box(group, [.87, .5, .035], [0, 1.54, -.25], accent, { material: new THREE.MeshStandardMaterial({ color: accent, emissive: accent, emissiveIntensity: .12, roughness: .6 }) });
  box(group, [.11, .38, .1], [0, 1.13, -.3], 0x4e6b61);
  box(group, [.55, .06, .33], [0, 1.17, .2], 0xdbe6e0);
  cylinder(group, .16, .14, .28, [.78, 1.24, .12], 0xf8fbf9, 20);
  return group;
}

function addSofa(scene: THREE.Scene) {
  const sofa = new THREE.Group();
  sofa.position.set(5.55, 0, 3.6);
  scene.add(sofa);
  box(sofa, [3.25, .55, 1.25], [0, .48, 0], 0x79a395);
  box(sofa, [3.25, 1.18, .35], [0, 1.04, .47], 0x8bb2a6);
  box(sofa, [.35, .83, 1.28], [-1.48, .67, 0], 0x648f80);
  box(sofa, [.35, .83, 1.28], [1.48, .67, 0], 0x648f80);
  box(sofa, [1.3, .16, .98], [-.72, .81, -.1], 0x9bbeb3);
  box(sofa, [1.3, .16, .98], [.72, .81, -.1], 0x9bbeb3);
}

function addWaterCooler(scene: THREE.Scene) {
  const cooler = new THREE.Group();
  cooler.position.set(-7.15, 0, 3.7);
  scene.add(cooler);
  box(cooler, [.75, 1.55, .72], [0, .78, 0], 0xf3f8f5);
  const bottle = cylinder(cooler, .28, .34, .78, [0, 1.9, 0], 0x9ed4e4, 22);
  (bottle.material as THREE.MeshStandardMaterial).transparent = true;
  (bottle.material as THREE.MeshStandardMaterial).opacity = .72;
  box(cooler, [.33, .16, .08], [0, 1.08, .41], 0x6b9d8d);
}

function addPlant(scene: THREE.Scene, x: number, z: number, scale = 1) {
  const plant = new THREE.Group();
  plant.position.set(x, 0, z);
  plant.scale.setScalar(scale);
  scene.add(plant);
  cylinder(plant, .38, .3, .6, [0, .3, 0], 0xc77958, 20);
  [-.34, 0, .34].forEach((rotation, index) => {
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(.28, 12, 8), standardMaterial([0x3b8465, 0x5da77f, 0x72b58c][index]));
    leaf.scale.set(.72, 2.2, .48);
    leaf.position.set(Math.sin(rotation) * .25, .96 + index * .08, Math.cos(rotation) * .1);
    leaf.rotation.z = rotation;
    leaf.castShadow = true;
    plant.add(leaf);
  });
}

function addMeetingArea(scene: THREE.Scene) {
  const group = new THREE.Group();
  group.position.set(0, 0, 3.75);
  scene.add(group);
  cylinder(group, 1.2, 1.2, .15, [0, .9, 0], 0xb98963, 28);
  cylinder(group, .16, .2, .9, [0, .45, 0], 0x38534a, 18);
  [[-1.5, 0], [1.5, 0], [0, -1.45]].forEach(([x, z]) => {
    box(group, [.62, .18, .62], [x, .54, z], 0x6d9b8c);
    box(group, [.52, .75, .14], [x, .92, z + .28], 0x7fa99c);
  });
}

function addRoomZone(
  scene: THREE.Scene,
  room: OfficeRoom,
  center: [number, number],
  size: [number, number],
  floorColor: number,
  accent: number,
  subtitle: string,
) {
  const [x, z] = center;
  const [width, depth] = size;
  box(scene, [width, .045, depth], [x, .025, z], floorColor, { receiveShadow: true });
  const borderMaterial = new THREE.MeshStandardMaterial({ color: accent, emissive: accent, emissiveIntensity: .18, roughness: .55 });
  box(scene, [width, .025, .05], [x, .055, z - depth / 2], accent, { material: borderMaterial });
  box(scene, [width, .025, .05], [x, .055, z + depth / 2], accent, { material: borderMaterial });
  box(scene, [.05, .025, depth], [x - width / 2, .055, z], accent, { material: borderMaterial });
  box(scene, [.05, .025, depth], [x + width / 2, .055, z], accent, { material: borderMaterial });
  const sign = createTextSprite(roomLabels[room], subtitle, accent);
  sign.position.set(x, 3.8, z - depth / 2 + .18);
  scene.add(sign);
}

function addGlassWall(scene: THREE.Scene, size: [number, number, number], position: [number, number, number]) {
  const material = new THREE.MeshPhysicalMaterial({
    color: 0x7bdfea,
    roughness: .12,
    metalness: .04,
    transparent: true,
    opacity: .17,
    transmission: .42,
    depthWrite: false,
  });
  const wall = box(scene, size, position, 0x7bdfea, { material, castShadow: false, receiveShadow: false });
  wall.renderOrder = 2;
  return wall;
}

function addExecutiveDesk(scene: THREE.Scene, x: number, z: number, accent: number) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  scene.add(group);
  box(group, [3.2, .22, 1.25], [0, 1.08, 0], 0x43356f);
  box(group, [.22, 1.05, 1.05], [-1.3, .54, 0], 0x242647);
  box(group, [.22, 1.05, 1.05], [1.3, .54, 0], 0x242647);
  box(group, [1.25, .78, .12], [0, 1.66, -.34], 0x10192f);
  box(group, [1.05, .58, .035], [0, 1.66, -.27], accent, { material: new THREE.MeshStandardMaterial({ color: accent, emissive: accent, emissiveIntensity: .24 }) });
  cylinder(group, .2, .17, .42, [1.03, 1.4, .12], 0xe9f4ff, 22);
}

function addCreativeStation(scene: THREE.Scene, x: number, z: number) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  scene.add(group);
  box(group, [3.5, .15, 1.2], [0, .98, 0], 0x6b4772);
  [-.95, 0, .95].forEach((monitorX, index) => {
    box(group, [.78, .58, .1], [monitorX, 1.43, -.25], 0x111a31);
    box(group, [.64, .44, .026], [monitorX, 1.43, -.19], [0xff72c8, 0x63f6ff, 0xb9ff45][index], { material: new THREE.MeshStandardMaterial({ color: [0xff72c8, 0x63f6ff, 0xb9ff45][index], emissive: [0xff72c8, 0x63f6ff, 0xb9ff45][index], emissiveIntensity: .24 }) });
  });
  box(group, [2.7, .07, .3], [0, 1.12, .26], 0xdde7f0);
}

function addWarRoom(scene: THREE.Scene, x: number, z: number) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  scene.add(group);
  box(group, [4.6, .18, 1.7], [0, .9, 0], 0x31506d);
  box(group, [3.4, .06, .86], [0, 1.02, 0], 0x4e7595);
  [[-1.65, -1.22], [0, -1.22], [1.65, -1.22], [-1.65, 1.22], [0, 1.22], [1.65, 1.22]].forEach(([chairX, chairZ]) => {
    box(group, [.58, .15, .6], [chairX, .54, chairZ], 0x7655a6);
    box(group, [.52, .72, .13], [chairX, .91, chairZ + (chairZ > 0 ? .27 : -.27)], 0x5e438b);
  });
  box(group, [4.8, 2.25, .12], [0, 2.2, -2.08], 0x111a30);
  box(group, [4.45, 1.86, .03], [0, 2.2, -2], 0x172c51, { material: new THREE.MeshStandardMaterial({ color: 0x172c51, emissive: 0x63f6ff, emissiveIntensity: .16 }) });
}

function addCafe(scene: THREE.Scene, x: number, z: number) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  scene.add(group);
  box(group, [4.4, 1.05, .8], [0, .53, 0], 0x544067);
  box(group, [4.6, .12, 1.05], [0, 1.1, 0], 0x805c49);
  [-1.25, 0, 1.25].forEach((cupX, index) => cylinder(group, .16, .13, .28, [cupX, 1.3, .05], [0xf5f1e6, 0x8ee8df, 0xffc56d][index], 18));
  box(group, [1.1, 1.45, .75], [1.45, 1.85, .05], 0x1a2843);
  box(group, [.72, .42, .03], [1.45, 2.05, .44], 0xb9ff45, { material: new THREE.MeshStandardMaterial({ color: 0xb9ff45, emissive: 0xb9ff45, emissiveIntensity: .2 }) });
}

function addArcade(scene: THREE.Scene, x: number, z: number) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  scene.add(group);
  [-1.1, 1.1].forEach((machineX, index) => {
    box(group, [1.1, 2.1, .9], [machineX, 1.05, 0], index ? 0x3e3168 : 0x214b62);
    box(group, [.78, .64, .04], [machineX, 1.45, .47], index ? 0xff72c8 : 0x63f6ff, { material: new THREE.MeshStandardMaterial({ color: index ? 0xff72c8 : 0x63f6ff, emissive: index ? 0xff72c8 : 0x63f6ff, emissiveIntensity: .3 }) });
    cylinder(group, .09, .09, .16, [machineX - .18, .96, .5], 0xb9ff45, 14).rotation.x = Math.PI / 2;
  });
}

function createLabelSprite(person: Office3DPerson, costume: HeroCostume, gag: OfficeGag, room: OfficeRoom) {
  const canvas = document.createElement("canvas");
  canvas.width = 640;
  canvas.height = 180;
  const context = canvas.getContext("2d");
  if (!context) return new THREE.Sprite();
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "rgba(255,255,255,.95)";
  context.beginPath();
  context.roundRect(10, 10, 620, 155, 28);
  context.fill();
  context.fillStyle = `#${levelColors[person.level].toString(16).padStart(6, "0")}`;
  context.beginPath();
  context.arc(47, 53, 14, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = "#15372e";
  context.font = "700 34px sans-serif";
  context.fillText(person.name, 78, 65, 520);
  context.fillStyle = "#708079";
  context.font = "600 23px sans-serif";
  context.fillText(`${person.role} · ${costume.name}`, 30, 105, 570);
  context.fillStyle = "#315c4d";
  context.font = "700 18px sans-serif";
  context.fillText(`${roomLabels[room]} · ${behaviorLabels[person.behavior]} · ${gagLabels[gag]}`, 30, 138, 575);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false }));
  sprite.scale.set(3.35, .94, 1);
  sprite.position.set(0, 2.75, 0);
  sprite.renderOrder = 100;
  return sprite;
}

function createCharacter(person: Office3DPerson, costume: HeroCostume, gag: OfficeGag, room: OfficeRoom) {
  const root = new THREE.Group();
  const model = new THREE.Group();
  root.add(model);
  const skin = 0xd99d76;
  const dark = 0x263f37;

  const torso = box(model, [.78, .9, .42], [0, 1.1, 0], costume.primary);
  torso.geometry.translate(0, 0, 0);
  const head = new THREE.Mesh(new THREE.SphereGeometry(.32, 18, 14), standardMaterial(skin));
  head.position.set(0, 1.84, 0);
  head.scale.set(1, 1.06, .96);
  head.castShadow = true;
  model.add(head);
  const hair = new THREE.Mesh(new THREE.SphereGeometry(.325, 18, 10, 0, Math.PI * 2, 0, Math.PI * .48), standardMaterial(dark));
  hair.position.set(0, 1.91, -.005);
  hair.castShadow = true;
  model.add(hair);

  if (costume.mask) {
    const mask = box(model, [.48, .13, .055], [0, 1.88, .292], costume.secondary, { castShadow: false });
    mask.rotation.z = -.02;
  }
  if (costume.headgear === "ears") {
    [[-.2, 0], [.2, 0]].forEach(([x]) => {
      const ear = new THREE.Mesh(new THREE.ConeGeometry(.1, .28, 4), standardMaterial(costume.secondary));
      ear.position.set(x, 2.22, 0);
      ear.rotation.z = x < 0 ? -.1 : .1;
      model.add(ear);
    });
  } else if (costume.headgear === "antenna") {
    [[-.16, -.08], [.16, .08]].forEach(([x, tilt]) => {
      const antenna = cylinder(model, .025, .025, .38, [x, 2.25, 0], costume.accent, 10);
      antenna.rotation.z = tilt;
      const light = new THREE.Mesh(new THREE.SphereGeometry(.065, 10, 8), new THREE.MeshStandardMaterial({ color: costume.accent, emissive: costume.accent, emissiveIntensity: .5 }));
      light.position.set(x + tilt * .15, 2.45, 0);
      model.add(light);
    });
  } else if (costume.headgear === "crown") {
    const crown = cylinder(model, .23, .28, .22, [0, 2.2, 0], costume.accent, 7);
    crown.rotation.y = Math.PI / 7;
  }

  box(model, [.82, .12, .46], [0, .78, 0], costume.accent);
  const chest = new THREE.Mesh(new THREE.OctahedronGeometry(.15, 0), new THREE.MeshStandardMaterial({ color: costume.accent, emissive: costume.accent, emissiveIntensity: .22 }));
  chest.position.set(0, 1.22, .245);
  chest.scale.y = .72;
  model.add(chest);

  let cape: THREE.Object3D | null = null;
  if (costume.cape) {
    cape = box(model, [.72, 1.15, .08], [0, 1.12, -.27], costume.secondary);
    cape.rotation.x = -.11;
  }

  const badgeCanvas = document.createElement("canvas");
  badgeCanvas.width = 128;
  badgeCanvas.height = 128;
  const badgeContext = badgeCanvas.getContext("2d");
  if (badgeContext) {
    badgeContext.fillStyle = "rgba(255,255,255,.82)";
    badgeContext.beginPath();
    badgeContext.roundRect(14, 23, 100, 82, 19);
    badgeContext.fill();
    badgeContext.fillStyle = "#23443a";
    badgeContext.font = "700 43px sans-serif";
    badgeContext.textAlign = "center";
    badgeContext.fillText(person.initials, 64, 78, 92);
  }
  const badgeTexture = new THREE.CanvasTexture(badgeCanvas);
  badgeTexture.colorSpace = THREE.SRGBColorSpace;
  const badge = new THREE.Mesh(new THREE.PlaneGeometry(.43, .43), new THREE.MeshBasicMaterial({ map: badgeTexture, transparent: true }));
  badge.position.set(0, 1.15, .197);
  model.add(badge);

  function limb(width: number, height: number, color: number) {
    const pivot = new THREE.Group();
    const mesh = box(pivot, [width, height, width], [0, -height / 2, 0], color);
    mesh.geometry.translate(0, 0, 0);
    return pivot;
  }
  const leftArm = limb(.16, .72, skin);
  leftArm.position.set(-.46, 1.48, 0);
  leftArm.rotation.z = -.2;
  model.add(leftArm);
  const rightArm = limb(.16, .72, skin);
  rightArm.position.set(.46, 1.48, 0);
  rightArm.rotation.z = .2;
  model.add(rightArm);
  const leftLeg = limb(.2, .78, costume.secondary);
  leftLeg.position.set(-.21, .78, 0);
  model.add(leftLeg);
  const rightLeg = limb(.2, .78, costume.secondary);
  rightLeg.position.set(.21, .78, 0);
  model.add(rightLeg);

  let prop: THREE.Object3D | null = null;
  if (gag === "coffee-toast") {
    prop = cylinder(rightArm, .11, .09, .22, [0, -.76, .1], 0xf5f3e8, 14);
    prop.rotation.x = Math.PI / 2;
  } else if (gag === "air-guitar") {
    const guitar = new THREE.Group();
    const body = new THREE.Mesh(new THREE.SphereGeometry(.22, 12, 9), standardMaterial(costume.accent));
    body.scale.set(1, 1.25, .35);
    guitar.add(body);
    box(guitar, [.1, .7, .08], [0, .44, 0], costume.secondary);
    guitar.position.set(.18, 1.05, .36);
    guitar.rotation.z = -.72;
    model.add(guitar);
    prop = guitar;
  }

  const label = createLabelSprite(person, costume, gag, room);
  root.add(label);
  const status = new THREE.Mesh(new THREE.SphereGeometry(.11, 12, 9), new THREE.MeshStandardMaterial({ color: levelColors[person.level], emissive: levelColors[person.level], emissiveIntensity: .4 }));
  status.position.set(-1.5, 2.72, .05);
  root.add(status);

  root.traverse((object) => { object.userData.employeeId = person.id; });
  return { root, model, leftArm, rightArm, leftLeg, rightLeg, cape, prop };
}

function disposeScene(scene: THREE.Scene) {
  scene.traverse((object) => {
    if (!(object instanceof THREE.Mesh || object instanceof THREE.Sprite)) return;
    if ("geometry" in object && object.geometry) object.geometry.dispose();
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    materials.forEach((material) => {
      if (material instanceof THREE.SpriteMaterial && material.map) material.map.dispose();
      if (material instanceof THREE.MeshBasicMaterial && material.map) material.map.dispose();
      material.dispose();
    });
  });
}

function createOfficeAudioEngine(): AudioEngine {
  const AudioContextConstructor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextConstructor) throw new Error("อุปกรณ์นี้ยังไม่รองรับระบบเสียงสำนักงาน");
  const context = new AudioContextConstructor();
  const master = context.createGain();
  master.gain.value = .52;
  master.connect(context.destination);
  const workGain = context.createGain();
  workGain.gain.value = 0;
  workGain.connect(master);
  const musicGain = context.createGain();
  musicGain.gain.value = 0;
  musicGain.connect(master);
  const sources: AudioScheduledSourceNode[] = [];

  const noiseBuffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
  const noiseData = noiseBuffer.getChannelData(0);
  for (let index = 0; index < noiseData.length; index += 1) noiseData[index] = (Math.random() * 2 - 1) * .28;
  const noise = context.createBufferSource();
  noise.buffer = noiseBuffer;
  noise.loop = true;
  const noiseFilter = context.createBiquadFilter();
  noiseFilter.type = "bandpass";
  noiseFilter.frequency.value = 540;
  noiseFilter.Q.value = .48;
  const noiseVolume = context.createGain();
  noiseVolume.gain.value = .035;
  noise.connect(noiseFilter).connect(noiseVolume).connect(workGain);
  noise.start();
  sources.push(noise);

  const chordSets = [[130.81, 164.81, 196], [146.83, 174.61, 220], [110, 146.83, 174.61], [123.47, 155.56, 196]];
  const padOscillators = chordSets[0].map((frequency, index) => {
    const oscillator = context.createOscillator();
    oscillator.type = index === 0 ? "sine" : "triangle";
    oscillator.frequency.value = frequency;
    const padGain = context.createGain();
    padGain.gain.value = index === 0 ? .045 : .024;
    oscillator.connect(padGain).connect(musicGain);
    oscillator.start();
    sources.push(oscillator);
    return oscillator;
  });
  let chordIndex = 0;
  const musicTimer = window.setInterval(() => {
    chordIndex = (chordIndex + 1) % chordSets.length;
    padOscillators.forEach((oscillator, index) => oscillator.frequency.exponentialRampToValueAtTime(chordSets[chordIndex][index], context.currentTime + 1.6));
  }, 6200);
  let clickPitch = 0;
  const workTimer = window.setInterval(() => {
    if (context.state !== "running" || workGain.gain.value < .01) return;
    const oscillator = context.createOscillator();
    const clickGain = context.createGain();
    oscillator.type = "square";
    oscillator.frequency.value = [480, 620, 740, 390][clickPitch % 4];
    clickPitch += 1;
    clickGain.gain.setValueAtTime(.014, context.currentTime);
    clickGain.gain.exponentialRampToValueAtTime(.0001, context.currentTime + .045);
    oscillator.connect(clickGain).connect(workGain);
    oscillator.start();
    oscillator.stop(context.currentTime + .05);
  }, 940);
  return { context, workGain, musicGain, sources, workTimer, musicTimer };
}

function stopOfficeAudioEngine(engine: AudioEngine | null) {
  if (!engine) return;
  window.clearInterval(engine.workTimer);
  window.clearInterval(engine.musicTimer);
  engine.sources.forEach((source) => {
    try { source.stop(); } catch { /* source may already be stopped */ }
  });
  void engine.context.close();
}

function funnyConversation(person: Office3DPerson, costume: HeroCostume, gag: OfficeGag, index: number) {
  const task = person.currentTask === "พร้อมรับงานใหม่" ? "กำลังรอภารกิจลับรอบใหม่" : `กำลังจัดการ ${person.currentTask}`;
  const lines = [
    `${person.name} รายงานตัวในชุด${costume.name} วันนี้${task} ถ้ากาแฟไม่หมดก่อนนะ`,
    `${person.name} บอกว่า ภาระงาน ${person.loadPercent} เปอร์เซ็นต์ แต่พลังผ้าคลุมเต็มหนึ่งร้อย`,
    `${person.name} กำลัง${gagLabels[gag]} และยืนยันว่าจะส่งงานก่อนโลกต้องการฮีโร่`,
    `${person.name} จาก${person.role} ขอเวลาสองนาทีไปกู้จักรวาล เอ๊ะ หมายถึงกู้ไฟล์งาน`,
  ];
  return lines[index % lines.length];
}

export default function Office3D({ people, onSelect }: { people: Office3DPerson[]; onSelect: (employeeId: string) => void }) {
  const shellRef = useRef<HTMLElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const resetCameraRef = useRef<() => void>(() => undefined);
  const motionRef = useRef(true);
  const audioEngineRef = useRef<AudioEngine | null>(null);
  const onSelectRef = useRef(onSelect);
  const peopleRef = useRef(people);
  const [motionEnabled, setMotionEnabled] = useState(true);
  const [visualMode, setVisualMode] = useState<OfficeVisualMode>("cinematic");
  const [ambienceEnabled, setAmbienceEnabled] = useState(false);
  const [musicEnabled, setMusicEnabled] = useState(false);
  const [funCycle, setFunCycle] = useState(0);
  const [conversation, setConversation] = useState("AI พร้อมเล่าเรื่องฮาในออฟฟิศ");
  const [officeDateKey] = useState(() => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(new Date()));
  const [error, setError] = useState("");
  const peopleKey = JSON.stringify(people);
  const sceneKey = `${peopleKey}:${officeDateKey}:${funCycle}`;

  useEffect(() => { onSelectRef.current = onSelect; }, [onSelect]);
  useEffect(() => { peopleRef.current = people; }, [people]);
  useEffect(() => { motionRef.current = motionEnabled; }, [motionEnabled]);

  useEffect(() => () => {
    stopOfficeAudioEngine(audioEngineRef.current);
    window.speechSynthesis?.cancel();
  }, []);

  useEffect(() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const syncMotionPreference = () => setMotionEnabled(!reducedMotion.matches);
    const timer = window.setTimeout(syncMotionPreference, 0);
    reducedMotion.addEventListener("change", syncMotionPreference);
    return () => {
      window.clearTimeout(timer);
      reducedMotion.removeEventListener("change", syncMotionPreference);
    };
  }, []);

  const ensureAudioEngine = async () => {
    if (!audioEngineRef.current) audioEngineRef.current = createOfficeAudioEngine();
    if (audioEngineRef.current.context.state === "suspended") await audioEngineRef.current.context.resume();
    return audioEngineRef.current;
  };

  const toggleAmbience = async () => {
    try {
      const engine = await ensureAudioEngine();
      const next = !ambienceEnabled;
      engine.workGain.gain.cancelScheduledValues(engine.context.currentTime);
      engine.workGain.gain.linearRampToValueAtTime(next ? .7 : 0, engine.context.currentTime + .25);
      setAmbienceEnabled(next);
    } catch (audioError) {
      setConversation(audioError instanceof Error ? audioError.message : "เปิดเสียงบรรยากาศไม่สำเร็จ");
    }
  };

  const toggleMusic = async () => {
    try {
      const engine = await ensureAudioEngine();
      const next = !musicEnabled;
      engine.musicGain.gain.cancelScheduledValues(engine.context.currentTime);
      engine.musicGain.gain.linearRampToValueAtTime(next ? .42 : 0, engine.context.currentTime + .8);
      setMusicEnabled(next);
    } catch (audioError) {
      setConversation(audioError instanceof Error ? audioError.message : "เปิดเพลง Focus ไม่สำเร็จ");
    }
  };

  const playAiConversation = () => {
    if (!("speechSynthesis" in window) || !people.length) {
      setConversation("อุปกรณ์นี้ยังไม่รองรับเสียงพูด AI");
      return;
    }
    window.speechSynthesis.cancel();
    const speakers = people.slice(funCycle % people.length).concat(people).slice(0, Math.min(3, people.length));
    const messages = speakers.map((person, index) => {
      const costume = costumeFor(person, officeDateKey, funCycle);
      const gag = gagFor(person, officeDateKey, funCycle);
      return funnyConversation(person, costume, gag, index + funCycle);
    });
    setConversation(messages.join("  •  "));
    const thaiVoice = window.speechSynthesis.getVoices().find((voice) => voice.lang.toLowerCase().startsWith("th"));
    messages.forEach((message, index) => {
      const utterance = new SpeechSynthesisUtterance(message);
      utterance.lang = "th-TH";
      if (thaiVoice) utterance.voice = thaiVoice;
      utterance.rate = .92 + index * .03;
      utterance.pitch = 1.02 + (index % 2) * .08;
      utterance.volume = .88;
      window.speechSynthesis.speak(utterance);
    });
  };

  useEffect(() => {
    if (visualMode !== "interactive") return;
    const host = hostRef.current;
    if (!host) return;
    const activePeople = peopleRef.current;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
    } catch {
      window.setTimeout(() => setError("อุปกรณ์นี้ไม่สามารถเปิดฉาก 3D ได้ กรุณาเปิดการเร่งกราฟิกในเบราว์เซอร์"), 0);
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    renderer.setSize(host.clientWidth, host.clientHeight, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.setAttribute("aria-label", "ออฟฟิศสามมิติแบบโต้ตอบ หมุนกล้องด้วยการลากและซูมด้วยล้อเมาส์");
    renderer.domElement.setAttribute("role", "img");
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x050b1d);
    scene.fog = new THREE.Fog(0x071126, 34, 66);
    const camera = new THREE.PerspectiveCamera(40, host.clientWidth / host.clientHeight, .1, 110);
    const defaultCamera = new THREE.Vector3(28, 25, 31);
    camera.position.copy(defaultCamera);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 1.25, .5);
    controls.enableDamping = true;
    controls.dampingFactor = .07;
    controls.minDistance = 12;
    controls.maxDistance = 52;
    controls.minPolarAngle = .26;
    controls.maxPolarAngle = Math.PI * .49;
    controls.maxTargetRadius = 14;
    controls.update();
    resetCameraRef.current = () => {
      camera.position.copy(defaultCamera);
      controls.target.set(0, 1.25, .5);
      controls.update();
    };

    scene.add(new THREE.HemisphereLight(0xc6f8ff, 0x17142a, 2.25));
    const sun = new THREE.DirectionalLight(0xe7f8ff, 3.8);
    sun.position.set(-10, 21, 13);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -22;
    sun.shadow.camera.right = 22;
    sun.shadow.camera.top = 17;
    sun.shadow.camera.bottom = -17;
    scene.add(sun);
    const fill = new THREE.DirectionalLight(0x626dff, 1.55);
    fill.position.set(14, 9, -10);
    scene.add(fill);
    const cyanGlow = new THREE.PointLight(0x63f6ff, 18, 25, 1.8);
    cyanGlow.position.set(-10, 7, 3);
    scene.add(cyanGlow);
    const limeGlow = new THREE.PointLight(0xb9ff45, 11, 20, 2);
    limeGlow.position.set(11, 6, 5);
    scene.add(limeGlow);

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(34, 24), standardMaterial(0x101a31, .92, .12));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);
    const grid = new THREE.GridHelper(34, 34, 0x63f6ff, 0x273753);
    grid.scale.z = 24 / 34;
    grid.position.y = .005;
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = .24;
    scene.add(grid);
    box(scene, [34, 6.3, .25], [0, 3.15, -11.88], 0x101b32, { receiveShadow: true });
    box(scene, [.25, 6.3, 24], [-16.88, 3.15, 0], 0x0d182e, { receiveShadow: true });
    box(scene, [.25, 6.3, 24], [16.88, 3.15, 0], 0x0d182e, { receiveShadow: true });

    addRoomZone(scene, "creative", [-11.7, -7.4], [9.2, 7.7], 0x20142f, 0xff72c8, "ห้องตัดต่อและครีเอทีฟ");
    addRoomZone(scene, "meeting", [9.9, -7.4], [12.5, 7.7], 0x13233a, 0x63f6ff, "ห้องประชุมวางแผนภารกิจ");
    addRoomZone(scene, "open", [-3.3, .9], [17, 8.2], 0x101c31, 0x4f7cff, "พื้นที่ทำงานรวมของทุกทีม");
    addRoomZone(scene, "manager", [10.6, .7], [6.9, 6.3], 0x1b1831, 0x9f7cff, "ห้องผู้จัดการและหัวหน้าทีม");
    addRoomZone(scene, "lounge", [-11.2, 8.2], [10.2, 5.3], 0x152c31, 0xb9ff45, "พัก เติมพลัง และปล่อยมุก");
    addRoomZone(scene, "cafe", [-1.1, 8.2], [8.8, 5.3], 0x2a1d30, 0xffb45b, "กาแฟ เพลง และบทสนทนา AI");
    addRoomZone(scene, "ceo", [11.1, 8.2], [9.8, 5.3], 0x171c38, 0x6ef7ff, "ห้อง CEO วิวเดดไลน์ทั่วจักรวาล");

    addGlassWall(scene, [.12, 4.2, 6.3], [7.18, 2.1, .7]);
    addGlassWall(scene, [6.9, 4.2, .12], [10.6, 2.1, -2.42]);
    addGlassWall(scene, [.12, 4.2, 5.25], [6.15, 2.1, 8.2]);
    addGlassWall(scene, [9.8, 4.2, .12], [11.1, 2.1, 5.58]);

    const deskPositions: [number, number][] = [[-9.4, -.65], [-6.1, -.65], [-2.8, -.65], [.5, -.65], [-9.4, 2.55], [-6.1, 2.55], [-2.8, 2.55], [.5, 2.55]];
    deskPositions.forEach(([x, z], index) => addDesk(scene, x, z, Object.values(sceneColors)[index % Object.values(sceneColors).length]));
    addCreativeStation(scene, -11.6, -7.15);
    addWarRoom(scene, 9.9, -7.1);
    addExecutiveDesk(scene, 10.9, 7.95, 0x63f6ff);
    addExecutiveDesk(scene, 10.5, .4, 0x9f7cff);
    addSofa(scene);
    const loungeSofa = scene.children[scene.children.length - 1];
    loungeSofa.position.set(-11.25, 0, 8.15);
    addCafe(scene, -1.2, 8.15);
    addArcade(scene, -13.7, 8.05);
    addWaterCooler(scene);
    const cooler = scene.children[scene.children.length - 1];
    cooler.position.set(2.45, 0, 7.85);
    addPlant(scene, -16.05, -10.7, 1.05);
    addPlant(scene, 16.05, -10.7, .95);
    addPlant(scene, 5.55, 5.95, .85);

    addMeetingArea(scene);
    const quickMeeting = scene.children[scene.children.length - 1];
    quickMeeting.position.set(3.6, 0, 2.1);

    const roomAnchors: Record<OfficeRoom, THREE.Vector3[]> = {
      open: deskPositions.map(([x, z]) => new THREE.Vector3(x, 0, z + .95)),
      creative: [new THREE.Vector3(-12.6, 0, -5.85), new THREE.Vector3(-11.5, 0, -5.85), new THREE.Vector3(-10.4, 0, -5.85)],
      meeting: [new THREE.Vector3(8.4, 0, -5.65), new THREE.Vector3(9.9, 0, -5.65), new THREE.Vector3(11.4, 0, -5.65)],
      manager: [new THREE.Vector3(10.5, 0, 1.55), new THREE.Vector3(12.4, 0, 2.25)],
      ceo: [new THREE.Vector3(10.9, 0, 9.1)],
      lounge: [new THREE.Vector3(-11.7, .72, 8), new THREE.Vector3(-10.5, .72, 8)],
      cafe: [new THREE.Vector3(-2.4, 0, 9.65), new THREE.Vector3(0, 0, 9.65)],
    };
    const walkPoints = [
      new THREE.Vector3(-14.6, 0, -3.2), new THREE.Vector3(-10.5, 0, 4.7), new THREE.Vector3(-5.2, 0, 5.5),
      new THREE.Vector3(0, 0, 4.8), new THREE.Vector3(5.1, 0, 4.7), new THREE.Vector3(7.2, 0, 1.2),
      new THREE.Vector3(5.8, 0, -4.2), new THREE.Vector3(0, 0, -4.7), new THREE.Vector3(-6.2, 0, -4.6),
      new THREE.Vector3(-14.5, 0, 4.7), new THREE.Vector3(-5.7, 0, 9.7), new THREE.Vector3(4.3, 0, 9.6),
    ];
    const rigs: CharacterRig[] = [];
    activePeople.forEach((person, index) => {
      const room = roomFor(person, index);
      const costume = costumeFor(person, officeDateKey, funCycle);
      const gag = gagFor(person, officeDateKey, funCycle);
      const character = createCharacter(person, costume, gag, room);
      const anchors = roomAnchors[room];
      let basePosition = anchors[index % anchors.length].clone();
      if (person.behavior === "walk") basePosition = walkPoints[(index * 2) % walkPoints.length].clone();
      if (person.behavior === "chat") basePosition = roomAnchors.cafe[index % roomAnchors.cafe.length].clone();
      if (person.behavior === "nap") basePosition = roomAnchors.lounge[index % roomAnchors.lounge.length].clone();
      character.root.position.copy(basePosition);
      character.root.rotation.y = person.behavior === "walk" ? 0 : Math.PI;
      if (person.behavior === "nap") {
        character.model.rotation.z = -Math.PI * .48;
        character.model.rotation.y = Math.PI * .5;
        character.model.scale.setScalar(.82);
        character.model.position.set(-.25, .05, 0);
      }
      scene.add(character.root);
      rigs.push({
        id: person.id,
        behavior: person.behavior,
        gag,
        ...character,
        basePosition,
        targetIndex: (index * 2 + 1) % walkPoints.length,
        speed: .62 + (index % 3) * .09,
      });
    });

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let pointerDown = { x: 0, y: 0 };
    const onPointerDown = (event: PointerEvent) => { pointerDown = { x: event.clientX, y: event.clientY }; };
    const onPointerUp = (event: PointerEvent) => {
      if (Math.hypot(event.clientX - pointerDown.x, event.clientY - pointerDown.y) > 7) return;
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = (event.clientX - rect.left) / rect.width * 2 - 1;
      pointer.y = -(event.clientY - rect.top) / rect.height * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects(rigs.map((rig) => rig.root), true)[0]?.object;
      let target: THREE.Object3D | null = hit ?? null;
      while (target && !target.userData.employeeId) target = target.parent;
      if (target?.userData.employeeId) onSelectRef.current(String(target.userData.employeeId));
    };
    renderer.domElement.addEventListener("pointerdown", onPointerDown);
    renderer.domElement.addEventListener("pointerup", onPointerUp);

    const resizeObserver = new ResizeObserver(() => {
      if (!host.clientWidth || !host.clientHeight) return;
      camera.aspect = host.clientWidth / host.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(host.clientWidth, host.clientHeight, false);
    });
    resizeObserver.observe(host);

    const clock = new THREE.Clock();
    let elapsed = 0;
    renderer.setAnimationLoop(() => {
      const delta = Math.min(clock.getDelta(), .04);
      if (motionRef.current) elapsed += delta;
      rigs.forEach((rig, index) => {
        if (!motionRef.current) return;
        const phase = elapsed * (rig.behavior === "rush" ? 9 : rig.behavior === "work" ? 5.5 : 2.4) + index;
        if (rig.behavior === "rush" || rig.behavior === "work" || rig.behavior === "chill") {
          rig.model.position.y = Math.sin(phase) * (rig.behavior === "rush" ? .035 : .018);
          rig.leftArm.rotation.x = -.72 + Math.sin(phase * 1.7) * .27;
          rig.rightArm.rotation.x = -.72 + Math.cos(phase * 1.9) * .27;
          if (rig.behavior === "chill") rig.rightArm.rotation.z = .35 + Math.max(0, Math.sin(elapsed * 1.4)) * .48;
        } else if (rig.behavior === "walk") {
          const target = walkPoints[rig.targetIndex];
          const direction = target.clone().sub(rig.root.position);
          direction.y = 0;
          if (direction.length() < .2) rig.targetIndex = (rig.targetIndex + 1 + index % 3) % walkPoints.length;
          else {
            direction.normalize();
            rig.root.position.addScaledVector(direction, rig.speed * delta);
            rig.root.rotation.y = Math.atan2(direction.x, direction.z);
          }
          rig.leftLeg.rotation.x = Math.sin(phase * 2.2) * .58;
          rig.rightLeg.rotation.x = -Math.sin(phase * 2.2) * .58;
          rig.leftArm.rotation.x = -Math.sin(phase * 2.2) * .42;
          rig.rightArm.rotation.x = Math.sin(phase * 2.2) * .42;
          rig.model.position.y = Math.abs(Math.sin(phase * 2.2)) * .055;
        } else if (rig.behavior === "chat") {
          rig.model.position.y = Math.sin(phase) * .025;
          rig.rightArm.rotation.z = .2 + Math.sin(phase * 1.5) * .65;
          rig.root.rotation.y = Math.PI * .72 + Math.sin(elapsed * .7 + index) * .16;
        } else if (rig.behavior === "nap") {
          rig.model.position.y = .05 + Math.sin(elapsed * 1.35 + index) * .018;
        }
        if (rig.cape) {
          rig.cape.rotation.x = -.1 + Math.sin(elapsed * 2.2 + index) * (rig.gag === "cape-drama" ? .42 : .08);
          rig.cape.rotation.z = Math.sin(elapsed * 1.4 + index) * (rig.gag === "cape-drama" ? .2 : .035);
        }
        if (rig.behavior !== "walk" && rig.behavior !== "nap") {
          if (rig.gag === "air-guitar") {
            rig.leftArm.rotation.z = -.48 + Math.sin(elapsed * 8 + index) * .22;
            rig.rightArm.rotation.z = .55 + Math.cos(elapsed * 10 + index) * .3;
            rig.model.rotation.y = Math.sin(elapsed * 2.5 + index) * .1;
          } else if (rig.gag === "coffee-toast") {
            rig.rightArm.rotation.x = -1.7 + Math.sin(elapsed * 1.6 + index) * .18;
            rig.rightArm.rotation.z = .42;
          } else if (rig.gag === "robot-glitch") {
            const glitch = Math.sin(elapsed * 3.7 + index * 2.1) > .9 ? .13 : 0;
            rig.model.position.x = glitch;
            rig.model.rotation.z = glitch ? -.12 : 0;
          } else if (rig.gag === "hero-pose") {
            rig.leftArm.rotation.z = -1.08 + Math.sin(elapsed * 1.2 + index) * .08;
            rig.rightArm.rotation.z = 1.08 - Math.sin(elapsed * 1.2 + index) * .08;
          } else if (rig.gag === "tiny-dance") {
            rig.model.position.y += Math.abs(Math.sin(elapsed * 4.6 + index)) * .1;
            rig.model.rotation.z = Math.sin(elapsed * 4.6 + index) * .12;
          }
        }
      });
      controls.update();
      renderer.render(scene, camera);
    });

    return () => {
      renderer.setAnimationLoop(null);
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      renderer.domElement.removeEventListener("pointerup", onPointerUp);
      controls.dispose();
      disposeScene(scene);
      renderer.dispose();
      renderer.domElement.remove();
      resetCameraRef.current = () => undefined;
    };
  }, [sceneKey, officeDateKey, funCycle, visualMode]);

  const toggleFullscreen = () => {
    const element = shellRef.current;
    if (!element) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void element.requestFullscreen();
  };

  const dailyCast = people.slice(0, 6).map((person) => ({
    person,
    costume: costumeFor(person, officeDateKey, funCycle),
    gag: gagFor(person, officeDateKey, funCycle),
  }));
  const cinematicCast = people.slice(0, cinematicWorkerSlots.length).map((person, index) => ({
    person,
    slot: cinematicWorkerSlots[index],
    costume: costumeFor(person, officeDateKey, funCycle),
    gag: gagFor(person, officeDateKey, funCycle),
  }));

  return (
    <section ref={shellRef} className={`office-3d-shell ${visualMode === "cinematic" ? "cinematic-mode" : "interactive-mode"} ${motionEnabled ? "" : "motion-paused"}`}>
      <div className="office-3d-toolbar">
        <div><span className="office-3d-live"><i /> HERO OFFICE LIVE</span><p><strong>People Pulse Hero Campus</strong><small>7 ห้อง · ชุดใหม่ทุกวัน · พฤติกรรมอิสระตามภาระงานจริง</small></p></div>
        <div className="office-3d-actions">
          <div className="office-view-switch" aria-label="เลือกรูปแบบสำนักงาน">
            <button className={visualMode === "cinematic" ? "active" : ""} onClick={() => setVisualMode("cinematic")} aria-pressed={visualMode === "cinematic"}>▦ ภาพแบบตัวอย่าง</button>
            <button className={visualMode === "interactive" ? "active" : ""} onClick={() => setVisualMode("interactive")} aria-pressed={visualMode === "interactive"}>◇ 3D หมุนได้</button>
          </div>
          <button className={ambienceEnabled ? "active" : ""} onClick={() => void toggleAmbience()} aria-pressed={ambienceEnabled}>{ambienceEnabled ? "🔊 เสียงทำงาน" : "🔈 เปิดบรรยากาศ"}</button>
          <button className={musicEnabled ? "active" : ""} onClick={() => void toggleMusic()} aria-pressed={musicEnabled}>{musicEnabled ? "♫ เพลงกำลังเล่น" : "♪ เพลง Focus"}</button>
          <button onClick={playAiConversation}>◖ ฟัง AI คุยกัน</button>
          <button onClick={() => { window.speechSynthesis?.cancel(); setFunCycle((cycle) => cycle + 1); setConversation("สุ่มชุดและเหตุการณ์ฮารอบใหม่แล้ว"); }}>✦ สุ่มเหตุการณ์ฮา</button>
          <button onClick={() => setMotionEnabled((enabled) => !enabled)}>{motionEnabled ? "Ⅱ หยุดฉาก" : "▶ เล่นต่อ"}</button>
          {visualMode === "interactive" && <button onClick={() => resetCameraRef.current()}>⌂ มุมเริ่มต้น</button>}
          <button onClick={toggleFullscreen}>⛶ เต็มจอ</button>
        </div>
      </div>
      <div className="office-3d-story-strip">
        <div><span>DAILY HERO CAST</span><strong>{officeDateKey}</strong><small>ชุดจะสลับอัตโนมัติทุกวัน</small></div>
        <div className="office-costume-roster">
          {dailyCast.map(({ person, costume, gag }) => <span key={person.id}><i style={{ background: `#${costume.primary.toString(16).padStart(6, "0")}` }} /> <b>{person.name.split(" ")[0]}</b><small>{costume.name} · {gagLabels[gag]}</small></span>)}
        </div>
      </div>
      {visualMode === "cinematic" ? (
        <div className="cinematic-campus" role="img" aria-label="People Pulse Hero Office Campus แบบภาพมุมสูง แบ่งเป็นสำนักงานหลายห้อง">
          <div className="cinematic-campus-image" />
          <div className="cinematic-scan" aria-hidden="true" />
          <div className="cinematic-room-map" aria-hidden="true">
            <span className="room-open">OPEN OFFICE</span>
            <span className="room-ceo">CEO ROOM</span>
            <span className="room-manager">MANAGER</span>
            <span className="room-creative">CREATIVE LAB</span>
            <span className="room-meeting">WAR ROOM</span>
            <span className="room-cafe">POWER CAFE</span>
            <span className="room-lounge">HERO LOUNGE</span>
          </div>
          <div className="cinematic-worker-layer">
            {cinematicCast.map(({ person, slot, costume, gag }, index) => (
              <button
                key={person.id}
                className={`cinematic-worker worker-${person.level} behavior-${person.behavior}`}
                style={{ left: `${slot.left}%`, top: `${slot.top}%`, "--worker-color": `#${costume.primary.toString(16).padStart(6, "0")}`, "--worker-delay": `${index * -.34}s` } as React.CSSProperties}
                onClick={() => onSelectRef.current(person.id)}
                aria-label={`เปิดงานของ ${person.name} ${person.role}`}
              >
                <i>{person.initials}</i>
                <span><b>{person.name.split(" ")[0]}</b><small>{person.currentTask}</small><em>{person.loadPercent}% · {gagLabels[gag]}</em></span>
              </button>
            ))}
          </div>
          <div className="cinematic-campus-hud"><span><i /> LIVE WORKLOAD</span><b>{people.length} HEROES ONLINE</b><small>กดตัวละครเพื่อเปิดงาน · ชุดและมุกเปลี่ยนทุกวัน</small></div>
        </div>
      ) : (
        <div ref={hostRef} className="office-3d-canvas">{error && <div className="office-3d-error"><span>!</span><strong>เปิดฉาก 3D ไม่สำเร็จ</strong><p>{error}</p></div>}</div>
      )}
      <div className="office-ai-conversation" aria-live="polite"><span>AI OFFICE RADIO</span><p>{conversation}</p></div>
      <div className="office-3d-footer"><span><i className="overloaded" />งานล้น: เร่งกู้เดดไลน์</span><span><i className="steady" />สมดุล: ทำงานพร้อมปล่อยมุก</span><span><i className="available" />ว่าง: เดิน คุย พัก หรือเล่นเกม</span><small>เสียงเป็นบรรยากาศจำลองและเปิดเมื่อผู้ใช้กดเท่านั้น · สถานะมาจากทูดูลิส ไม่ใช่การติดตามหน้าจอจริง</small></div>
    </section>
  );
}
