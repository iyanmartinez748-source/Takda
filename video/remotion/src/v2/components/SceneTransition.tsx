import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, Easing } from "remotion";
import { TRANSITION_FRAMES } from "../timeline";

// V2's version of V1's SceneFade: same fade+rise cross-fade between
// scenes, plus a subtle scale-in (0.96 -> 1) on the way in so every scene
// arrives with a gentle zoom rather than a flat cut — one of the "smooth
// zooms" the brief asks V2 to lean into more than V1 did.
export function SceneTransition({
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
    [22, 0, 0, -16],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) }
  );

  const scale = interpolate(frame, [0, TRANSITION_FRAMES], [0.96, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  return (
    <AbsoluteFill style={{ opacity, transform: `translateY(${translateY}px) scale(${scale})` }}>
      {children}
    </AbsoluteFill>
  );
}
