import React from "react";
import { spring, useVideoConfig } from "remotion";
import { colors } from "../../theme";
import { fontDisplay, fontBody } from "../../fonts";

const SUBJECTS = [
  { name: "Calculus II", teacher: "Prof. Reyes", pending: 3, done: 5, color: colors.subjects[0] },
  { name: "Physics 101", teacher: "Dr. Santos", pending: 2, done: 7, color: colors.subjects[1] },
  { name: "World Literature", teacher: "Ms. Cruz", pending: 1, done: 4, color: colors.subjects[3] },
  { name: "Computer Science", teacher: "Mr. Dela Cruz", pending: 4, done: 6, color: colors.subjects[4] },
];

export function SubjectsScreen({ frame, compact }: { frame: number; compact: boolean }) {
  const { fps } = useVideoConfig();
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <h1
          style={{
            fontFamily: fontDisplay,
            fontWeight: 600,
            fontSize: compact ? 20 : 22,
            color: colors.ink,
            margin: 0,
          }}
        >
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

      <div
        style={{
          display: "grid",
          gridTemplateColumns: compact ? "1fr" : "1fr 1fr",
          gap: 12,
        }}
      >
        {SUBJECTS.map((s, i) => {
          const delay = i * 6;
          const p = spring({ frame: frame - delay, fps, config: { damping: 16, mass: 0.6 } });
          const opacity = Math.max(0, Math.min(1, p));
          const y = (1 - p) * 22;
          return (
            <div
              key={s.name}
              style={{
                opacity,
                transform: `translateY(${y}px)`,
                background: colors.white,
                border: `1px solid ${colors.border}`,
                borderRadius: 14,
                padding: "14px 16px",
                boxShadow: "0 1px 2px rgba(15,23,42,0.04)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <span style={{ width: 10, height: 10, borderRadius: 999, background: s.color, flexShrink: 0 }} />
                <span style={{ fontFamily: fontDisplay, fontWeight: 600, fontSize: 15, color: colors.ink }}>
                  {s.name}
                </span>
              </div>
              <div style={{ fontSize: 11, color: colors.slate500, marginBottom: 10, fontFamily: fontBody }}>
                {s.teacher}
              </div>
              <div style={{ display: "flex", gap: 14, fontSize: 11, fontWeight: 700, fontFamily: fontBody }}>
                <span style={{ color: "#D97706" }}>{s.pending} Pending</span>
                <span style={{ color: "#059669" }}>{s.done} Completed</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
