import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, Easing } from "remotion";
import { TRANSITION_FRAMES } from "../timeline";

// Wraps one scene's content with a matched fade+rise on the way in and
// fade+lift on the way out, so cuts between scenes read as a deliberate
// transition instead of a hard slideshow cut. `frame` here is always
// relative to the enclosing <Sequence>.
export function SceneFade({
  duration,
  children,
}: {
  duration: number;
  children: React.ReactNode;
}) {
  const frame = useCurrentFrame();

  const opacity = interpolate(
    frame,
    [0, TRANSITION_FRAMES, duration - TRANSITION_FRAMES, duration],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) }
  );

  const translateY = interpolate(
    frame,
    [0, TRANSITION_FRAMES, duration - TRANSITION_FRAMES, duration],
    [18, 0, 0, -14],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) }
  );

  return (
    <AbsoluteFill style={{ opacity, transform: `translateY(${translateY}px)` }}>
      {children}
    </AbsoluteFill>
  );
}
