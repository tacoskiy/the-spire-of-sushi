"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { HandLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";

type HandState = {
  lastPos: { x: number; y: number };
  lastAngle: number;
  velocity: { x: number; y: number };
  angularVelocity: number;
  lastPinchTime: number; 
  isPinching: boolean; 
  wasPinching: boolean; 
};

export default function HandPhysicsPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [currentHeightCm, setCurrentHeightCm] = useState(0);

  const worldRef = useRef<any>(null);
  const rapierRef = useRef<any>(null);
  const boxesRef = useRef<any[]>([]); 

  const grabbingHandIndexRef = useRef<number[]>([-1, -1]); 
  const grabOffsetRef = useRef<{ x: number; y: number }[]>([{ x: 0, y: 0 }, { x: 0, y: 0 }]);
  const grabRotationOffsetRef = useRef<number[]>([0, 0]);

  const handsRef = useRef<HandState[]>([
    { lastPos: { x: 0, y: 0 }, lastAngle: 0, velocity: { x: 0, y: 0 }, angularVelocity: 0, lastPinchTime: 0, isPinching: false, wasPinching: false },
    { lastPos: { x: 0, y: 0 }, lastAngle: 0, velocity: { x: 0, y: 0 }, angularVelocity: 0, lastPinchTime: 0, isPinching: false, wasPinching: false },
  ]);

  const lastFrameTimeRef = useRef<number>(performance.now());

  const MAX_SPEED = 10000;
  const ACCEL_SMOOTH = 0.35;
  const PINCH_THRESHOLD = 0.06;
  const GRACE_PERIOD = 1; 
  const BOUNDARY_MARGIN = 20;
  const GROUND_Y = 1040; 
  const PIXELS_TO_CM = 0.25; 

  const addButtonRef = useRef<HTMLButtonElement>(null);
  const [isAddButtonHovered, setIsAddButtonHovered] = useState(false);

  const addBox = useCallback(() => {
    if (!worldRef.current || !rapierRef.current || !canvasRef.current) return;
    const RAPIER = rapierRef.current;
    const world = worldRef.current;
    const canvas = canvasRef.current;

    const newBoxBody = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(canvas.width / 2 + (Math.random() - 0.5) * 100, 100)
        .setCanSleep(false)
        .setLinearDamping(1.5)
        .setAngularDamping(1.5)
        .setCcdEnabled(true)
    );
    world.createCollider(RAPIER.ColliderDesc.cuboid(50, 50).setDensity(5.0).setFriction(2.0).setRestitution(0.0), newBoxBody);
    newBoxBody.enableCcd(true);
    boxesRef.current.push(newBoxBody);
  }, []);

  useEffect(() => {
    let handLandmarker: HandLandmarker;
    let animationFrameId: number;

    const init = async () => {
      const RAPIER = await import("@dimforge/rapier2d-compat");
      await RAPIER.init();
      rapierRef.current = RAPIER;
      const world = new RAPIER.World({ x: 0.0, y: 9.81 * 350 });
      worldRef.current = world;

      const groundBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(990, 1060));
      world.createCollider(RAPIER.ColliderDesc.cuboid(1000, 20).setFriction(2.0).setRestitution(0.0), groundBody);

      const spawnPositions = [{ x: 800, y: 200 }, { x: 990, y: 200 }, { x: 1180, y: 200 }];
      boxesRef.current = spawnPositions.map((pos) => {
        const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(pos.x, pos.y).setCanSleep(false).setLinearDamping(1.5).setAngularDamping(1.5).setCcdEnabled(true));
        world.createCollider(RAPIER.ColliderDesc.cuboid(50, 50).setDensity(5.0).setFriction(2.0).setRestitution(0.0), body);
        body.enableCcd(true);
        return body;
      });

      const vision = await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm");
      handLandmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`, delegate: "GPU" },
        runningMode: "VIDEO", numHands: 2,
      });

      setIsLoaded(true);
      startLoop();
    };

    const startLoop = () => {
      const render = () => {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext("2d");
        if (!video || !canvas || !ctx || !worldRef.current) return;

        if (video.readyState >= 2) {
          const now = performance.now();
          const dt = Math.min((now - lastFrameTimeRef.current) / 1000, 0.033);
          lastFrameTimeRef.current = now;

          for (let i = 0; i < 4; i++) {
            worldRef.current.timestep = 1 / 60 / 4;
            worldRef.current.step();
          }

          try {
            const results = handLandmarker.detectForVideo(video, now);
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            // --- 非破壊的・改良版: 高さ判定ロジック ---
            const isAnyHandGrabbing = grabbingHandIndexRef.current.some(idx => idx !== -1);
            if (!isAnyHandGrabbing && boxesRef.current.length > 0) {
              const groundedIndices = new Set<number>();
              const boxPositions = boxesRef.current.map(b => b.translation());

              // 1. 地面付近の箱をマーク
              boxPositions.forEach((pos, idx) => {
                if (Math.abs(pos.y - (GROUND_Y - 50)) < 15) groundedIndices.add(idx);
              });

              // 2. 積み上げ伝播 (座標ベース)
              for (let i = 0; i < 10; i++) {
                let changed = false;
                boxPositions.forEach((posA, idxA) => {
                  if (groundedIndices.has(idxA)) return;
                  for (const idxB of Array.from(groundedIndices)) {
                    const posB = boxPositions[idxB];
                    if (Math.abs(posA.x - posB.x) < 105 && Math.abs(posA.y - posB.y) < 105) {
                      groundedIndices.add(idxA);
                      changed = true;
                      break;
                    }
                  }
                });
                if (!changed) break;
              }

              let highestY = GROUND_Y;
              groundedIndices.forEach(idx => {
                const y = boxPositions[idx].y - 50;
                if (y < highestY) highestY = y;
              });

              const newHeight = Math.round(Math.max(0, GROUND_Y - highestY) * PIXELS_TO_CM);
              setCurrentHeightCm(prev => (prev !== newHeight ? newHeight : prev));
            }

            // --- ハンドキャプチャ & インタラクション ---
            const addButtonRect = addButtonRef.current?.getBoundingClientRect();
            let buttonHoveredByHand = false; 

            if (results.landmarks) {
              results.landmarks.forEach((landmarks, hIdx) => {
                const state = handsRef.current[hIdx];
                const handX = (1 - landmarks[8].x) * canvas.width;
                const handY = landmarks[8].y * canvas.height;
                const dx = 1 - landmarks[5].x - (1 - landmarks[2].x); 
                const dy = landmarks[5].y - landmarks[2].y;
                const handAngle = Math.atan2(dy, dx);
                const isOutOfBounds = handX < BOUNDARY_MARGIN || handX > canvas.width - BOUNDARY_MARGIN || handY < BOUNDARY_MARGIN || handY > canvas.height - BOUNDARY_MARGIN;
                const pinchDist = Math.hypot(landmarks[4].x - landmarks[8].x, landmarks[4].y - landmarks[8].y); 

                state.isPinching = pinchDist < PINCH_THRESHOLD && !isOutOfBounds; 
                if (state.isPinching) state.lastPinchTime = now;

                if (dt > 0) {
                  state.velocity.x += ((handX - state.lastPos.x) / dt - state.velocity.x) * ACCEL_SMOOTH;
                  state.velocity.y += ((handY - state.lastPos.y) / dt - state.velocity.y) * ACCEL_SMOOTH;
                }
                state.lastPos = { x: handX, y: handY };
                state.lastAngle = handAngle;

                const pinchActive = now - state.lastPinchTime < GRACE_PERIOD && !isOutOfBounds;

                if (addButtonRect) {
                  const canvasRect = canvas.getBoundingClientRect();
                  if (handX + canvasRect.left > addButtonRect.left - 60 && handX + canvasRect.left < addButtonRect.right + 60 &&
                      handY + canvasRect.top > addButtonRect.top - 60 && handY + canvasRect.top < addButtonRect.bottom + 60) {
                    buttonHoveredByHand = true;
                    if (state.isPinching && !state.wasPinching) addBox();
                  }
                }

                if (pinchActive) {
                  if (grabbingHandIndexRef.current[hIdx] === -1) {
                    boxesRef.current.forEach((box, bIdx) => {
                      if (Math.hypot(handX - box.translation().x, handY - box.translation().y) < 100) {
                        grabbingHandIndexRef.current[hIdx] = bIdx;
                        grabOffsetRef.current[hIdx] = { x: box.translation().x - handX, y: box.translation().y - handY };
                        grabRotationOffsetRef.current[hIdx] = box.rotation() - handAngle;
                        box.setGravityScale(0.0, true);
                      }
                    });
                  }
                  const bIdx = grabbingHandIndexRef.current[hIdx];
                  if (bIdx !== -1) {
                    const box = boxesRef.current[bIdx];
                    box.setLinvel({ x: (handX + grabOffsetRef.current[hIdx].x - box.translation().x) * 25, y: (handY + grabOffsetRef.current[hIdx].y - box.translation().y) * 25 }, true);
                    box.setAngvel((handAngle + grabRotationOffsetRef.current[hIdx] - box.rotation()) * 25, true);
                  }
                } else if (grabbingHandIndexRef.current[hIdx] !== -1) {
                  const bIdx = grabbingHandIndexRef.current[hIdx];
                  boxesRef.current[bIdx].setGravityScale(1.0, true);
                  boxesRef.current[bIdx].setLinvel({ x: state.velocity.x, y: state.velocity.y }, true);
                  grabbingHandIndexRef.current[hIdx] = -1;
                }
                
                // 指の描画
                ctx.fillStyle = state.isPinching ? "#fbbf24" : hIdx === 0 ? "#10b981" : "#8b5cf6";
                landmarks.forEach(pt => {
                  ctx.beginPath(); ctx.arc((1 - pt.x) * canvas.width, pt.y * canvas.height, 4, 0, Math.PI * 2); ctx.fill();
                });
                state.wasPinching = state.isPinching; 
              });
            }

            setIsAddButtonHovered(buttonHoveredByHand);

            // ボックス描画
            boxesRef.current.forEach((box, bIdx) => {
              const pos = box.translation();
              ctx.save();
              ctx.translate(pos.x, pos.y);
              ctx.rotate(box.rotation());
              ctx.fillStyle = grabbingHandIndexRef.current.includes(bIdx) ? "#fbbf24" : "#475569";
              ctx.fillRect(-50, -50, 100, 100);
              ctx.restore();
            });

            ctx.fillStyle = "#1e293b";
            ctx.fillRect(0, 1040, 1980, 40);
          } catch (e) { console.error(e); }
        }
        animationFrameId = requestAnimationFrame(render);
      };
      render();
    };

    navigator.mediaDevices.getUserMedia({ video: { width: 800, height: 600 } }).then((stream) => {
      if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.play(); }
      init();
    });
    return () => cancelAnimationFrame(animationFrameId);
  }, [addBox]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-slate-950">
      <div style={{ width: "100%", height: "100vh", position: "relative" }}>
        <div style={{
          position: "absolute", top: "48px", left: "48px", padding: "16px 24px",
          background: "rgba(15, 23, 42, 0.8)", borderRadius: "12px", border: "2px solid #3b82f6",
          color: "white", zIndex: 30, textAlign: "center", minWidth: "120px"
        }}>
          <div style={{ fontSize: "12px", color: "#94a3b8" }}>STACK HEIGHT</div>
          <div style={{ fontSize: "32px", fontWeight: "bold" }}>
            {currentHeightCm}<span style={{ fontSize: "16px", marginLeft: "4px" }}>cm</span>
          </div>
        </div>

        <video ref={videoRef} style={{ width: "400px", height: "300px", position: "absolute", top: "48px", right: "48px", borderRadius: "12px", background: "#000", zIndex: 20 }} muted playsInline />
        <canvas ref={canvasRef} width={1980} height={1080} style={{ width: "100%", height: "100vh" }} />
        <button
          ref={addButtonRef}
          onClick={addBox}
          style={{
            position: "absolute", top: "160px", left: "48px", padding: "16px 32px", fontSize: "24px", fontWeight: "bold",
            color: "white", backgroundColor: isAddButtonHovered ? "#1d4ed8" : "#2563eb", borderRadius: "12px", border: "none", cursor: "pointer",
            transition: "all 0.1s", transform: isAddButtonHovered ? "scale(1.05)" : "scale(1)", zIndex: 20,
          }}
        >
          Add Box!
        </button>
      </div>
    </div>
  );
}