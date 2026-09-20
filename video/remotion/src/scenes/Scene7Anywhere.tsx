import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring } from "remotion";
import { GradientBackground } from "../components/GradientBackground";
import { PhoneMockup, LaptopMockup } from "../components/DeviceMockups";
import { AppFrame } from "../components/ui/AppFrame";
import { SubjectsScreen } from "../components/ui/SubjectsScreen";
import { ActivitiesScreen } from "../components/ui/ActivitiesScreen";
import { fontDisplay } from "../fonts";
import { colors } from "../theme";
import type { Orientation } from "../types";

// SFX cue: device swap — soft swoosh (timeline.ts audioCues).
export function Scene7Anywhere({ orientation }: { orientation: Orientation }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const vertical = orientation === "vertical";

  const laptopP = spring({ frame, fps, config: { damping: 16, mass: 0.9 } });
  const laptopOpacity = Math.min(1, laptopP * 1.5);
  const laptopScale = 0.85 + Math.min(1, laptopP) * 0.15;

  const phoneP = spring({ frame: frame - 10, fps, config: { damping: 14, mass: 0.6 } });
  const phoneOpacity = Math.max(0, Math.min(1, phoneP * 1.5));
  const phoneScale = 0.8 + Math.max(0, Math.min(1, phoneP)) * 0.2;
  const phoneY = (1 - Math.max(0, Math.min(1, phoneP))) * 30;

  const headP = spring({ frame: frame - 36, fps, config: { damping: 15, mass: 0.6 } });
  const headOpacity = Math.max(0, Math.min(1, headP));
  const headY = (1 - Math.max(0, headP)) * 16;

  const laptopW = vertical ? 460 : 620;
  const phoneW = vertical ? 190 : 220;

  return (
    <AbsoluteFill>
      <GradientBackground variant="light" />
      <AbsoluteFill style={{ flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <div
          style={{
            position: "relative",
            width: laptopW,
            height: laptopW * 0.62,
            marginBottom: vertical ? 30 : 10,
          }}
        >
          <div style={{ opacity: laptopOpacity, transform: `scale(${laptopScale})` }}>
            <LaptopMockup width={laptopW}>
              <AppFrame active="dashboard" compact={false}>
                <SubjectsScreen frame={frame} compact={false} />
              </AppFrame>
            </LaptopMockup>
          </div>
          <div
            style={{
              position: "absolute",
              right: vertical ? -30 : -60,
              bottom: vertical ? -70 : -60,
              opacity: phoneOpacity,
              transform: `translateY(${phoneY}px) scale(${phoneScale})`,
            }}
          >
            <PhoneMockup width={phoneW}>
              <AppFrame active="activities" compact>
                <ActivitiesScreen frame={frame} compact />
              </AppFrame>
            </PhoneMockup>
          </div>
        </div>

        <div
          style={{
            opacity: headOpacity,
            transform: `translateY(${headY}px)`,
            textAlign: "center",
            marginTop: vertical ? 40 : 24,
          }}
        >
          <div style={{ fontFamily: fontDisplay, fontWeight: 600, fontSize: vertical ? 38 : 42, color: colors.ink }}>
            Plan anywhere.
          </div>
          <div style={{ fontFamily: fontDisplay, fontWeight: 600, fontSize: vertical ? 38 : 42, color: colors.primary }}>
            Study smarter.
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}
