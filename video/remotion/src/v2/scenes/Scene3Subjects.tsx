import React from "react";
import { AbsoluteFill } from "remotion";
import { GradientBackground } from "../../components/GradientBackground";
import { DeviceHeroV2 } from "../ui/DeviceHeroV2";
import { AppFrame } from "../../components/ui/AppFrame";
import { SubjectsScreenV2 } from "../ui/SubjectsScreenV2";
import type { Orientation } from "../../types";

// SFX cues: UI tap/click — subject selected; drawer slide — soft swoosh
// (timeline.ts audioCues, synced to SubjectsScreenV2's TAP_FRAME/DRAWER_FRAME).
export function Scene3Subjects({ orientation }: { orientation: Orientation }) {
  return (
    <AbsoluteFill>
      <GradientBackground variant="light" />
      <DeviceHeroV2
        orientation={orientation}
        headline="Everything for every subject."
        screen={(frame, compact) => (
          <AppFrame active="subjects" compact={compact}>
            <SubjectsScreenV2 frame={frame} compact={compact} />
          </AppFrame>
        )}
      />
    </AbsoluteFill>
  );
}
