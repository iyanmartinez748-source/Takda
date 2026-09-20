import { Config } from "@remotion/cli/config";
import { existsSync } from "node:fs";

Config.setVideoImageFormat("jpeg");
Config.setOverwriteOutput(true);
Config.setPixelFormat("yuv420p");
Config.setCodec("h264");

// This container ships a pre-installed headless Chromium under
// /opt/pw-browsers (used by Playwright). Point Remotion at it instead of
// letting it try to download its own copy, which the sandboxed network may
// not allow. Optional: if the path doesn't exist (e.g. a developer's own
// machine), Remotion falls back to downloading/using its normal Chromium.
const CHROMIUM_CANDIDATES = [
  "/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell",
  "/opt/pw-browsers/chromium/chrome-linux/chrome",
];

const chromiumPath = CHROMIUM_CANDIDATES.find((p) => existsSync(p));
if (chromiumPath) {
  Config.setBrowserExecutable(chromiumPath);
}

Config.setChromiumOpenGlRenderer("angle");
