import React from "react";
import { spring, useVideoConfig, interpolate } from "remotion";
import { colors } from "../../theme";
import { fontDisplay, fontBody } from "../../fonts";

// Matches the brief's example task list exactly. `checkAt` is the local
// (scene-relative) frame at which that task's checkbox ticks on — null
// means it stays pending for the whole scene.
const TASKS = [
  { title: "Research Paper", type: "Research", due: "Oct 12", checkAt: null as number | null },
  { title: "Math Assignment", type: "Assignment", due: "Oct 9", checkAt: 70 },
  { title: "Science Quiz", type: "Quiz", due: "Oct 10", checkAt: null },
  { title: "Group Presentation", type: "Presentation", due: "Oct 15", checkAt: 100 },
];

function Checkbox({ done, poppedAt, frame, fps }: { done: boolean; poppedAt: number | null; frame: number; fps: number }) {
  let scale = 1;
  if (poppedAt !== null && frame >= poppedAt) {
    scale = spring({ frame: frame - poppedAt, fps, config: { damping: 9, mass: 0.4 } });
  }
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
        transform: done ? `scale(${0.85 + scale * 0.15})` : undefined,
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

export function ActivitiesScreen({ frame, compact }: { frame: number; compact: boolean }) {
  const { fps } = useVideoConfig();
  return (
    <div>
      <h1
        style={{
          fontFamily: fontDisplay,
          fontWeight: 600,
          fontSize: compact ? 20 : 22,
          color: colors.ink,
          margin: "0 0 16px",
        }}
      >
        Activities
      </h1>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {TASKS.map((t, i) => {
          const delay = i * 6;
          const p = spring({ frame: frame - delay, fps, config: { damping: 16, mass: 0.6 } });
          const opacity = Math.max(0, Math.min(1, p));
          const x = (1 - p) * -18;
          const done = t.checkAt !== null && frame >= t.checkAt;
          return (
            <div
              key={t.title}
              style={{
                opacity,
                transform: `translateX(${x}px)`,
                display: "flex",
                alignItems: "center",
                gap: 12,
                background: colors.white,
                border: `1px solid ${colors.border}`,
                borderRadius: 14,
                padding: "12px 14px",
              }}
            >
              <Checkbox done={done} poppedAt={t.checkAt} frame={frame} fps={fps} />
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
    </div>
  );
}
