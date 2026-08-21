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
  root: THREE.Group;
  model: THREE.Group;
  leftArm: THREE.Group;
  rightArm: THREE.Group;
  leftLeg: THREE.Group;
  rightLeg: THREE.Group;
  basePosition: THREE.Vector3;
  targetIndex: number;
  speed: number;
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

function createLabelSprite(person: Office3DPerson) {
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
  context.fillText(`${person.role} · ${behaviorLabels[person.behavior]}`, 30, 110, 570);
  context.fillStyle = "#315c4d";
  context.font = "700 20px sans-serif";
  context.fillText(`${person.openCount} งาน · ภาระ ${person.loadPercent}%`, 30, 143, 570);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false }));
  sprite.scale.set(3.35, .94, 1);
  sprite.position.set(0, 2.75, 0);
  sprite.renderOrder = 100;
  return sprite;
}

function createCharacter(person: Office3DPerson) {
  const root = new THREE.Group();
  const model = new THREE.Group();
  root.add(model);
  const shirt = sceneColors[person.scene];
  const skin = 0xd99d76;
  const dark = 0x263f37;

  const torso = box(model, [.72, .85, .38], [0, 1.12, 0], shirt);
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
  const leftLeg = limb(.2, .78, 0x304d43);
  leftLeg.position.set(-.21, .78, 0);
  model.add(leftLeg);
  const rightLeg = limb(.2, .78, 0x304d43);
  rightLeg.position.set(.21, .78, 0);
  model.add(rightLeg);

  const label = createLabelSprite(person);
  root.add(label);
  const status = new THREE.Mesh(new THREE.SphereGeometry(.11, 12, 9), new THREE.MeshStandardMaterial({ color: levelColors[person.level], emissive: levelColors[person.level], emissiveIntensity: .4 }));
  status.position.set(-1.5, 2.72, .05);
  root.add(status);

  root.traverse((object) => { object.userData.employeeId = person.id; });
  return { root, model, leftArm, rightArm, leftLeg, rightLeg };
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

export default function Office3D({ people, onSelect }: { people: Office3DPerson[]; onSelect: (employeeId: string) => void }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const resetCameraRef = useRef<() => void>(() => undefined);
  const motionRef = useRef(true);
  const onSelectRef = useRef(onSelect);
  const peopleRef = useRef(people);
  const [motionEnabled, setMotionEnabled] = useState(true);
  const [error, setError] = useState("");
  const peopleKey = JSON.stringify(people);

  useEffect(() => { onSelectRef.current = onSelect; }, [onSelect]);
  useEffect(() => { peopleRef.current = people; }, [people]);
  useEffect(() => { motionRef.current = motionEnabled; }, [motionEnabled]);

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

  useEffect(() => {
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
    scene.background = new THREE.Color(0xe9f1ec);
    scene.fog = new THREE.Fog(0xe9f1ec, 22, 38);
    const camera = new THREE.PerspectiveCamera(38, host.clientWidth / host.clientHeight, .1, 80);
    const defaultCamera = new THREE.Vector3(12.5, 12.2, 15.5);
    camera.position.copy(defaultCamera);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 1.1, 0);
    controls.enableDamping = true;
    controls.dampingFactor = .07;
    controls.minDistance = 9;
    controls.maxDistance = 27;
    controls.minPolarAngle = .38;
    controls.maxPolarAngle = Math.PI * .48;
    controls.maxTargetRadius = 5;
    controls.update();
    resetCameraRef.current = () => {
      camera.position.copy(defaultCamera);
      controls.target.set(0, 1.1, 0);
      controls.update();
    };

    scene.add(new THREE.HemisphereLight(0xeaf7f0, 0x897661, 2.1));
    const sun = new THREE.DirectionalLight(0xfff4d8, 3.2);
    sun.position.set(-7, 14, 9);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -12;
    sun.shadow.camera.right = 12;
    sun.shadow.camera.top = 10;
    sun.shadow.camera.bottom = -10;
    scene.add(sun);
    const fill = new THREE.DirectionalLight(0xbadfd5, 1.1);
    fill.position.set(9, 7, -8);
    scene.add(fill);

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(18, 12), standardMaterial(0xcbbba4, .93));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);
    const grid = new THREE.GridHelper(18, 18, 0xa99b86, 0xbcae99);
    grid.scale.z = 12 / 18;
    grid.position.y = .005;
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = .2;
    scene.add(grid);
    box(scene, [18, 5.2, .2], [0, 2.6, -5.9], 0xe7f1eb, { receiveShadow: true });
    box(scene, [.2, 5.2, 12], [-8.9, 2.6, 0], 0xdcebe3, { receiveShadow: true });
    box(scene, [4.8, .05, 3.2], [5.55, .03, 3.55], 0xb9d5c8, { receiveShadow: true });

    const deskPositions: [number, number][] = [[-5.5, -3.6], [-1.85, -3.6], [1.85, -3.6], [5.5, -3.6], [-5.5, -.55], [-1.85, -.55], [1.85, -.55], [5.5, -.55]];
    deskPositions.forEach(([x, z], index) => addDesk(scene, x, z, Object.values(sceneColors)[index % Object.values(sceneColors).length]));
    addSofa(scene);
    addWaterCooler(scene);
    addMeetingArea(scene);
    addPlant(scene, -8.05, -4.75, 1.05);
    addPlant(scene, 8.05, -4.75, .95);

    const walkPoints = [
      new THREE.Vector3(-6.3, 0, 2.2), new THREE.Vector3(-3.2, 0, 4.5), new THREE.Vector3(0, 0, 2.05),
      new THREE.Vector3(3.4, 0, 4.6), new THREE.Vector3(6.55, 0, 2.25), new THREE.Vector3(2.9, 0, .7),
      new THREE.Vector3(-2.8, 0, .85), new THREE.Vector3(-6.35, 0, 4.45),
    ];
    const rigs: CharacterRig[] = [];
    activePeople.forEach((person, index) => {
      const character = createCharacter(person);
      const desk = deskPositions[index % deskPositions.length];
      let basePosition = new THREE.Vector3(desk[0], 0, desk[1] + .95);
      if (person.behavior === "walk") basePosition = walkPoints[(index * 2) % walkPoints.length].clone();
      if (person.behavior === "chat") basePosition = new THREE.Vector3(-6.3 + (index % 2) * .85, 0, 3.45);
      if (person.behavior === "nap") basePosition = new THREE.Vector3(5.5 + (index % 2) * .35, .72, 3.3);
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
  }, [peopleKey]);

  const toggleFullscreen = () => {
    const element = hostRef.current?.parentElement;
    if (!element) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void element.requestFullscreen();
  };

  return (
    <section className="office-3d-shell">
      <div className="office-3d-toolbar">
        <div><span className="office-3d-live"><i /> 3D LIVE</span><p><strong>People Pulse Office World</strong><small>ลากเพื่อหมุน · ล้อเมาส์หรือบีบนิ้วเพื่อซูม · คลิกตัวละครเพื่อดูงาน</small></p></div>
        <div>
          <button onClick={() => setMotionEnabled((enabled) => !enabled)}>{motionEnabled ? "Ⅱ หยุดการเคลื่อนไหว" : "▶ เล่นต่อ"}</button>
          <button onClick={() => resetCameraRef.current()}>⌂ มุมเริ่มต้น</button>
          <button onClick={toggleFullscreen}>⛶ เต็มจอ</button>
        </div>
      </div>
      <div ref={hostRef} className="office-3d-canvas">{error && <div className="office-3d-error"><span>!</span><strong>เปิดฉาก 3D ไม่สำเร็จ</strong><p>{error}</p></div>}</div>
      <div className="office-3d-footer"><span><i className="overloaded" />งานล้น: ทำงานเร็ว</span><span><i className="steady" />สมดุล: ทำงานชิล</span><span><i className="available" />ว่าง: เดิน คุย หรือพัก</span><small>สถานะมาจากทูดูลิส ไม่ใช่การติดตามหน้าจอจริง</small></div>
    </section>
  );
}
