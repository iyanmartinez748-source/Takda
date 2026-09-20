import React from "react";
import { AbsoluteFill, Sequence } from "remotion";
import { scenes } from "./timeline";
import { SceneFade } from "./components/SceneFade";
import { Scene1Problem } from "./scenes/Scene1Problem";
import { Scene2Intro } from "./scenes/Scene2Intro";
import { Scene3Subjects } from "./scenes/Scene3Subjects";
import { Scene4Activities } from "./scenes/Scene4Activities";
import { Scene5Deadlines } from "./scenes/Scene5Deadlines";
import { Scene6Progress } from "./scenes/Scene6Progress";
import { Scene7Anywhere } from "./scenes/Scene7Anywhere";
import { Scene8CTA } from "./scenes/Scene8CTA";
import type { Orientation } from "./types";

// Ordered to match scenes in timeline.ts. Kept as data (not JSX) so this
// file is the single place that maps a scene key to both its frame range
// and its component.
const SCENE_LIST: Array<{
  key: keyof typeof scenes;
  Component: React.ComponentType<{ orientation: Orientation }>;
}> = [
  { key: "problem", Component: Scene1Problem },
  { key: "intro", Component: Scene2Intro },
  { key: "subjects", Component: Scene3Subjects },
  { key: "activities", Component: Scene4Activities },
  { key: "deadlines", Component: Scene5Deadlines },
  { key: "progress", Component: Scene6Progress },
  { key: "anywhere", Component: Scene7Anywhere },
  { key: "cta", Component: Scene8CTA },
];

export function Commercial({ orientation }: { orientation: Orientation }) {
  return (
    <AbsoluteFill style={{ background: "#1B1B2F" }}>
      {SCENE_LIST.map(({ key, Component }) => {
        const range = scenes[key];
        return (
          <Sequence key={key} from={range.from} durationInFrames={range.duration} name={key}>
            <SceneFade duration={range.duration}>
              <Component orientation={orientation} />
            </SceneFade>
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
}
