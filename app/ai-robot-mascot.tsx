"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";

type RobotMode = "idle" | "walk" | "wave" | "glitch" | "stumble";
type RobotPosition = { x: number; y: number };

const robotWidth = 104;
const robotHeight = 132;

function intersects(a: DOMRect | { left: number; right: number; top: number; bottom: number }, b: DOMRect | { left: number; right: number; top: number; bottom: number }) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

function visibleControlRects(robotRoot: HTMLElement | null) {
  const selectors = "button,a[href],input,select,textarea,[role='dialog'],.top-right-utilities,.toast.show,.notification-layer,.top-profile-menu";
  return [...document.querySelectorAll<HTMLElement>(selectors)]
    .filter((element) => !robotRoot?.contains(element) && element.getClientRects().length > 0)
    .map((element) => {
      const rect = element.getBoundingClientRect();
      return { left: rect.left - 12, right: rect.right + 12, top: rect.top - 12, bottom: rect.bottom + 12 };
    });
}

function safeEdgeTarget(current: RobotPosition, robotRoot: HTMLElement | null): RobotPosition | null {
  const compact = window.innerWidth <= 760;
  const safeBottom = compact ? 92 : 18;
  const minX = compact ? 12 : window.innerWidth > 1180 ? 432 : 18;
  const maxX = Math.max(minX, window.innerWidth - robotWidth - 18);
  const desiredMinY = compact ? 118 : 92;
  const maxY = Math.max(8, window.innerHeight - robotHeight - safeBottom);
  const minY = Math.min(desiredMinY, maxY);

  const middleX = Math.round((minX + maxX) / 2);
  const middleY = Math.round((minY + maxY) / 2);
  const candidates: RobotPosition[] = (compact
    ? [{ x: minX, y: maxY }, { x: maxX, y: maxY }, { x: minX, y: middleY }, { x: maxX, y: middleY }]
    : [
      { x: minX, y: minY }, { x: middleX, y: minY }, { x: maxX, y: minY },
      { x: maxX, y: middleY }, { x: maxX, y: maxY }, { x: middleX, y: maxY },
      { x: minX, y: maxY }, { x: minX, y: middleY },
    ].sort(() => Math.random() - .5));
  const controls = visibleControlRects(robotRoot);
  const robotRectAt = (position: RobotPosition) => ({ left: position.x, right: position.x + robotWidth, top: position.y, bottom: position.y + robotHeight });
  const positionIsSafe = (position: RobotPosition) => controls.every((control) => !intersects(robotRectAt(position), control));

  const safeCandidate = candidates.find((candidate) => {
    if (compact) return positionIsSafe(candidate);
    const distance = Math.hypot(candidate.x - current.x, candidate.y - current.y);
    const sampleCount = Math.max(2, Math.ceil(distance / 38));
    const samples = Array.from({ length: sampleCount }, (_, index) => {
      const progress = (index + 1) / sampleCount;
      return { x: current.x + (candidate.x - current.x) * progress, y: current.y + (candidate.y - current.y) * progress };
    });
    return samples.every(positionIsSafe);
  });
  if (safeCandidate) return safeCandidate;
  return positionIsSafe(current) ? current : null;
}

