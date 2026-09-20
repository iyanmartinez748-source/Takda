import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate, staticFile } from "remotion";
import { GradientBackground } from "../components/GradientBackground";
import { fontDisplay, fontBody } from "../fonts";
import type { Orientation } from "../types";

// SFX cue: logo reveal — soft whoosh + chime (see timeline.ts audioCues).
export function Scene2Intro({ orientation }: { orientation: Orientation }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const logoP = spring({ frame, fps, config: { damping: 12, mass: 0.7 } });
  const logoScale = 0.6 + Math.min(1, logoP) * 0.4;
  const logoOpacity = Math.min(1, logoP * 1.4);
  const glow = interpolate(frame, [0, 20, 40], [0, 0.6, 0.25], { extrapolateRight: "clamp" });

  const meetP = spring({ frame: frame - 18, fps, config: { damping: 14, mass: 0.6 } });
  const meetOpacity = Math.max(0, Math.min(1, meetP));
  const meetY = (1 - Math.max(0, meetP)) * 16;

  const tagP = spring({ frame: frame - 34, fps, config: { damping: 14, mass: 0.6 } });
  const tagOpacity = Math.max(0, Math.min(1, tagP));
  const tagY = (1 - Math.max(0, tagP)) * 14;

  const logoSize = orientation === "vertical" ? 130 : 110;

  return (
    <AbsoluteFill>
      <GradientBackground variant="dark" />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        <div
          style={{
            position: "absolute",
            width: logoSize * 2.6,
            height: logoSize * 2.6,
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(232,207,154,0.45) 0%, rgba(61,47,224,0) 70%)",
            opacity: glow,
            top: orientation === "vertical" ? "30%" : "34%",
            transform: "translateY(-50%)",
          }}
        />
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            marginTop: orientation === "vertical" ? -80 : -40,
          }}
        >
          <img
            src={staticFile("takda-icon.png")}
            width={logoSize}
            height={logoSize}
            style={{
              borderRadius: logoSize * 0.24,
              opacity: logoOpacity,
              transform: `scale(${logoScale})`,
              boxShadow: "0 20px 60px rgba(0,0,0,0.45)",
            }}
          />
          <span
            style={{
              marginTop: 20,
              fontFamily: fontDisplay,
              fontWeight: 600,
              fontSize: orientation === "vertical" ? 54 : 48,
              color: "#FFFFFF",
              opacity: logoOpacity,
              transform: `scale(${logoScale})`,
              letterSpacing: -0.5,
            }}
          >
            Takda
          </span>

          <div
            style={{
              marginTop: 34,
              opacity: meetOpacity,
              transform: `translateY(${meetY}px)`,
              fontFamily: fontDisplay,
              fontWeight: 600,
              fontSize: orientation === "vertical" ? 34 : 30,
              color: "#E8CF9A",
            }}
          >
            Meet Takda.
          </div>
          <div
            style={{
              marginTop: 10,
              opacity: tagOpacity,
              transform: `translateY(${tagY}px)`,
              fontFamily: fontBody,
              fontWeight: 500,
              fontSize: orientation === "vertical" ? 20 : 19,
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
