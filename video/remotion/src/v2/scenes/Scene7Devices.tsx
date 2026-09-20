import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring } from "remotion";
import { GradientBackground } from "../../components/GradientBackground";
import { PhoneMockup, LaptopMockup } from "../../components/DeviceMockups";
import { AppFrame } from "../../components/ui/AppFrame";
import { SubjectsScreen } from "../../components/ui/SubjectsScreen";
import { ActivitiesScreen } from "../../components/ui/ActivitiesScreen";
import { fontDisplay } from "../../fonts";
import { colors } from "../../theme";
import type { Orientation } from "../../types";

// Laptop enters first, phone floats in over it a beat later with its own
// easing (parallax rather than both arriving in lockstep), then both drift
// gently — the inner screens replaying their own stagger-in entrance
// supplies the "small UI movement inside the devices" the brief asks for.
// SFX cues: soft whoosh on laptop entry, second soft whoosh as the phone
// floats in (timeline.ts audioCues).
export function Scene7Devices({ orientation }: { orientation: Orientation }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const vertical = orientation === "vertical";

  const laptopP = spring({ frame, fps, config: { damping: 15, mass: 1 } });
  const laptopOpacity = Math.min(1, laptopP * 1.5);
  const laptopScale = 0.82 + Math.min(1, laptopP) * 0.18;
  const laptopEnterY = (1 - Math.min(1, laptopP)) * 40;
  const laptopDrift = Math.sin(frame * 0.025) * 5;

  const phoneP = spring({ frame: frame - 14, fps, config: { damping: 13, mass: 0.6 } });
  const phoneOpacity = Math.max(0, Math.min(1, phoneP * 1.5));
  const phoneScale = 0.75 + Math.max(0, Math.min(1, phoneP)) * 0.25;
  const phoneEnterY = (1 - Math.max(0, Math.min(1, phoneP))) * 50;
  const phoneDrift = Math.sin(frame * 0.03 + 1.4) * 7;

  const headP = spring({ frame: frame - 42, fps, config: { damping: 15, mass: 0.6 } });
  const headOpacity = Math.max(0, Math.min(1, headP));
  const headY = (1 - Math.max(0, headP)) * 16;

  const laptopW = vertical ? 480 : 640;
  const phoneW = vertical ? 200 : 230;

  return (
    <AbsoluteFill>
      <GradientBackground variant="light" />
      <AbsoluteFill style={{ flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <div style={{ position: "relative", width: laptopW, height: laptopW * 0.62, marginBottom: vertical ? 34 : 14 }}>
          <div style={{ opacity: laptopOpacity, transform: `translateY(${laptopEnterY + laptopDrift}px) scale(${laptopScale})` }}>
            <LaptopMockup width={laptopW}>
              <AppFrame active="dashboard" compact={false}>
                <SubjectsScreen frame={frame} compact={false} />
              </AppFrame>
            </LaptopMockup>
          </div>
          <div
            style={{
              position: "absolute",
              right: vertical ? -26 : -56,
              bottom: vertical ? -76 : -64,
              opacity: phoneOpacity,
              transform: `translateY(${phoneEnterY + phoneDrift}px) scale(${phoneScale})`,
            }}
          >
            <PhoneMockup width={phoneW}>
              <AppFrame active="activities" compact>
                <ActivitiesScreen frame={frame} compact />
              </AppFrame>
            </PhoneMockup>
          </div>
        </div>

        <div style={{ opacity: headOpacity, transform: `translateY(${headY}px)`, textAlign: "center", marginTop: vertical ? 46 : 26 }}>
          <div style={{ fontFamily: fontDisplay, fontWeight: 600, fontSize: vertical ? 42 : 44, color: colors.ink }}>
            Plan anywhere.
          </div>
          <div style={{ fontFamily: fontDisplay, fontWeight: 600, fontSize: vertical ? 42 : 44, color: colors.primary }}>
            Study smarter.
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}
