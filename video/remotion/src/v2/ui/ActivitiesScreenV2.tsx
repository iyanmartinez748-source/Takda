import React from "react";
import { spring, useVideoConfig, interpolate } from "remotion";
import { colors } from "../../theme";
import { fontDisplay, fontBody } from "../../fonts";

const TASKS = [
  { title: "Research Paper", type: "Research", due: "Oct 12" },
  { title: "Math Assignment", type: "Assignment", due: "Oct 9" },
  { title: "Science Quiz", type: "Quiz", due: "Oct 10" },
  { title: "Group Presentation", type: "Presentation", due: "Oct 15" },
];

// Scene-relative frames for the "complete a task" demo, applied to
// TASKS[TAP_INDEX].
const TAP_INDEX = 1; // Math Assignment
const TAP_FRAME = 96;
const CHECK_FRAME = 106;
const TOAST_FRAME = 110;

function Checkbox({ done, poppedAt, frame, fps }: { done: boolean; poppedAt: number; frame: number; fps: number }) {
  const pop = frame >= poppedAt ? spring({ frame: frame - poppedAt, fps, config: { damping: 9, mass: 0.4 } }) : 0;
  return (
    <div
      style={{
        width: 22,
        height: 22,
        borderRadius: 999,
        flexShrink: 0,
        border: `2px solid ${done ? colors.success.dot : "#CBD5E1"}`,
        background: done ? colors.success.dot : "transparent",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        transform: done ? `scale(${0.85 + Math.min(1, pop) * 0.15})` : undefined,
      }}
    >
      {done && (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
          <path d="M5 13l4 4L19 7" stroke="white" strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </div>
  );
}

export function ActivitiesScreenV2({ frame, compact }: { frame: number; compact: boolean }) {
  const { fps } = useVideoConfig();

  const tapPulse =
    frame >= TAP_FRAME && frame < CHECK_FRAME
      ? spring({ frame: frame - TAP_FRAME, fps, config: { damping: 10, mass: 0.3 } })
      : 0;
  const tapFlash = interpolate(tapPulse, [0, 0.5, 1], [0, 1, 0], { extrapolateRight: "clamp" });

  const toastP = frame >= TOAST_FRAME ? spring({ frame: frame - TOAST_FRAME, fps, config: { damping: 14, mass: 0.5 } }) : 0;
  const toastOpacity = interpolate(frame, [TOAST_FRAME, TOAST_FRAME + 10, TOAST_FRAME + 55, TOAST_FRAME + 70], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const toastY = (1 - Math.max(0, Math.min(1, toastP))) * 10;

  return (
    <div style={{ position: "relative", height: "100%" }}>
      <h1 style={{ fontFamily: fontDisplay, fontWeight: 600, fontSize: compact ? 20 : 22, color: colors.ink, margin: "0 0 16px" }}>
        Activities
      </h1>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {TASKS.map((t, i) => {
          const delay = i * 7;
          const p = spring({ frame: frame - delay, fps, config: { damping: 16, mass: 0.6 } });
          const opacity = Math.max(0, Math.min(1, p));
          const x = (1 - p) * -18;
          const done = i === TAP_INDEX && frame >= CHECK_FRAME;
          const flash = i === TAP_INDEX ? tapFlash : 0;
          return (
            <div
              key={t.title}
              style={{
                opacity,
                transform: `translateX(${x}px)`,
                display: "flex",
                alignItems: "center",
                gap: 12,
                background: flash > 0 ? `rgba(238,236,252,${flash})` : colors.white,
                border: `1px solid ${colors.border}`,
                borderRadius: 14,
                padding: "12px 14px",
              }}
            >
              <Checkbox done={done} poppedAt={CHECK_FRAME} frame={frame} fps={fps} />
              <div style={{ flex: 1, minWidth: 0, fontFamily: fontBody }}>
                <div
                  style={{
                    fontSize: 13.5,
                    fontWeight: 600,
                    color: done ? colors.slate400 : colors.ink,
                    textDecoration: done ? "line-through" : "none",
                  }}
                >
                  {t.title}
                </div>
                <div style={{ fontSize: 11, color: colors.slate500, marginTop: 2 }}>
                  {t.type} · Due {t.due}
                </div>
              </div>
              {!done && (
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    color: colors.primary,
                    background: colors.primarySoft,
                    borderRadius: 999,
                    padding: "3px 8px",
                    fontFamily: fontBody,
                  }}
                >
                  Pending
                </span>
              )}
            </div>
          );
        })}
      </div>

      {frame >= TOAST_FRAME && (
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 6,
            opacity: toastOpacity,
            transform: `translateY(${toastY}px)`,
            display: "flex",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              background: colors.ink,
              color: colors.white,
              borderRadius: 999,
              padding: "8px 14px",
              fontFamily: fontBody,
              fontSize: 11.5,
              fontWeight: 600,
              boxShadow: "0 10px 24px rgba(15,23,42,0.25)",
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
              <path d="M5 13l4 4L19 7" stroke={colors.success.dot} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Nice! 1 task done.
          </div>
        </div>
      )}
    </div>
  );
}
