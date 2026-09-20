import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { colors } from "../theme";

type Variant = "dark" | "light" | "punch";

const GRADIENTS: Record<Variant, string> = {
  dark: `radial-gradient(120% 90% at 50% -10%, #2E22B0 0%, #1B1B2F 55%, #14141F 100%)`,
  light: `linear-gradient(180deg, #F5F6FA 0%, #F0EFFB 100%)`,
  punch: `radial-gradient(130% 100% at 50% 0%, #5A47F5 0%, ${colors.primary} 45%, #2A1FA6 100%)`,
};

// Slow, continuous drifting blobs — never restart per-scene, so the motion
// reads as one ambient backdrop rather than a slideshow reset. Frame is the
// absolute timeline frame (not scene-relative) for that reason.
function Blob({
  frame,
  size,
  color,
  opacity,
  baseX,
  baseY,
  speed,
  phase,
}: {
  frame: number;
  size: number;
  color: string;
  opacity: number;
  baseX: number;
  baseY: number;
  speed: number;
  phase: number;
}) {
  const t = frame * speed + phase;
  const x = baseX + Math.sin(t) * 6;
  const y = baseY + Math.cos(t * 0.8) * 6;
  return (
    <div
      style={{
        position: "absolute",
        left: `${x}%`,
        top: `${y}%`,
        width: size,
        height: size,
        borderRadius: "50%",
        background: color,
        opacity,
        filter: "blur(80px)",
        transform: "translate(-50%, -50%)",
      }}
    />
  );
}

export function GradientBackground({ variant }: { variant: Variant }) {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ background: GRADIENTS[variant], overflow: "hidden" }}>
      {variant === "dark" && (
        <>
          <Blob frame={frame} size={900} color="#3D2FE0" opacity={0.35} baseX={20} baseY={20} speed={0.01} phase={0} />
          <Blob frame={frame} size={700} color="#E8CF9A" opacity={0.08} baseX={85} baseY={70} speed={0.008} phase={2} />
        </>
      )}
      {variant === "light" && (
        <>
          <Blob frame={frame} size={700} color="#DCD9FF" opacity={0.55} baseX={90} baseY={5} speed={0.009} phase={1} />
          <Blob frame={frame} size={600} color="#FDE9B0" opacity={0.3} baseX={5} baseY={95} speed={0.007} phase={3} />
        </>
      )}
      {variant === "punch" && (
        <>
          <Blob frame={frame} size={800} color="#FFFFFF" opacity={0.12} baseX={15} baseY={10} speed={0.01} phase={0.5} />
          <Blob frame={frame} size={900} color="#1B1B2F" opacity={0.18} baseX={85} baseY={95} speed={0.008} phase={1.5} />
        </>
      )}
    </AbsoluteFill>
  );
}
