import React from "react";
import { AbsoluteFill, Sequence } from "remotion";
import { scenes } from "./timeline";
import { SceneTransition } from "./components/SceneTransition";
import { Scene1Hook } from "./scenes/Scene1Hook";
import { Scene2Reveal } from "./scenes/Scene2Reveal";
import { Scene3Subjects } from "./scenes/Scene3Subjects";
import { Scene4Activities } from "./scenes/Scene4Activities";
import { Scene5Deadlines } from "./scenes/Scene5Deadlines";
import { Scene6Progress } from "./scenes/Scene6Progress";
import { Scene7Devices } from "./scenes/Scene7Devices";
import { Scene8CTA } from "./scenes/Scene8CTA";
import type { Orientation } from "../types";

const SCENE_LIST: Array<{
  key: keyof typeof scenes;
  Component: React.ComponentType<{ orientation: Orientation }>;
}> = [
  { key: "hook", Component: Scene1Hook },
  { key: "reveal", Component: Scene2Reveal },
  { key: "subjects", Component: Scene3Subjects },
  { key: "activities", Component: Scene4Activities },
  { key: "deadlines", Component: Scene5Deadlines },
  { key: "progress", Component: Scene6Progress },
  { key: "devices", Component: Scene7Devices },
  { key: "cta", Component: Scene8CTA },
];

export function CommercialV2({ orientation }: { orientation: Orientation }) {
  return (
    <AbsoluteFill style={{ background: "#1B1B2F" }}>
      {SCENE_LIST.map(({ key, Component }) => {
        const range = scenes[key];
        return (
          <Sequence key={key} from={range.from} durationInFrames={range.duration} name={key}>
            <SceneTransition duration={range.duration}>
              <Component orientation={orientation} />
            </SceneTransition>
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
}
