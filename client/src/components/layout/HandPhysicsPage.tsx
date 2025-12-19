"use client";

import React, { useEffect, useRef, useState } from "react";
import { HandLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";

type HandState = {
  lastPos: { x: number; y: number };
  lastAngle: number;
  velocity: { x: number; y: number };
  angularVelocity: number;
  lastPinchTime: number; // ピンチが最後に検知された時間
};

export default function HandPhysicsPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  const worldRef = useRef<any>(null);
  const boxRef = useRef<any>(null);
  const rapierRef = useRef<any>(null);

  const grabbingHandIndexRef = useRef<number>(-1);
  const grabOffsetRef = useRef({ x: 0, y: 0 });
  const grabRotationOffsetRef = useRef(0);

  const handsRef = useRef<HandState[]>([
    {
      lastPos: { x: 0, y: 0 },
      lastAngle: 0,
      velocity: { x: 0, y: 0 },
      angularVelocity: 0,
      lastPinchTime: 0,
    },
    {
      lastPos: { x: 0, y: 0 },
      lastAngle: 0,
      velocity: { x: 0, y: 0 },
      angularVelocity: 0,
      lastPinchTime: 0,
    },
  ]);

  const lastFrameTimeRef = useRef<number>(0);

  // --- 物理・制御パラメータ ---
  const MAX_SPEED = 2200;
  const ACCEL_SMOOTH = 0.35;
  const PINCH_THRESHOLD = 0.06;
  const GRACE_PERIOD = 1;
  const BOUNDARY_MARGIN = 20;

  useEffect(() => {
    let handLandmarker: HandLandmarker;
    let animationFrameId: number;

    const init = async () => {
      const RAPIER = await import("@dimforge/rapier2d-compat");
      await RAPIER.init();
      rapierRef.current = RAPIER;

      const world = new RAPIER.World({ x: 0.0, y: 9.81 * 350 });
      const params = world.integrationParameters as any;
      params.numSolverIterations = 12;
      worldRef.current = world;

      const groundBody = world.createRigidBody(
        RAPIER.RigidBodyDesc.fixed().setTranslation(400, 580)
      );
      world.createCollider(
        RAPIER.ColliderDesc.cuboid(400, 20)
          .setFriction(1.0)
          .setRestitution(0.1),
        groundBody
      );

      const boxBody = world.createRigidBody(
        RAPIER.RigidBodyDesc.dynamic()
          .setTranslation(400, 200)
          .setCanSleep(false)
          .setLinearDamping(1.8)
          .setAngularDamping(1.8)
          .setCcdEnabled(true)
      );

      world.createCollider(
        RAPIER.ColliderDesc.cuboid(40, 40).setDensity(5.0).setFriction(1.0),
        boxBody
      );
      boxRef.current = boxBody;

      const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm"
      );
      handLandmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`,
          delegate: "GPU",
        },
        runningMode: "VIDEO",
        numHands: 2,
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

          const subSteps = 4;
          for (let i = 0; i < subSteps; i++) {
            worldRef.current.timestep = 1 / 60 / subSteps;
            worldRef.current.step();
          }

          try {
            const results = handLandmarker.detectForVideo(video, now);
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            const boxPos = boxRef.current.translation();
            const boxRot = boxRef.current.rotation();

            if (results.landmarks) {
              results.landmarks.forEach((landmarks, index) => {
                const state = handsRef.current[index];
                if (!state) return;

                const handX = (1 - landmarks[8].x) * canvas.width;
                const handY = landmarks[8].y * canvas.height;
                const dx = 1 - landmarks[5].x - (1 - landmarks[2].x);
                const dy = landmarks[5].y - landmarks[2].y;
                const handAngle = Math.atan2(dy, dx);

                const isOutOfBounds =
                  handX < BOUNDARY_MARGIN ||
                  handX > canvas.width - BOUNDARY_MARGIN ||
                  handY < BOUNDARY_MARGIN ||
                  handY > canvas.height - BOUNDARY_MARGIN;

                const dist = Math.hypot(
                  landmarks[4].x - landmarks[8].x,
                  landmarks[4].y - landmarks[8].y
                );
                const isPinchingNow = dist < PINCH_THRESHOLD && !isOutOfBounds;

                const pos = boxRef.current.translation();
                const PADDING = 100; // 画面端からどの程度外れたら戻すか

                if (
                  pos.x < -PADDING ||
                  pos.x > canvas.width + PADDING ||
                  pos.y < -PADDING ||
                  pos.y > canvas.height + PADDING
                ) {
                  // 1. 位置を中央（上部）に戻す
                  boxRef.current.setTranslation({ x: 400, y: 200 }, true);

                  // 2. 勢いを殺す（これ重要！）
                  boxRef.current.setLinvel({ x: 0, y: 0 }, true);
                  boxRef.current.setAngvel(0, true);

                  // 3. 重力を元に戻す
                  boxRef.current.setGravityScale(1.0, true);

                  // 4. もし掴んでいたら強制解除
                  grabbingHandIndexRef.current = -1;

                  console.log("Box Reset!");
                }

                // ピンチを検知している間、タイマーを更新
                if (isPinchingNow) {
                  state.lastPinchTime = now;
                }

                if (dt > 0) {
                  state.velocity.x +=
                    ((handX - state.lastPos.x) / dt - state.velocity.x) *
                    ACCEL_SMOOTH;
                  state.velocity.y +=
                    ((handY - state.lastPos.y) / dt - state.velocity.y) *
                    ACCEL_SMOOTH;
                  state.angularVelocity +=
                    ((handAngle - state.lastAngle) / dt -
                      state.angularVelocity) *
                    ACCEL_SMOOTH;
                }
                state.lastPos = { x: handX, y: handY };
                state.lastAngle = handAngle;

                // ★ Grace Period判定: 今ピンチしているか、離してから一定時間以内か
                const isWithinGrace = now - state.lastPinchTime < GRACE_PERIOD;
                const pinchActive = isWithinGrace && !isOutOfBounds;

                if (pinchActive) {
                  // 新規掴み
                  if (grabbingHandIndexRef.current === -1) {
                    const dToBox = Math.hypot(
                      handX - boxPos.x,
                      handY - boxPos.y
                    );
                    if (dToBox < 100) {
                      grabbingHandIndexRef.current = index;
                      grabOffsetRef.current = {
                        x: boxPos.x - handX,
                        y: boxPos.y - handY,
                      };
                      grabRotationOffsetRef.current = boxRot - handAngle;
                      boxRef.current.setGravityScale(0.0, true);
                    }
                  }

                  // 掴み継続中
                  if (grabbingHandIndexRef.current === index) {
                    const targetX = handX + grabOffsetRef.current.x;
                    const targetY = handY + grabOffsetRef.current.y;
                    const targetAngle =
                      handAngle + grabRotationOffsetRef.current;

                    const springK = 35;
                    const damping = 0.85;

                    boxRef.current.setLinvel(
                      {
                        x: (targetX - boxPos.x) * springK * damping,
                        y: (targetY - boxPos.y) * springK * damping,
                      },
                      true
                    );
                    boxRef.current.setAngvel(
                      (targetAngle - boxRot) * springK * damping,
                      true
                    );
                  }
                } else if (grabbingHandIndexRef.current === index) {
                  // リリース処理
                  boxRef.current.setGravityScale(1.0, true);
                  let vx = state.velocity.x;
                  let vy = state.velocity.y;
                  const speed = Math.hypot(vx, vy);
                  if (speed > MAX_SPEED) {
                    vx *= MAX_SPEED / speed;
                    vy *= MAX_SPEED / speed;
                  }
                  boxRef.current.setLinvel({ x: vx, y: vy }, true);
                  boxRef.current.setAngvel(state.angularVelocity, true);
                  grabbingHandIndexRef.current = -1;
                }

                // 手の描画
                ctx.fillStyle = isPinchingNow
                  ? "#fbbf24"
                  : index === 0
                  ? "#10b981"
                  : "#8b5cf6";
                landmarks.forEach((pt) => {
                  ctx.beginPath();
                  ctx.arc(
                    (1 - pt.x) * canvas.width,
                    pt.y * canvas.height,
                    4,
                    0,
                    Math.PI * 2
                  );
                  ctx.fill();
                });
              });
            }

            const finalBoxPos = boxRef.current.translation();
            const finalBoxRot = boxRef.current.rotation();
            const isHeld = grabbingHandIndexRef.current !== -1;

            ctx.save();
            ctx.translate(finalBoxPos.x, finalBoxPos.y);
            ctx.rotate(finalBoxRot);
            ctx.fillStyle = isHeld ? "#fbbf24" : "#475569";
            ctx.shadowBlur = isHeld ? 30 : 0;
            ctx.shadowColor = "#fbbf24";
            ctx.fillRect(-40, -40, 80, 80);
            ctx.restore();

            // 地面
            ctx.fillStyle = "#1e293b";
            ctx.fillRect(0, 560, 800, 40);
          } catch (e) {
            console.error(e);
          }
        }
        animationFrameId = requestAnimationFrame(render);
      };
      render();
    };

    navigator.mediaDevices
      .getUserMedia({ video: { width: 800, height: 600 } })
      .then((stream) => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
        }
        init();
      });
    return () => cancelAnimationFrame(animationFrameId);
  }, []);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-slate-950">
      <div style={{ width: "100%", height: "100vh", position: "relative" }}>
        <video
          ref={videoRef}
          style={{
            width: "400px",
            height: "300px",
            position: "absolute",
            top: "48px",
            right: "48px",
            borderRadius: "12px",
            background: "#000000",
          }}
          muted
          playsInline
        />
        <canvas
          ref={canvasRef}
          width={1980}
          height={1080}
          style={{ width: "100%", height: "100vh" }}
        />
      </div>
      <div style={{ position: "fixed", top: "48px", left: "48px" }}>
        Grace Period: {GRACE_PERIOD}ms Active
      </div>
    </div>
  );
}
