import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate, staticFile } from "remotion";
import { GradientBackground } from "../../components/GradientBackground";
import { fontDisplay, fontBody } from "../../fonts";
import type { Orientation } from "../../types";

// V2 simplifies the text hierarchy from V1: the icon alone carries the
// brand mark (no separate "Takda" wordmark under it), so "Meet Takda."
// is the only place the name appears on screen — no repetition.
// SFX cue: logo reveal — deep impact/hit + light sweep shimmer (timeline.ts).
export function Scene2Reveal({ orientation }: { orientation: Orientation }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const vertical = orientation === "vertical";

  const logoP = spring({ frame, fps, config: { damping: 11, mass: 0.8 } });
  const logoScale = 0.55 + Math.min(1, logoP) * 0.45;
  const logoOpacity = Math.min(1, logoP * 1.4);
  const glow = interpolate(frame, [0, 18, 42], [0, 0.7, 0.3], { extrapolateRight: "clamp" });

  // Light-sweep: a skewed white highlight bar translating across the logo
  // once, clipped to the logo's own rounded-rect bounds.
  const sweepX = interpolate(frame, [10, 42], [-140, 160], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: (t) => t * t * (3 - 2 * t),
  });
  const sweepOpacity = interpolate(frame, [10, 20, 34, 42], [0, 0.9, 0.9, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const meetP = spring({ frame: frame - 26, fps, config: { damping: 13, mass: 0.6 } });
  const meetOpacity = Math.max(0, Math.min(1, meetP));
  const meetY = (1 - Math.max(0, meetP)) * 20;
  const meetScale = 0.92 + Math.max(0, Math.min(1, meetP)) * 0.08;

  const tagP = spring({ frame: frame - 46, fps, config: { damping: 15, mass: 0.6 } });
  const tagOpacity = Math.max(0, Math.min(1, tagP));
  const tagY = (1 - Math.max(0, tagP)) * 14;

  const logoSize = vertical ? 168 : 140;
  const radius = logoSize * 0.24;

  return (
    <AbsoluteFill>
      <GradientBackground variant="dark" />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        <div
          style={{
            position: "absolute",
            width: logoSize * 2.8,
            height: logoSize * 2.8,
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(232,207,154,0.5) 0%, rgba(61,47,224,0) 70%)",
            opacity: glow,
            top: vertical ? "32%" : "36%",
            transform: "translateY(-50%)",
          }}
        />
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginTop: vertical ? -100 : -50 }}>
          <div
            style={{
              position: "relative",
              width: logoSize,
              height: logoSize,
              opacity: logoOpacity,
              transform: `scale(${logoScale})`,
              borderRadius: radius,
              overflow: "hidden",
              boxShadow: "0 24px 70px rgba(0,0,0,0.5)",
            }}
          >
            <img src={staticFile("takda-icon.png")} width={logoSize} height={logoSize} style={{ display: "block" }} />
            <div
              style={{
                position: "absolute",
                inset: 0,
                opacity: sweepOpacity,
                background: `linear-gradient(75deg, transparent calc(${sweepX}% - 18%), rgba(255,255,255,0.55) ${sweepX}%, transparent calc(${sweepX}% + 18%))`,
              }}
            />
          </div>

          <div
            style={{
              marginTop: 38,
              opacity: meetOpacity,
              transform: `translateY(${meetY}px) scale(${meetScale})`,
              fontFamily: fontDisplay,
              fontWeight: 600,
              fontSize: vertical ? 62 : 58,
              color: "#FFFFFF",
              letterSpacing: -0.5,
            }}
          >
            Meet Takda.
          </div>
          <div
            style={{
              marginTop: 12,
              opacity: tagOpacity,
              transform: `translateY(${tagY}px)`,
              fontFamily: fontBody,
              fontWeight: 500,
              fontSize: vertical ? 21 : 20,
              color: "rgba(255,255,255,0.75)",
            }}
          >
            Your academic life, organized.
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}
