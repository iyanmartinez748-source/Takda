import React from "react";
import { spring, useVideoConfig, interpolate } from "remotion";
import { colors } from "../../theme";
import { fontDisplay, fontBody } from "../../fonts";

const SUBJECTS = [
  { name: "Calculus II", teacher: "Prof. Reyes", pending: 3, done: 5, color: colors.subjects[0] },
  { name: "Physics 101", teacher: "Dr. Santos", pending: 2, done: 7, color: colors.subjects[1] },
  { name: "World Literature", teacher: "Ms. Cruz", pending: 1, done: 4, color: colors.subjects[3] },
  { name: "Computer Science", teacher: "Mr. Dela Cruz", pending: 4, done: 6, color: colors.subjects[4] },
];

// Which card gets "tapped" open, and when (scene-relative frames).
const TAP_INDEX = 0;
const TAP_FRAME = 54;
const DRAWER_FRAME = 60;

const UPCOMING = [
  { title: "Problem Set 4", due: "Due Oct 12" },
  { title: "Midterm Review", due: "Due Oct 15" },
];

// Demonstrates Takda being *used* rather than just displayed: subject
// cards animate in, then one is "tapped" — it highlights and a detail
// drawer slides up from the bottom of the screen showing that subject's
// upcoming activities, the way selecting a subject in the real app surfaces
// its activity list.
export function SubjectsScreenV2({ frame, compact }: { frame: number; compact: boolean }) {
  const { fps } = useVideoConfig();

  const tapPulse = spring({ frame: frame - TAP_FRAME, fps, config: { damping: 9, mass: 0.35 } });
  const tapScale = frame >= TAP_FRAME ? 1 + Math.max(0, Math.sin(Math.min(tapPulse, 1) * Math.PI)) * 0.035 : 1;

  const drawerP = spring({ frame: frame - DRAWER_FRAME, fps, config: { damping: 17, mass: 0.7 } });
  const drawerY = interpolate(Math.max(0, Math.min(1, drawerP)), [0, 1], [100, 0]);
  const drawerOpacity = Math.max(0, Math.min(1, drawerP * 1.4));

  return (
    <div style={{ position: "relative", height: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <h1 style={{ fontFamily: fontDisplay, fontWeight: 600, fontSize: compact ? 20 : 22, color: colors.ink, margin: 0 }}>
          My Subjects
        </h1>
        <div
          style={{
            background: colors.primary,
            color: colors.white,
            fontSize: 11,
            fontWeight: 700,
            borderRadius: 8,
            padding: "7px 12px",
            fontFamily: fontBody,
          }}
        >
          + Add
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: compact ? "1fr" : "1fr 1fr", gap: 12 }}>
        {SUBJECTS.map((sub, i) => {
          const delay = i * 6;
          const p = spring({ frame: frame - delay, fps, config: { damping: 16, mass: 0.6 } });
          const opacity = Math.max(0, Math.min(1, p));
          const y = (1 - p) * 22;
          const tapped = i === TAP_INDEX && frame >= TAP_FRAME;
          return (
            <div
              key={sub.name}
              style={{
                opacity,
                transform: `translateY(${y}px) scale(${i === TAP_INDEX ? tapScale : 1})`,
                background: colors.white,
                border: `1.5px solid ${tapped ? colors.primary : colors.border}`,
                borderRadius: 14,
                padding: "14px 16px",
                boxShadow: tapped ? "0 10px 28px rgba(61,47,224,0.18)" : "0 1px 2px rgba(15,23,42,0.04)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <span style={{ width: 10, height: 10, borderRadius: 999, background: sub.color, flexShrink: 0 }} />
                <span style={{ fontFamily: fontDisplay, fontWeight: 600, fontSize: 15, color: colors.ink }}>
                  {sub.name}
                </span>
              </div>
              <div style={{ fontSize: 11, color: colors.slate500, marginBottom: 10, fontFamily: fontBody }}>
                {sub.teacher}
              </div>
              <div style={{ display: "flex", gap: 14, fontSize: 11, fontWeight: 700, fontFamily: fontBody }}>
                <span style={{ color: "#D97706" }}>{sub.pending} Pending</span>
                <span style={{ color: "#059669" }}>{sub.done} Completed</span>
              </div>
            </div>
          );
        })}
      </div>

      {frame >= DRAWER_FRAME && (
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            opacity: drawerOpacity,
            transform: `translateY(${drawerY}%)`,
            background: colors.white,
            borderTop: `1px solid ${colors.border}`,
            borderRadius: "16px 16px 0 0",
            padding: "14px 16px 16px",
            boxShadow: "0 -12px 32px rgba(15,23,42,0.12)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <span style={{ width: 8, height: 8, borderRadius: 999, background: colors.subjects[0] }} />
              <span style={{ fontFamily: fontDisplay, fontWeight: 600, fontSize: 14, color: colors.ink }}>
                Calculus II
              </span>
            </div>
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
              2 upcoming
            </span>
          </div>
          {UPCOMING.map((u) => (
            <div
              key={u.title}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "7px 0",
                borderTop: `1px solid ${colors.border}`,
                fontFamily: fontBody,
              }}
            >
              <span style={{ fontSize: 12, fontWeight: 600, color: colors.ink }}>{u.title}</span>
              <span style={{ fontSize: 11, color: colors.slate500 }}>{u.due}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
