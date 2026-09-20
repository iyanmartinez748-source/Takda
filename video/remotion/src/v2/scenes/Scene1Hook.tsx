import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { GradientBackground } from "../../components/GradientBackground";
import { fontDisplay, fontBody } from "../../fonts";
import { colors } from "../../theme";
import type { Orientation } from "../../types";

type CardDef = {
  title: string;
  subtitle: string;
  color: string;
  x: number;
  y: number;
  rotate: number;
  delay: number;
};

// Six academic-task notifications, arranged in a ring around the headline
// so the center stays legible while the edges feel busy/overwhelming —
// "slightly overwhelming but still premium and organized," per the brief.
const CARDS: CardDef[] = [
  { title: "Assignment", subtitle: "Due tomorrow", color: colors.subjects[0], x: 14, y: 20, rotate: -4, delay: 0 },
  { title: "Science Quiz", subtitle: "Quiz · Oct 10", color: colors.subjects[4], x: 84, y: 18, rotate: 3, delay: 5 },
  { title: "Research Paper", subtitle: "Research · Oct 12", color: colors.subjects[1], x: 10, y: 52, rotate: 3, delay: 10 },
  { title: "Group Presentation", subtitle: "Presentation · Oct 15", color: colors.subjects[3], x: 88, y: 54, rotate: -3, delay: 15 },
  { title: "Exam", subtitle: "Next week", color: colors.subjects[6], x: 20, y: 82, rotate: 2, delay: 20 },
  { title: "Project Deadline", subtitle: "In 3 days", color: colors.subjects[5], x: 80, y: 84, rotate: -2, delay: 25 },
];

const CONVERGE_START = 62;
const CONVERGE_END = 92;
const RELIEF_START = 82;

function NotificationCard({
  card,
  frame,
  fps,
  small,
}: {
  card: CardDef;
  frame: number;
  fps: number;
  small: boolean;
}) {
  const local = frame - card.delay;
  if (local < 0) return null;
  const p = spring({ frame: local, fps, config: { damping: 13, mass: 0.5 } });
  const enterScale = 0.6 + Math.min(1, p) * 0.4;
  const enterOpacity = Math.min(1, p * 1.6);

  const converge = interpolate(frame, [CONVERGE_START, CONVERGE_END], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const x = card.x + (50 - card.x) * converge;
  const y = card.y + (50 - card.y) * converge;
  const scale = enterScale * (1 - converge * 0.75);
  const opacity = enterOpacity * (1 - converge);

  return (
    <div
      style={{
        position: "absolute",
        left: `${x}%`,
        top: `${y}%`,
        transform: `translate(-50%, -50%) rotate(${card.rotate}deg) scale(${scale})`,
        opacity,
        background: "#FFFFFF",
        borderRadius: 12,
        padding: small ? "8px 12px" : "10px 14px",
        boxShadow: "0 14px 32px rgba(0,0,0,0.28)",
        borderLeft: `3px solid ${card.color}`,
        minWidth: small ? 130 : 150,
      }}
    >
      <div style={{ fontFamily: fontBody, fontWeight: 700, fontSize: small ? 12 : 13, color: colors.ink }}>
        {card.title}
      </div>
      <div style={{ fontFamily: fontBody, fontWeight: 500, fontSize: small ? 10 : 10.5, color: colors.slate500, marginTop: 1 }}>
        {card.subtitle}
      </div>
    </div>
  );
}

// SFX cues (timeline.ts audioCues): hook whoosh at frame 0, a notification
// pop per card as it lands, then a soft whoosh as everything converges.
export function Scene1Hook({ orientation }: { orientation: Orientation }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const vertical = orientation === "vertical";

  const headP = spring({ frame, fps, config: { damping: 12, mass: 0.5 } });
  const headScale = 0.82 + Math.min(1, headP) * 0.18;
  const headEnter = Math.min(1, headP * 1.5);
  const headExit = interpolate(frame, [54, 68], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const headOpacity = headEnter * headExit;

  const reliefP = spring({ frame: frame - RELIEF_START, fps, config: { damping: 14, mass: 0.6 } });
  const reliefOpacity = Math.max(0, Math.min(1, reliefP));
  const reliefScale = 0.88 + Math.max(0, Math.min(1, reliefP)) * 0.12;

  return (
    <AbsoluteFill>
      <GradientBackground variant="dark" />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        {CARDS.map((c) => (
          <NotificationCard key={c.title} card={c} frame={frame} fps={fps} small={vertical} />
        ))}

        <div
          style={{
            position: "absolute",
            opacity: headOpacity,
            transform: `scale(${headScale})`,
            textAlign: "center",
            padding: "0 50px",
            fontFamily: fontDisplay,
            fontWeight: 600,
            fontSize: vertical ? 58 : 62,
            color: "#FFFFFF",
            lineHeight: 1.1,
          }}
        >
          Too many deadlines?
        </div>

        {frame >= RELIEF_START && (
          <div
            style={{
              position: "absolute",
              opacity: reliefOpacity,
              transform: `scale(${reliefScale})`,
              textAlign: "center",
              padding: "0 60px",
              fontFamily: fontDisplay,
              fontWeight: 600,
              fontSize: vertical ? 46 : 50,
              color: "#FFFFFF",
              lineHeight: 1.15,
            }}
          >
            Keep everything <br /> in one place.
          </div>
        )}
      </AbsoluteFill>
    </AbsoluteFill>
  );
}
