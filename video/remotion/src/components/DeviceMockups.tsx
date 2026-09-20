import React from "react";
import { shadow } from "../theme";

// The screen content (AppFrame + *Screen components) is authored with
// fixed pixel font sizes/paddings tuned for these two "native" widths —
// the sizes at which DeviceHero already renders every scene cleanly. Any
// mockup requested at a different width (e.g. the smaller devices in
// Scene7Anywhere) scales that same content down/up via CSS transform
// instead of cramming it into a narrower box, which is what caused text
// like "My Subjects" / "5 Completed" to clip at small widths.
const NATIVE_PHONE_WIDTH = 360;
const NATIVE_LAPTOP_WIDTH = 760;

function ScaledScreen({
  nativeWidth,
  screenWidth,
  screenHeight,
  children,
}: {
  nativeWidth: number;
  screenWidth: number;
  screenHeight: number;
  children: React.ReactNode;
}) {
  const scale = screenWidth / nativeWidth;
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
      <div
        style={{
          width: nativeWidth,
          height: screenHeight / scale,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
        }}
      >
        {children}
      </div>
    </div>
  );
}

export function PhoneMockup({
  width = 420,
  children,
}: {
  width?: number;
  children: React.ReactNode;
}) {
  const height = width * 2.06;
  const radius = width * 0.13;
  const pad = width * 0.028;
  const screenWidth = width - pad * 2;
  const screenHeight = height - pad * 2;
  return (
    <div
      style={{
        width,
        height,
        borderRadius: radius,
        background: "#111116",
        padding: pad,
        boxShadow: shadow.deep,
      }}
    >
      <div
        style={{
          position: "relative",
          width: "100%",
          height: "100%",
          borderRadius: radius * 0.86,
          overflow: "hidden",
          background: "#F5F6FA",
        }}
      >
        <ScaledScreen nativeWidth={NATIVE_PHONE_WIDTH} screenWidth={screenWidth} screenHeight={screenHeight}>
          {children}
        </ScaledScreen>
        {/* Dynamic-island style notch */}
        <div
          style={{
            position: "absolute",
            top: width * 0.03,
            left: "50%",
            transform: "translateX(-50%)",
            width: width * 0.28,
            height: width * 0.065,
            borderRadius: 999,
            background: "#111116",
          }}
        />
      </div>
    </div>
  );
}

export function LaptopMockup({
  width = 1100,
  children,
}: {
  width?: number;
  children: React.ReactNode;
}) {
  const screenHeight = width * 0.6;
  const bezel = width * 0.018;
  const innerWidth = width - bezel * 2;
  const innerHeight = screenHeight - bezel * 2;
  return (
    <div style={{ width, filter: `drop-shadow(${shadow.deep})` }}>
      <div
        style={{
          width: "100%",
          height: screenHeight,
          background: "#111116",
          borderRadius: 18,
          padding: bezel,
          boxSizing: "border-box",
        }}
      >
        <div
          style={{
            position: "relative",
            width: "100%",
            height: "100%",
            borderRadius: 8,
            overflow: "hidden",
            background: "#F5F6FA",
          }}
        >
          <ScaledScreen nativeWidth={NATIVE_LAPTOP_WIDTH} screenWidth={innerWidth} screenHeight={innerHeight}>
            {children}
          </ScaledScreen>
        </div>
      </div>
      {/* Base / hinge */}
      <div
        style={{
          width: "108%",
          marginLeft: "-4%",
          height: width * 0.02,
          background: "linear-gradient(180deg, #D7D7E0, #B7B7C6)",
          borderRadius: "0 0 10px 10px",
        }}
      />
      <div
        style={{
          width: "24%",
          marginLeft: "38%",
          height: width * 0.008,
          background: "#9A9AAC",
          borderRadius: "0 0 6px 6px",
        }}
      />
    </div>
  );
}