export default function AiRobotMascot({ open, suspended, onOpen, onHide }: { open: boolean; suspended: boolean; onOpen: () => void; onHide: () => void }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const positionRef = useRef<RobotPosition>({ x: 18, y: 118 });
  const pausedRef = useRef(false);
  const [position, setPosition] = useState<RobotPosition>({ x: 18, y: 118 });
  const [ready, setReady] = useState(false);
  const [facing, setFacing] = useState<"left" | "right">("left");
  const [bubbleSide, setBubbleSide] = useState<"left" | "right">("left");
  const [mode, setMode] = useState<RobotMode>("idle");
  const [travelMs, setTravelMs] = useState(5200);

  useEffect(() => {
    if (open || suspended) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let movementTimer = 0;
    let poseTimer = 0;
    let resizeTimer = 0;
    let cancelled = false;

    const placeRobot = () => {
      if (cancelled) return;
      const next = safeEdgeTarget(positionRef.current, rootRef.current);
      if (!next) {
        window.clearTimeout(poseTimer);
        setReady(false);
        setMode("idle");
        return;
      }
      window.clearTimeout(poseTimer);
      setTravelMs(0);
      setMode("idle");
      positionRef.current = next;
      setPosition(next);
      setBubbleSide(next.x > window.innerWidth / 2 ? "left" : "right");
      setReady(true);
    };

    const scheduleMove = (delay = 5600) => {
      window.clearTimeout(movementTimer);
      movementTimer = window.setTimeout(moveRobot, delay);
    };

    const moveRobot = () => {
      if (cancelled || reducedMotion.matches || window.innerWidth <= 760 || document.hidden) return;
      const anotherOverlayOpen = Boolean(document.querySelector("[role='dialog'],.notification-layer,.top-profile-menu,.modal-backdrop"));
      if (pausedRef.current || anotherOverlayOpen) {
        scheduleMove(2200);
        return;
      }
      const current = positionRef.current;
      const next = safeEdgeTarget(current, rootRef.current);
      if (!next) {
        setReady(false);
        setMode("idle");
        scheduleMove(2800);
        return;
      }
      setReady(true);
      if (next.x === current.x && next.y === current.y) {
        setMode("wave");
        scheduleMove(2800);
        return;
      }
      const duration = 4300 + Math.round(Math.random() * 2300);
      setTravelMs(duration);
      setFacing(next.x >= current.x ? "right" : "left");
      setMode(Math.random() > .84 ? "stumble" : "walk");
      positionRef.current = next;
      setPosition(next);
      setBubbleSide(next.x > window.innerWidth / 2 ? "left" : "right");
      window.clearTimeout(poseTimer);
      poseTimer = window.setTimeout(() => setMode(Math.random() > .7 ? "glitch" : "wave"), duration);
      scheduleMove(duration + 2600);
    };

    const onResize = () => {
      window.clearTimeout(resizeTimer);
      if (document.hidden) {
        window.clearTimeout(movementTimer);
        return;
      }
      resizeTimer = window.setTimeout(() => {
        placeRobot();
        if (!reducedMotion.matches && window.innerWidth > 760) scheduleMove(2500);
      }, 180);
    };

    const initialTimer = window.setTimeout(() => {
      placeRobot();
      if (!reducedMotion.matches && window.innerWidth > 760) scheduleMove(2600);
    }, 0);
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onResize, { passive: true });
    document.addEventListener("visibilitychange", onResize);
    return () => {
      cancelled = true;
      window.clearTimeout(initialTimer);
      window.clearTimeout(movementTimer);
      window.clearTimeout(poseTimer);
      window.clearTimeout(resizeTimer);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onResize);
      document.removeEventListener("visibilitychange", onResize);
    };
  }, [open, suspended]);

  const robotStyle = {
    "--robot-x": `${position.x}px`,
    "--robot-y": `${position.y}px`,
    "--robot-travel": `${travelMs}ms`,
  } as CSSProperties;

  return (
    <div
      ref={rootRef}
      className={`ai-robot-mascot ${ready ? "ready" : ""}`}
      data-facing={facing}
      data-bubble-side={bubbleSide}
      data-mode={mode}
      style={robotStyle}
      hidden={open || suspended}
      onPointerEnter={() => { pausedRef.current = true; setMode("wave"); }}
      onPointerLeave={() => { pausedRef.current = false; setMode("idle"); }}
    >
      <span className="ai-robot-speech" aria-hidden="true">สงสัยถามกูได้นะไอ้สัส</span>
      <span id="people-ai-robot-description" className="sr-only">หุ่นยนต์ผู้ช่วย AI กดเพื่อถามเรื่องงาน KPI และการใช้งานระบบ</span>
      <button type="button" className="ai-robot-hide" onClick={onHide} aria-label="ซ่อนหุ่น AI ผู้ช่วย" title="ซ่อนหุ่น AI">×</button>
      <button
        type="button"
        className="ai-robot-launcher"
        onClick={onOpen}
        onFocus={() => { pausedRef.current = true; setMode("wave"); }}
        onBlur={() => { pausedRef.current = false; setMode("idle"); }}
        aria-label="เปิดผู้ช่วย AI"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls="people-ai-panel"
        aria-describedby="people-ai-robot-description"
      >
        <span className="ai-robot-scene" aria-hidden="true">
          <span className="ai-robot-floor-shadow" />
          <span className="ai-robot-model">
            <span className="ai-robot-antenna"><i /></span>
            <span className="ai-robot-ear left" /><span className="ai-robot-ear right" />
            <span className="ai-robot-head">
              <span className="ai-robot-face"><i className="eye left" /><i className="eye right" /><i className="mouth" /></span>
              <i className="ai-robot-dent" />
            </span>
            <span className="ai-robot-arm left"><i /></span><span className="ai-robot-arm right"><i /></span>
            <span className="ai-robot-body"><i className="panel" /><i className="tape" /><i className="loose-wire" /></span>
            <span className="ai-robot-leg left"><i /></span><span className="ai-robot-leg right"><i /></span>
            <span className="ai-robot-spark one">✦</span><span className="ai-robot-spark two">✧</span>
          </span>
        </span>
      </button>
    </div>
  );
}
