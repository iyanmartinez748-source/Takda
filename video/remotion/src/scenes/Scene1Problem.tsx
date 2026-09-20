import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { GradientBackground } from "../components/GradientBackground";
import { fontDisplay } from "../fonts";
import type { Orientation } from "../types";

// Four stress-words punch in at different screen positions in quick
// succession, then the screen clears to a single grounding question —
// deliberately fast and a little chaotic to *communicate* overload without
// the layout itself becoming cluttered (each word is gone before the next
// two land).
const WORDS: Array<{ text: string; x: number; y: number; enter: number; rotate: number }> = [
  { text: "Assignments.", x: 50, y: 28, enter: 0, rotate: -3 },
  { text: "Quizzes.", x: 22, y: 50, enter: 10, rotate: 2 },
  { text: "Projects.", x: 76, y: 50, enter: 20, rotate: -2 },
  { text: "Deadlines.", x: 50, y: 72, enter: 30, rotate: 3 },
];

function StressWord({
  word,
  frame,
  fps,
  fontSize,
}: {
  word: (typeof WORDS)[number];
  frame: number;
  fps: number;
  fontSize: number;
}) {
  const local = frame - word.enter;
  if (local < 0) return null;
  const p = spring({ frame: local, fps, config: { damping: 11, mass: 0.5 } });
  const fadeOut = interpolate(frame, [78, 96], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const scale = 0.7 + p * 0.3;
  const opacity = Math.min(1, p) * fadeOut;
  return (
    <div
      style={{
        position: "absolute",
        left: `${word.x}%`,
        top: `${word.y}%`,
        transform: `translate(-50%, -50%) scale(${scale}) rotate(${word.rotate}deg)`,
        opacity,
        fontFamily: fontDisplay,
        fontWeight: 700,
        fontSize,
        color: "#FFFFFF",
        whiteSpace: "nowrap",
      }}
    >
      {word.text}
    </div>
  );
}

export function Scene1Problem({ orientation }: { orientation: Orientation }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const fontSize = orientation === "vertical" ? 52 : 56;

  const questionStart = 96;
  const qp = spring({ frame: frame - questionStart, fps, config: { damping: 15, mass: 0.6 } });
  const qOpacity = Math.max(0, Math.min(1, qp));
  const qScale = 0.85 + qp * 0.15;

  return (
    <AbsoluteFill>
      <GradientBackground variant="dark" />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        {WORDS.map((w) => (
          <StressWord key={w.text} word={w} frame={frame} fps={fps} fontSize={fontSize} />
        ))}
        {frame >= questionStart && (
          <div
            style={{
              position: "absolute",
              opacity: qOpacity,
              transform: `scale(${qScale})`,
              textAlign: "center",
              padding: "0 60px",
            }}
          >
            <div
              style={{
                fontFamily: fontDisplay,
                fontWeight: 600,
                fontSize: orientation === "vertical" ? 46 : 50,
                color: "#FFFFFF",
                lineHeight: 1.15,
              }}
            >
              Too much to remember?
            </div>
          </div>
        )}
      </AbsoluteFill>
    </AbsoluteFill>
  );
}
