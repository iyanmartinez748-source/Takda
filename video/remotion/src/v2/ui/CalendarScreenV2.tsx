import React from "react";
import { spring, useVideoConfig, interpolate } from "remotion";
import { colors } from "../../theme";
import { fontDisplay, fontBody } from "../../fonts";

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];
// September 2026 starts on a Tuesday.
const LEAD_BLANKS = 2;
const HIGHLIGHT_DAY = 24;
const DOT_DAYS: Record<number, string[]> = {
  10: [colors.subjects[1]],
  18: [colors.subjects[4]],
  24: [colors.subjects[0]],
  29: [colors.subjects[3]],
};

const UPCOMING = [
  { title: "Research Paper", subject: "Physics 101", due: "Sep 24", color: colors.subjects[0] },
  { title: "Lab Report", subject: "Computer Science", due: "Sep 29", color: colors.subjects[3] },
];

const CALLOUT_FRAME = 30;
const LIST_FRAME = 78;

export function CalendarScreenV2({ frame, compact }: { frame: number; compact: boolean }) {
  const { fps } = useVideoConfig();

  const pulse = spring({ frame: frame - 6, fps, config: { damping: 8, mass: 0.4 } });
  const ringScale = 1 + Math.max(0, Math.sin(Math.min(pulse, 3) * Math.PI * 0.5)) * 0.12 * Math.max(0, 1 - pulse / 3);

  const calloutP = spring({ frame: frame - CALLOUT_FRAME, fps, config: { damping: 14, mass: 0.6 } });
  const calloutOpacity = Math.max(0, Math.min(1, calloutP));
  const calloutY = (1 - Math.max(0, calloutP)) * -12;

  return (
    <div style={{ position: "relative", height: "100%" }}>
      <h1 style={{ fontFamily: fontDisplay, fontWeight: 600, fontSize: compact ? 20 : 22, color: colors.ink, margin: "0 0 4px" }}>
        Calendar
      </h1>
      <div style={{ fontSize: 11, color: colors.slate500, marginBottom: 12, fontFamily: fontBody }}>
        September 2026 · 4 deadlines
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 4, marginBottom: 4 }}>
        {WEEKDAYS.map((d, i) => (
          <div key={i} style={{ textAlign: "center", fontSize: 10, color: colors.slate400, fontFamily: fontBody }}>
            {d}
          </div>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 4 }}>
        {Array.from({ length: LEAD_BLANKS }).map((_, i) => (
          <div key={`b${i}`} />
        ))}
        {Array.from({ length: 30 }, (_, i) => i + 1).map((day) => {
          const isHighlight = day === HIGHLIGHT_DAY;
          const dots = DOT_DAYS[day];
          return (
            <div
              key={day}
              style={{
                aspectRatio: "1",
                borderRadius: 8,
                background: isHighlight ? colors.primary : "#FFFFFF",
                border: `1.5px solid ${isHighlight ? colors.primary : colors.border}`,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 10.5,
                color: isHighlight ? "#FFFFFF" : colors.ink,
                fontFamily: fontBody,
                fontWeight: isHighlight ? 700 : 400,
                position: "relative",
                transform: isHighlight ? `scale(${ringScale})` : undefined,
                boxShadow: isHighlight ? "0 6px 16px rgba(61,47,224,0.35)" : undefined,
              }}
            >
              {day}
              {dots && (
                <div style={{ position: "absolute", bottom: 3, display: "flex", gap: 2 }}>
                  {dots.map((c, di) => (
                    <span key={di} style={{ width: 4, height: 4, borderRadius: 999, background: isHighlight ? "#FFFFFF" : c }} />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Absolutely positioned, like V1's calendar toast: an overlay panel
          never adds to document flow height, so it can never push the grid
          taller than the device screen and get clipped — it just sits over
          the last row or two, the same trick V1 relied on. */}
      {frame >= CALLOUT_FRAME && (
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            opacity: calloutOpacity,
            transform: `translateY(${calloutY}px)`,
            background: colors.white,
            borderRadius: "14px 14px 0 0",
            borderTop: `1px solid ${colors.border}`,
            padding: "10px 12px 12px",
            boxShadow: "0 -10px 26px rgba(15,23,42,0.1)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                width: 26,
                height: 26,
                borderRadius: 999,
                background: colors.danger.bg,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <span style={{ width: 6, height: 6, borderRadius: 999, background: colors.danger.dot }} />
            </div>
            <div style={{ fontFamily: fontBody, minWidth: 0 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: colors.ink }}>Research Paper</div>
              <div style={{ fontSize: 10, color: colors.slate500 }}>Due Sep 24 · 11:59 PM</div>
            </div>
          </div>

          {frame >= LIST_FRAME && (
            <div style={{ marginTop: 7, paddingTop: 7, borderTop: `1px solid ${colors.border}`, display: "flex", flexDirection: "column", gap: 4 }}>
              {UPCOMING.map((u, i) => {
                const p = spring({ frame: frame - LIST_FRAME - i * 6, fps, config: { damping: 16, mass: 0.6 } });
                const opacity = Math.max(0, Math.min(1, p));
                const x = (1 - Math.max(0, p)) * 14;
                return (
                  <div
                    key={u.title}
                    style={{
                      opacity,
                      transform: `translateX(${x}px)`,
                      display: "flex",
                      alignItems: "center",
                      gap: 7,
                      fontFamily: fontBody,
                    }}
                  >
                    <span style={{ width: 5, height: 5, borderRadius: 999, background: u.color, flexShrink: 0 }} />
                    <span style={{ fontSize: 10, fontWeight: 600, color: colors.ink }}>{u.title}</span>
                    <span style={{ fontSize: 9.5, color: colors.slate400 }}>· {u.due}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
