import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { GradientBackground } from "../../components/GradientBackground";
import { fontDisplay, fontBody } from "../../fonts";
import type { Orientation } from "../../types";

const DONE_TASKS = ["Math Assignment", "Reading Activity", "Science Quiz"];

// Checkpoints the ring sweeps through on its way to 82%, per the brief:
// 0 -> 25 -> 48 -> 67 -> 82. interpolate() between them reads as one
// continuous fill that visibly "counts" through each milestone rather
// than a flat linear ramp. Finishes by frame 68 (not later) so the "82%
// On Track" badge below has real hold time before this scene's own
// crossfade-out starts at frame 104 (scene duration 120, minus the
// 16-frame transition window) — it used to land at frame 100 and barely
// render before fading with the scene.
const CHECKPOINT_FRAMES = [4, 18, 34, 50, 68];
const CHECKPOINT_VALUES = [0, 25, 48, 67, 82];
const BADGE_FRAME = 76;

function FloatingCheck({ frame, x, y, size, phase, speed }: { frame: number; x: number; y: number; size: number; phase: number; speed: number }) {
  const t = frame * speed + phase;
  const dy = Math.sin(t) * 10;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      style={{ position: "absolute", left: `${x}%`, top: `${y}%`, transform: `translate(-50%, calc(-50% + ${dy}px))`, opacity: 0.14 }}
    >
      <path d="M5 13l4 4L19 7" stroke="#FFFFFF" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ProgressRing({ frame, size }: { frame: number; size: number }) {
  const pct = interpolate(frame, CHECKPOINT_FRAMES, CHECKPOINT_VALUES, {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const stroke = size * 0.075;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const displayPct = Math.round(pct);

  return (
    <div style={{ position: "relative", width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,0.22)" strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="#FFFFFF"
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct / 100)}
        />
      </svg>
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: fontDisplay,
          color: "#FFFFFF",
        }}
      >
        <span style={{ fontSize: size * 0.26, fontWeight: 700, lineHeight: 1 }}>{displayPct}%</span>
        <span style={{ fontSize: size * 0.065, fontFamily: fontBody, fontWeight: 600, opacity: 0.85, marginTop: 6 }}>
          on track
        </span>
      </div>
    </div>
  );
}

// SFX cue: rising chime starts at scene start, resolves as 82% lands (timeline.ts).
export function Scene6Progress({ orientation }: { orientation: Orientation }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const vertical = orientation === "vertical";

  const headP = spring({ frame: frame - 4, fps, config: { damping: 14, mass: 0.6 } });
  const headOpacity = Math.max(0, Math.min(1, headP));

  const badgeP = spring({ frame: frame - BADGE_FRAME, fps, config: { damping: 12, mass: 0.5 } });
  const badgeOpacity = Math.max(0, Math.min(1, badgeP));
  const badgeScale = 0.8 + Math.max(0, Math.min(1, badgeP)) * 0.2;

  return (
    <AbsoluteFill>
      <GradientBackground variant="punch" />
      <FloatingCheck frame={frame} x={12} y={20} size={30} phase={0} speed={0.02} />
      <FloatingCheck frame={frame} x={88} y={26} size={22} phase={1.2} speed={0.017} />
      <FloatingCheck frame={frame} x={16} y={80} size={24} phase={2.1} speed={0.019} />
      <FloatingCheck frame={frame} x={86} y={78} size={30} phase={0.6} speed={0.015} />

      <AbsoluteFill style={{ flexDirection: "column", alignItems: "center", justifyContent: "center", gap: vertical ? 22 : 18 }}>
        <div style={{ textAlign: "center", opacity: headOpacity }}>
          <div style={{ fontFamily: fontDisplay, fontWeight: 600, fontSize: vertical ? 44 : 42, color: "#FFFFFF", lineHeight: 1.1 }}>
            Less stress.
          </div>
          <div style={{ fontFamily: fontDisplay, fontWeight: 600, fontSize: vertical ? 44 : 42, color: "#E8CF9A", lineHeight: 1.1 }}>
            More progress.
          </div>
        </div>

        <ProgressRing frame={frame} size={vertical ? 280 : 230} />

        <div style={{ display: "flex", flexDirection: vertical ? "column" : "row", gap: 10, alignItems: "center" }}>
          {DONE_TASKS.map((t, i) => {
            const p = spring({ frame: frame - (30 + i * 8), fps, config: { damping: 16, mass: 0.5 } });
            const opacity = Math.max(0, Math.min(1, p));
            const y = (1 - Math.max(0, p)) * 10;
            return (
              <div
                key={t}
                style={{
                  opacity,
                  transform: `translateY(${y}px)`,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  background: "rgba(255,255,255,0.14)",
                  border: "1px solid rgba(255,255,255,0.3)",
                  borderRadius: 999,
                  padding: "8px 14px",
                  fontFamily: fontBody,
                }}
              >
                <div style={{ width: 16, height: 16, borderRadius: 999, background: "#FFFFFF", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none">
                    <path d="M5 13l4 4L19 7" stroke="#3D2FE0" strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <span style={{ color: "#FFFFFF", fontSize: 12.5, fontWeight: 600 }}>{t}</span>
              </div>
            );
          })}
        </div>

        {frame >= BADGE_FRAME && (
          <div
            style={{
              opacity: badgeOpacity,
              transform: `scale(${badgeScale})`,
              background: "#FFFFFF",
              color: "#3D2FE0",
              fontFamily: fontDisplay,
              fontWeight: 700,
              fontSize: 16,
              borderRadius: 999,
              padding: "9px 20px",
              boxShadow: "0 10px 28px rgba(0,0,0,0.25)",
            }}
          >
            82% On Track
          </div>
        )}
      </AbsoluteFill>
    </AbsoluteFill>
  );
}
