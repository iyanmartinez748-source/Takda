// Same two families the live app loads (FONT_LINK in App.jsx): Fraunces
// for display/headline text, Inter for UI/body text.
//
// Self-hosted from public/fonts instead of @remotion/google-fonts: this
// container's headless Chromium doesn't trust the sandbox's HTTPS-proxy CA
// for fonts.gstatic.com, so a network font fetch fails at render time. Both
// files were downloaded once from the same Google Fonts CSS the app itself
// loads (see public/fonts/README.md) and are variable fonts, so a single
// file covers all the weights used here.
import { loadFont } from "@remotion/fonts";
import { staticFile, delayRender, continueRender, cancelRender } from "remotion";

const handle = delayRender("Loading Fraunces + Inter");

Promise.all([
  loadFont({
    family: "Fraunces",
    url: staticFile("fonts/Fraunces-Variable.woff2"),
    weight: "500 700",
  }),
  loadFont({
    family: "Inter",
    url: staticFile("fonts/Inter-Variable.woff2"),
    weight: "400 700",
  }),
])
  .then(() => continueRender(handle))
  .catch((err) => cancelRender(err));

export const fontDisplay = "Fraunces";
export const fontBody = "Inter";
