import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { GradientBackground } from "../components/GradientBackground";
import { fontDisplay, fontBody } from "../fonts";
import type { Orientation } from "../types";

const DONE_TASKS = ["Research Paper", "Math Assignment", "Science Quiz"];

// SFX cue: progress ring fill — rising chime (timeline.ts audioCues).
function ProgressRing({ frame, fps, size }: { frame: number; fps: number; size: number }) {
  const fillP = spring({ frame: frame - 6, fps, config: { damping: 18, mass: 1 } });
  const pct = Math.max(0, Math.min(1, fillP)) * 0.82; // settles at 82%
  const stroke = size * 0.07;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const displayPct = Math.round(pct * 100);

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
          strokeDashoffset={c * (1 - pct)}
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
        <span style={{ fontSize: size * 0.24, fontWeight: 700, lineHeight: 1 }}>{displayPct}%</span>
        <span style={{ fontSize: size * 0.06, fontFamily: fontBody, fontWeight: 600, opacity: 0.85, marginTop: 6 }}>
          on track
        </span>
      </div>
    </div>
  );
}

export function Scene6Progress({ orientation }: { orientation: Orientation }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const vertical = orientation === "vertical";

  const line1P = spring({ frame: frame - 40, fps, config: { damping: 14, mass: 0.6 } });
  const line1Opacity = Math.max(0, Math.min(1, line1P));
  const line2P = spring({ frame: frame - 52, fps, config: { damping: 14, mass: 0.6 } });
  const line2Opacity = Math.max(0, Math.min(1, line2P));

  return (
    <AbsoluteFill>
      <GradientBackground variant="punch" />
      <AbsoluteFill
        style={{
          flexDirection: vertical ? "column" : "row",
          alignItems: "center",
          justifyContent: "center",
          gap: vertical ? 46 : 90,
        }}
      >
        <ProgressRing frame={frame} fps={fps} size={vertical ? 260 : 240} />

        <div style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: vertical ? "center" : "flex-start" }}>
          {DONE_TASKS.map((t, i) => {
            const p = spring({ frame: frame - (10 + i * 8), fps, config: { damping: 16, mass: 0.5 } });
            const opacity = Math.max(0, Math.min(1, p));
            const x = (1 - Math.max(0, p)) * (vertical ? 0 : -20);
            const yy = (1 - Math.max(0, p)) * (vertical ? 12 : 0);
            return (
              <div
                key={t}
                style={{
                  opacity,
                  transform: `translate(${x}px, ${yy}px)`,
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  background: "rgba(255,255,255,0.14)",
                  border: "1px solid rgba(255,255,255,0.3)",
                  borderRadius: 999,
                  padding: "9px 16px",
                  fontFamily: fontBody,
                }}
              >
                <div
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: 999,
                    background: "#FFFFFF",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
                    <path d="M5 13l4 4L19 7" stroke="#3D2FE0" strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <span style={{ color: "#FFFFFF", fontSize: 14, fontWeight: 600 }}>{t}</span>
              </div>
            );
          })}

          <div style={{ marginTop: 14, textAlign: vertical ? "center" : "left" }}>
            <div
              style={{
                opacity: line1Opacity,
                fontFamily: fontDisplay,
                fontWeight: 600,
                fontSize: vertical ? 36 : 40,
                color: "#FFFFFF",
              }}
            >
              Less stress.
            </div>
            <div
              style={{
                opacity: line2Opacity,
                fontFamily: fontDisplay,
                fontWeight: 600,
                fontSize: vertical ? 36 : 40,
                color: "#E8CF9A",
              }}
            >
              More progress.
            </div>
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}
