import React from "react";
import { AbsoluteFill } from "remotion";
import { GradientBackground } from "../components/GradientBackground";
import { DeviceHero } from "../components/DeviceHero";
import { AppFrame } from "../components/ui/AppFrame";
import { SubjectsScreen } from "../components/ui/SubjectsScreen";
import type { Orientation } from "../types";

// SFX cue: transition swipe — soft swoosh (timeline.ts audioCues).
export function Scene3Subjects({ orientation }: { orientation: Orientation }) {
  return (
    <AbsoluteFill>
      <GradientBackground variant="light" />
      <DeviceHero
        orientation={orientation}
        active="subjects"
        headline="Keep every subject organized."
        screen={(frame, compact) => (
          <AppFrame active="subjects" compact={compact}>
            <SubjectsScreen frame={frame} compact={compact} />
          </AppFrame>
        )}
      />
    </AbsoluteFill>
  );
}
