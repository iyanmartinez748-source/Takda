import React from "react";
import { spring, useVideoConfig } from "remotion";
import { colors } from "../../theme";
import { fontDisplay, fontBody } from "../../fonts";

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];
// A representative 5-week grid starting on a Sunday, with a few days
// carrying subject-colored deadline dots the way the real calendar does.
const DAYS: Array<{ n: number; dots?: string[]; selected?: boolean; today?: boolean }> = [
  ...Array(3).fill(null).map(() => ({ n: 0 })),
  ...Array.from({ length: 30 }, (_, i) => {
    const n = i + 1;
    if (n === 9) return { n, dots: [colors.subjects[1]], today: true };
    if (n === 12) return { n, dots: [colors.subjects[0], colors.subjects[3]] };
    if (n === 15) return { n, dots: [colors.subjects[4]] };
    if (n === 18) return { n, selected: true, dots: [colors.subjects[0]] };
    return { n };
  }),
];

export function CalendarScreen({ frame, compact }: { frame: number; compact: boolean }) {
  const { fps } = useVideoConfig();
  const toastP = spring({ frame: frame - 26, fps, config: { damping: 14, mass: 0.6 } });
  const toastOpacity = Math.max(0, Math.min(1, toastP));
  const toastY = (1 - toastP) * -14;

  return (
    <div style={{ position: "relative", height: "100%" }}>
      <h1
        style={{
          fontFamily: fontDisplay,
          fontWeight: 600,
          fontSize: compact ? 20 : 22,
          color: colors.ink,
          margin: "0 0 4px",
        }}
      >
        Calendar
      </h1>
      <div style={{ fontSize: 11, color: colors.slate500, marginBottom: 14, fontFamily: fontBody }}>
        October 2026 · 4 deadlines
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 4, marginBottom: 4 }}>
        {WEEKDAYS.map((d, i) => (
          <div key={i} style={{ textAlign: "center", fontSize: 10, color: colors.slate400, fontFamily: fontBody }}>
            {d}
          </div>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 4 }}>
        {DAYS.map((d, i) => {
          if (!d.n) return <div key={i} />;
          const bg = d.selected ? colors.primary : "#FFFFFF";
          const border = d.today ? colors.primary : colors.border;
          const textColor = d.selected ? "#FFFFFF" : colors.ink;
          return (
            <div
              key={i}
              style={{
                aspectRatio: "1",
                borderRadius: 8,
                background: bg,
                border: `1px solid ${border}`,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 10.5,
                color: textColor,
                fontFamily: fontBody,
                position: "relative",
              }}
            >
              {d.n}
              {d.dots && (
                <div style={{ position: "absolute", bottom: 3, display: "flex", gap: 2 }}>
                  {d.dots.map((c, di) => (
                    <span
                      key={di}
                      style={{
                        width: 4,
                        height: 4,
                        borderRadius: 999,
                        background: d.selected ? "#FFFFFF" : c,
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Floating deadline notification, matching Takda's reminder/toast
          styling (danger tone for a near-term deadline). */}
      <div
        style={{
          position: "absolute",
          left: compact ? 4 : 12,
          right: compact ? 4 : 12,
          bottom: compact ? 10 : 16,
          opacity: toastOpacity,
          transform: `translateY(${toastY}px)`,
          background: colors.white,
          borderRadius: 14,
          padding: "12px 14px",
          display: "flex",
          alignItems: "center",
          gap: 10,
          boxShadow: "0 12px 32px rgba(15,23,42,0.14)",
          border: `1px solid ${colors.border}`,
        }}
      >
        <div
          style={{
            width: 30,
            height: 30,
            borderRadius: 999,
            background: colors.danger.bg,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <span style={{ width: 8, height: 8, borderRadius: 999, background: colors.danger.dot }} />
        </div>
        <div style={{ fontFamily: fontBody, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: colors.ink }}>Due Tomorrow</div>
          <div style={{ fontSize: 11, color: colors.slate500 }}>Physics 101 · Research Paper</div>
        </div>
      </div>
    </div>
  );
}
