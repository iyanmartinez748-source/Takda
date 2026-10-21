import React, { useEffect, useMemo, useRef, useState } from "react";
import ReactDOM from "react-dom/client";
import TakdaApp from "./App";
import { supabase } from "./lib/supabase";
import { installSupabaseStorageAdapter } from "./lib/storageAdapter";
import { unsubscribeFromPush } from "./lib/push";
import { detectBrowserTimeZone, shouldStoreDetectedTimeZone } from "./lib/timezone";
import AboutPage from "./public/AboutPage";
import PrivacyPage from "./public/PrivacyPage";
import privacyPolicyContent from "./public/privacyPolicyContent";
import TermsPage from "./public/TermsPage";
import termsOfServiceContent from "./public/termsOfServiceContent";
import HelpPage from "./public/HelpPage";
import "./index.css";

installSupabaseStorageAdapter();

/* =========================
   OTP + TURNSTILE FEATURE FLAG

   Build-time only (import.meta.env is replaced at build time by
   Vite, not readable/writable at runtime) — defaults OFF whenever
   VITE_ENABLE_OTP_AUTH is unset, so turning this on requires an
   explicit env var AND a new deployment, never a runtime toggle.
   While OFF, nothing below this point is reachable: the toggle link
   that would switch AuthScreen into OTP mode is not rendered at all
   when this is false (see AuthScreen), so the Turnstile script is
   never loaded and the existing password flows are completely
   unaffected.
========================= */

const OTP_AUTH_ENABLED =
  import.meta.env.VITE_ENABLE_OTP_AUTH === "true";

// Password-flow CAPTCHA (Step 51G.25B) — a SEPARATE flag from
// OTP_AUTH_ENABLED above, by design: production password users must
// never depend on the Preview-only OTP flag. Defaults OFF, so until
// this is explicitly set AND redeployed, signUp, signInWithPassword,
// and resetPasswordForEmail behave exactly as before this change —
// no Turnstile widget is mounted for the password screen and no
// captchaToken is sent.
const PASSWORD_CAPTCHA_ENABLED =
  import.meta.env.VITE_ENABLE_PASSWORD_CAPTCHA === "true";

/* =========================
   THEME STATE (Step 52B.3) — Classic-only foundation

   No CSS selector anywhere references `data-takda-theme` yet (see
   src/index.css), so applying this attribute changes no rendered
   pixel. Only "classic" is accepted today; a stored value naming any
   other theme (e.g. from a future rollback, or manual tampering) is
   rejected and falls back to "classic" — never passed through
   unchecked. Read-only for now: nothing writes to this key yet, since
   there is no selection UI to write from (see Root's lazy useState
   initializer below) — that comes later, alongside the first actual
   theme choice.
========================= */
const TAKDA_THEME_STORAGE_KEY = "takda-theme";
// Step 52C.3: "matcha" added to the allow-list so the CSS override
// block in index.css can be reached for manual QA (devtools attribute
// edit only — no picker UI, no localStorage write reads/writes this
// value in yet). readStoredTheme() above still only ever returns
// "classic" from a normal page load, since nothing writes "matcha" to
// TAKDA_THEME_STORAGE_KEY anywhere in this file.
const TAKDA_ALLOWED_THEMES = ["classic", "matcha"];

function readStoredTheme() {
  try {
    const raw = localStorage.getItem(TAKDA_THEME_STORAGE_KEY);
    return TAKDA_ALLOWED_THEMES.includes(raw) ? raw : "classic";
  } catch {
    // localStorage can throw (private browsing, blocked storage) —
    // never let a theme preference read crash the app.
    return "classic";
  }
}

/* =========================
   HELPERS
========================= */

function getInitials(name, email = "") {
  const source = name?.trim() || email?.trim() || "T";

  const parts = source
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);

  return parts
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

/* =========================
   PUBLIC LANDING PAGE
========================= */

function LandingPage({ onLogin, onSignup, onNavigateAbout, onNavigatePrivacy, onNavigateTerms, onNavigateHelp }) {
  const [legalPage, setLegalPage] = useState(null);

  const legalContent = {
    privacy: privacyPolicyContent,
    terms: termsOfServiceContent
  };

  const features = [
    ["📚", "Subjects", "Keep your classes, schedules, teachers, and rooms organized."],
    ["✅", "Activities", "Track assignments, projects, quizzes, and deadlines in one place."],
    ["📅", "Calendar", "See what is coming up so important schoolwork does not get missed."],
    ["📊", "Grade Tracker", "Record scores and quickly understand your performance per subject."],
    ["📝", "Notes", "Keep useful notes connected to your subjects and schoolwork."],
    ["📱", "Made for students", "A clean workspace that works on both phone and laptop."],
  ];

  return (
    <div className="min-h-screen bg-[#F7F8FC] text-[#1B1B2F]" style={{ fontFamily: '"Plus Jakarta Sans", Inter, ui-sans-serif, system-ui, sans-serif' }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Plus+Jakarta+Sans:wght@500;600;700;800&display=swap');`}</style>

      {legalPage && (
        <div className="fixed inset-0 z-[100] overflow-y-auto bg-black/40 p-4">
          <div className="flex min-h-full items-center justify-center">
            <div className="w-full max-w-2xl rounded-3xl bg-white p-6 shadow-xl sm:p-8">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-[#3D2FE0]">Takda</p>
                  <h2 className="mt-1 text-2xl font-extrabold">{legalContent[legalPage].title}</h2>
                </div>
                <button type="button" onClick={() => setLegalPage(null)} className="flex h-9 w-9 items-center justify-center rounded-full bg-[#F5F6FA] text-xl text-slate-500" aria-label="Close">×</button>
              </div>
              <div className="mt-6 space-y-4 text-sm leading-7 text-slate-600">
                {legalContent[legalPage].body.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
              </div>
              <p className="mt-6 text-xs text-slate-400">Last updated: September 2026</p>
              <button type="button" onClick={() => setLegalPage(null)} className="mt-6 w-full rounded-xl bg-[#3D2FE0] py-3 text-sm font-bold text-white sm:w-auto sm:px-6">Close</button>
            </div>
          </div>
        </div>
      )}
      <header className="sticky top-0 z-40 border-b border-[#E4E4F0] bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2.5">
            <img src="/takda-icon.png" alt="Takda" className="h-10 w-10 rounded-xl object-cover" />
            <span className="text-xl font-bold">Takda</span>
          </div>

          <div className="flex items-center gap-2">
            <button type="button" onClick={onLogin} className="rounded-xl px-3 py-2 text-sm font-semibold text-[#3D2FE0] sm:px-4">
              Log in
            </button>
            <button type="button" onClick={onSignup} className="rounded-xl bg-[#3D2FE0] px-3 py-2 text-sm font-semibold text-white shadow-sm sm:px-4">
              Get Started Free
            </button>
          </div>
        </div>
      </header>

      <main>
        <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-16 sm:px-6 md:grid-cols-2 md:py-24">
          <div>
            <div className="mb-4 inline-flex rounded-full border border-[#DCD9FF] bg-[#F0EEFF] px-3 py-1 text-xs font-semibold text-[#3D2FE0]">
              Your student workspace
            </div>
            <h1 className="text-4xl font-bold leading-tight sm:text-5xl md:text-6xl">
              Stay on top of school with <span className="text-[#3D2FE0]">Takda.</span>
            </h1>
            <p className="mt-5 max-w-xl text-base leading-7 text-slate-600 sm:text-lg">
              Manage your subjects, activities, deadlines, grades, calendar, and notes — all in one simple student workspace.
            </p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <button type="button" onClick={onSignup} className="rounded-xl bg-[#3D2FE0] px-6 py-3.5 text-sm font-semibold text-white shadow-sm">
                Get Started Free →
              </button>
              <button type="button" onClick={onLogin} className="rounded-xl border border-[#E4E4F0] bg-white px-6 py-3.5 text-sm font-semibold text-[#1B1B2F]">
                I already have an account
              </button>
            </div>
            <p className="mt-4 text-xs text-slate-400">Free to get started • Built for students</p>
          </div>

          <div className="rounded-3xl border border-[#E4E4F0] bg-white p-5 shadow-xl shadow-slate-200/50 sm:p-7">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-400">Good day 👋</p>
                <p className="text-xl font-bold">Your academic overview</p>
              </div>
              <img src="/takda-icon.png" alt="" className="h-11 w-11 rounded-xl object-cover" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              {[["📚", "Subjects", "6"], ["⏳", "Pending", "4"], ["✅", "Completed", "12"], ["📅", "Due Today", "2"]].map(([icon, label, value]) => (
                <div key={label} className="rounded-2xl border border-[#E4E4F0] p-4">
                  <span>{icon}</span>
                  <p className="mt-2 text-2xl font-bold">{value}</p>
                  <p className="text-xs text-slate-500">{label}</p>
                </div>
              ))}
            </div>
            <div className="mt-4 rounded-2xl bg-[#F5F6FA] p-4">
              <p className="text-xs font-semibold text-slate-500">UPCOMING DEADLINE</p>
              <div className="mt-2 flex items-center justify-between gap-3">
                <div>
                  <p className="font-semibold">Research Paper</p>
                  <p className="text-xs text-slate-400">Contemporary Issues</p>
                </div>
                <span className="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-[#3D2FE0]">Tomorrow</span>
              </div>
            </div>
          </div>
        </section>

        <section className="border-y border-[#E4E4F0] bg-white py-16 sm:py-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="mx-auto mb-10 max-w-2xl text-center">
              <p className="text-sm font-semibold text-[#3D2FE0]">EVERYTHING IN ONE PLACE</p>
              <h2 className="mt-2 text-3xl font-bold sm:text-4xl">Less school chaos. More focus.</h2>
              <p className="mt-3 text-slate-500">Takda gives students the essentials for organizing academic life without making things complicated.</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {features.map(([icon, title, description]) => (
                <div key={title} className="rounded-2xl border border-[#E4E4F0] p-5">
                  <div className="mb-3 text-2xl">{icon}</div>
                  <h3 className="font-bold">{title}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-500">{description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-4xl px-4 py-16 text-center sm:px-6 sm:py-20">
          <div className="rounded-3xl bg-[#1B1B2F] px-6 py-10 text-white sm:px-10">
            <h2 className="text-3xl font-bold">Ready to organize your school life?</h2>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-slate-300">Create your Takda account and start managing your academic work from one place.</p>
            <button type="button" onClick={onSignup} className="mt-6 rounded-xl bg-white px-6 py-3 text-sm font-bold text-[#3D2FE0]">
              Create Free Account
            </button>
          </div>
        </section>
      </main>

      <footer className="border-t border-[#E4E4F0] bg-white">
        <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <img src="/takda-icon.png" alt="Takda" className="h-9 w-9 rounded-xl object-cover" />
              <div>
                <p className="text-sm font-extrabold text-[#1B1B2F]">Takda</p>
                <p className="text-xs text-slate-400">Plan • Track • Finish</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-x-5 gap-y-3 text-xs font-semibold text-slate-500">
              <a href="/about" onClick={(event) => { event.preventDefault(); onNavigateAbout(); }} className="hover:text-[#3D2FE0]">About</a>
              <a href="/privacy" onClick={(event) => { event.preventDefault(); onNavigatePrivacy(); }} className="hover:text-[#3D2FE0]">Privacy Policy</a>
              <a href="/terms" onClick={(event) => { event.preventDefault(); onNavigateTerms(); }} className="hover:text-[#3D2FE0]">Terms of Service</a>
              <a href="/help" onClick={(event) => { event.preventDefault(); onNavigateHelp(); }} className="hover:text-[#3D2FE0]">Help / FAQ</a>
              <a href="mailto:iyanmartinez748@gmail.com?subject=Takda%20Support" className="hover:text-[#3D2FE0]">Contact / Support</a>
            </div>
          </div>
          <div className="mt-6 border-t border-[#E4E4F0] pt-5 text-xs text-slate-400">
            © {new Date().getFullYear()} Takda. Built for students.
          </div>
        </div>
      </footer>
    </div>
  );
}

/* =========================
   CLOUDFLARE TURNSTILE (OTP auth only)

   Minimal, dependency-free integration: loads Cloudflare's own script
   tag on demand (no npm package added, per Step 51D.3's instruction
   to prefer existing browser APIs) and renders/resets the widget via
   window.turnstile. Only ever mounted from inside the OTP email-entry
   screen below, which itself only renders when OTP_AUTH_ENABLED is
   true — so this script is never requested at all for the existing
   password flows, today or with the flag off.
========================= */

let turnstileScriptPromise = null;

function loadTurnstileScript() {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.turnstile) return Promise.resolve();
  if (turnstileScriptPromise) return turnstileScriptPromise;

  turnstileScriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js";
    script.async = true;
    script.defer = true;

    script.onload = () => resolve();

    script.onerror = () => {
      // Step 51D.9 fix: clear the module-level cache AND remove the
      // failed element — without this, the rejected promise above
      // would be returned forever by every future call (the
      // `if (turnstileScriptPromise) return turnstileScriptPromise;`
      // guard above), permanently preventing any real retry and
      // leaving a dead <script> tag behind. A future call now
      // genuinely attempts a fresh load. The success path (onload)
      // is unchanged — a successful load is still cached forever, as
      // intended.
      turnstileScriptPromise = null;
      script.remove();
      reject(new Error("Unable to load Turnstile."));
    };

    document.head.appendChild(script);
  });

  return turnstileScriptPromise;
}

// siteKey is a PUBLIC Turnstile site key (analogous to a reCAPTCHA
// site key) — never a secret — read from an env var that is not yet
// set anywhere in this repo, so this gracefully reports "not
// configured" instead of silently proceeding insecurely until that
// var is deliberately added in a separate, approved step.
//
// Step 51D.7 stability fix: auto-retry on a genuine CAPTCHA error is
// now internally bounded (max 2 consecutive errors) and tracked
// separately from normal token expiration, which is never an error
// and is never rate-limited — distinguishing the two is the point of
// this whole redesign. After the limit is hit, this component stops
// re-rendering itself automatically and instead shows its own
// accessible error message with a manual "Retry CAPTCHA" button; only
// that explicit user action clears the error count and tries again,
// so a persistent failure can never auto-loop, while a user-initiated
// retry is never artificially blocked.
function TurnstileWidget({ siteKey, onVerify, onExpire, onError, resetSignal }) {
  const containerRef = useRef(null);
  const widgetIdRef = useRef(null);
  const errorCountRef = useRef(0);
  const [loadError, setLoadError] = useState("");
  // Step 51D.9: distinct from loadError's text — tracks specifically
  // whether the *script itself* failed to load (recoverable by
  // retrying) versus the siteKey being absent (a build-time
  // configuration fact a retry cannot change). Only the former shows
  // a retry button, per requirement 9.
  const [scriptLoadFailed, setScriptLoadFailed] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [renderGeneration, setRenderGeneration] = useState(0);

  // Shared manual-retry path for BOTH recoverable failure modes this
  // component can show a button for: a blocked widget-challenge
  // error state, and a failed script load. Always gets a clean
  // slate — nothing here is merely paused — so a retry can never
  // itself count toward a future auto-block or replay a stale error.
  function retryManually() {
    errorCountRef.current = 0;
    setBlocked(false);
    setLoadError("");
    setScriptLoadFailed(false);
    setRenderGeneration((n) => n + 1);
  }

  useEffect(() => {
    if (!siteKey) {
      setLoadError("CAPTCHA is not configured for this environment.");
      setScriptLoadFailed(false);
      return;
    }

    if (blocked) {
      // Do not auto-render while blocked, regardless of which
      // dependency changed (resetSignal from a send attempt, or this
      // effect's own renderGeneration) — only retryManually(), which
      // clears `blocked` first, may request a new challenge now.
      return;
    }

    let cancelled = false;

    loadTurnstileScript()
      .then(() => {
        if (cancelled || !containerRef.current || !window.turnstile) {
          return;
        }

        widgetIdRef.current = window.turnstile.render(
          containerRef.current,
          {
            sitekey: siteKey,
            callback: (token) => {
              // Requirement 8: a callback firing after this effect
              // run was cleaned up (widget already removed/replaced)
              // must never update state for the widget that's no
              // longer current.
              if (cancelled) return;

              errorCountRef.current = 0; // requirement 7
              onVerify(token);
            },
            "expired-callback": () => {
              if (cancelled) return;

              // Requirement 3: ordinary expiry is not an error and
              // never counts toward the retry limit — always safe to
              // auto-request a fresh challenge.
              onExpire();
              setRenderGeneration((n) => n + 1);
            },
            "error-callback": () => {
              if (cancelled) return;

              onError();
              errorCountRef.current += 1;

              if (errorCountRef.current > 2) {
                // Requirements 2/4/5: stop auto-retrying after 2
                // consecutive genuine errors — surface the manual
                // recovery path instead of looping a 3rd time.
                setBlocked(true);
              } else {
                setRenderGeneration((n) => n + 1);
              }
            },
          }
        );
      })
      .catch(() => {
        // Requirement 6: a rejection arriving after this effect run
        // was cleaned up must never update state for a widget that's
        // no longer current.
        if (!cancelled) {
          setLoadError(
            "Unable to load CAPTCHA. Check your connection and try again."
          );
          setScriptLoadFailed(true);
        }
      });

    return () => {
      cancelled = true;

      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteKey, resetSignal, renderGeneration, blocked]);

  if (blocked) {
    return (
      <div className="space-y-2 text-center">
        <p className="text-xs text-red-600" role="alert">
          CAPTCHA verification failed repeatedly. Please try again.
        </p>

        <button
          type="button"
          onClick={retryManually}
          className="text-xs font-semibold text-[#3D2FE0] underline"
        >
          Retry CAPTCHA
        </button>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="space-y-2 text-center">
        <p className="text-xs text-red-600" role="alert">
          {loadError}
        </p>

        {/* Requirement 9: no retry button when siteKey is simply
            absent — that's a configuration fact, not something a
            retry can fix, and offering one here would be misleading. */}
        {scriptLoadFailed && (
          <button
            type="button"
            onClick={retryManually}
            className="text-xs font-semibold text-[#3D2FE0] underline"
          >
            Retry CAPTCHA
          </button>
        )}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="flex justify-center"
    />
  );
}

/* =========================
   LOGIN / SIGN UP
========================= */

function AuthScreen({ initialMode = "login", onBack, pendingOtpProfileRef }) {
  const [mode, setMode] = useState(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  // Re-entrancy lock (Step 51G.25C) — a single ref, synchronous (no
  // render/commit delay unlike `loading` state), shared across
  // submit() [login + signup] and forgotPassword(), since all three
  // read the same passwordCaptchaToken below. Closes the gap where
  // two overlapping calls — e.g. a double click, or "Log in" and
  // "Forgot password?" triggered close together — could both read
  // and send the identical single-use token before either reached
  // its finally block. A ref (not state) is used deliberately: it is
  // readable/writable synchronously within the same event-handler
  // call, with no dependency on a React re-render having committed.
  const authRequestLockRef = useRef(false);

  // OTP auth state (Step 51D.3) — inert unless OTP_AUTH_ENABLED and
  // the user explicitly switches authMethod to "otp"; the existing
  // password state/handlers above are completely untouched.
  const [authMethod, setAuthMethod] = useState("password");
  const [otpStage, setOtpStage] = useState("email");
  const [otpCode, setOtpCode] = useState("");
  const [captchaToken, setCaptchaToken] = useState("");
  const [captchaResetSignal, setCaptchaResetSignal] = useState(0);
  const [resendCooldown, setResendCooldown] = useState(0);

  // OTP signup profile fields (Step 51G.26B) — collected on the OTP
  // email-entry screen itself, only shown/used when mode === "signup".
  // Plain component state: this screen never unmounts/remounts across
  // a resend, a wrong code, or any recoverable error (only otpStage
  // toggles between "email" and "code" within the same mounted
  // AuthScreen instance), so these values survive all of that for
  // free, the same way `email` already does. Not used, and not
  // cleared, while in login mode or password mode — simply inert.
  const [otpFullName, setOtpFullName] = useState("");
  const [otpSchool, setOtpSchool] = useState("");
  const [otpCourse, setOtpCourse] = useState("");
  const [otpYearLevel, setOtpYearLevel] = useState("");

  // Password signup profile fields (Step 51G.29C) — UI/validation
  // only, deliberately kept separate from the OTP fields above rather
  // than shared: this screen's submit() does not yet read or persist
  // these (profile persistence for this path is a separate, later,
  // explicitly-scoped step — see Step 51G.29B's assessment). Plain
  // component state, same survives-resend/retry property as every
  // other field on this screen already has; only shown and validated
  // when mode === "signup" and authMethod === "password".
  const [signupFullName, setSignupFullName] = useState("");
  const [signupSchool, setSignupSchool] = useState("");
  const [signupCourse, setSignupCourse] = useState("");
  const [signupYearLevel, setSignupYearLevel] = useState("");

  // Password-flow CAPTCHA state (Step 51G.25B) — deliberately separate
  // from the OTP captchaToken/captchaResetSignal above, even though
  // both use the same TurnstileWidget component. Shared across login,
  // signup, and forgotPassword, since all three live on this same
  // password screen and use the same email field; inert whenever
  // PASSWORD_CAPTCHA_ENABLED is false.
  const [passwordCaptchaToken, setPasswordCaptchaToken] = useState("");
  const [passwordCaptchaResetSignal, setPasswordCaptchaResetSignal] =
    useState(0);

  useEffect(() => {
    if (resendCooldown <= 0) return;

    const timer = setTimeout(
      () => setResendCooldown((s) => s - 1),
      1000
    );

    return () => clearTimeout(timer);
  }, [resendCooldown]);

  function resetOtpFlow() {
    setAuthMethod("password");
    setOtpStage("email");
    setOtpCode("");
    setCaptchaToken("");
    setMessage("");

    // Step 51G.26E: explicit cancellation of the OTP flow — clear the
    // collected profile fields AND the hand-off ref together, so
    // abandoned signup data can never later be picked up by an
    // unrelated sign-in for the same email via a different auth
    // method (Item 2 fix).
    setOtpFullName("");
    setOtpSchool("");
    setOtpCourse("");
    setOtpYearLevel("");

    if (pendingOtpProfileRef) {
      pendingOtpProfileRef.current = null;
    }
  }

  // Change Email (Step 51D.5 fix): returns to the OTP email-entry
  // step WITHOUT leaving OTP mode — distinct from resetOtpFlow above,
  // which exits back to the password form. Also forces a fresh
  // Turnstile render (bumping the reset signal) so a new token is
  // ready for whatever email is entered next.
  function goBackToOtpEmailStage() {
    setOtpStage("email");
    setOtpCode("");
    setCaptchaToken("");
    setCaptchaResetSignal((n) => n + 1);
    setMessage("");
  }

  async function sendOtpCode() {
    // Requirement 2 (Step 51G.26B): validate the signup profile
    // fields before ever sending a code — mirrors ProfileSetup's own
    // validation messages/order exactly, so the experience is
    // consistent whichever path a user ends up completing a profile
    // through. Login mode never collects these fields, so this block
    // is a no-op for login — unchanged from before this step.
    if (mode === "signup") {
      if (!otpFullName.trim()) {
        setMessage("Please enter your full name.");
        return;
      }

      if (!otpCourse.trim()) {
        setMessage("Please enter your program or course.");
        return;
      }

      if (!otpYearLevel.trim()) {
        setMessage("Please enter your year or grade level.");
        return;
      }
    }

    setLoading(true);
    setMessage("");

    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: {
          // Requirement: shouldCreateUser:true only for signup, false
          // for login — a login attempt for an unregistered email is
          // rejected rather than silently creating an account.
          shouldCreateUser: mode === "signup",
          captchaToken: captchaToken || undefined,
        },
      });

      if (error) {
        const text = (error.message || "").toLowerCase();

        if (error.status === 429) {
          throw new Error(
            "Too many requests. Please wait before trying again."
          );
        }

        if (text.includes("captcha")) {
          throw new Error(
            "CAPTCHA verification failed. Please try again."
          );
        }

        if (
          text.includes("network") ||
          text.includes("fetch") ||
          text.includes("connection")
        ) {
          throw new Error(
            "Network error. Please check your connection and try again."
          );
        }

        // Account-enumeration safety (login/shouldCreateUser:false
        // only): deliberately never surface Supabase's raw error text
        // here, since it may distinguish "no account for this email"
        // from other failures. Phrased conditionally — never asserts
        // delivery as fact, so this does NOT falsely claim a code was
        // sent. KNOWN, DOCUMENTED LIMITATION (not claimed away): the
        // user still sees this error state rather than the "code
        // sent" screen shown on real success, so the state transition
        // itself remains a lesser signal this client-side change
        // cannot fully eliminate without the server returning a
        // uniform response for both cases — see Step 51D.5 report.
        if (mode === "login") {
          throw new Error(
            "If an account exists for this email, a code has been sent. Double-check the email address, or sign up if you don't have an account yet."
          );
        }

        throw error;
      }

      setOtpStage("code");
      setResendCooldown(60);
      setMessage(
        "We sent a 6-digit code to your email. Enter it below to continue."
      );
    } catch (err) {
      setMessage(
        err.message || "Unable to send the code. Please try again."
      );
    } finally {
      // Turnstile tokens are single-use — always reset for the next
      // attempt (a resend, or a retry after an error) regardless of
      // outcome. The widget now stays mounted across both the email
      // and code stages (see JSX below), so a fresh token can always
      // be produced here without needing to unmount/remount it.
      setCaptchaToken("");
      setCaptchaResetSignal((n) => n + 1);
      setLoading(false);
    }
  }

  async function verifyOtpCode(e) {
    e.preventDefault();

    // Step 51G.26C: hand off the collected signup fields to Root
    // BEFORE calling verifyOtp below — Root's onAuthStateChange
    // listener (a separate subscriber to the SIGNED_IN event this
    // call is about to produce) is the only thing that reads, saves,
    // and clears this; AuthScreen never saves it directly any more,
    // which is what removes the two-subscriber race from Step
    // 51G.26B's version. Written synchronously, so it is guaranteed
    // to be in place before the async verifyOtp() call below can
    // possibly trigger that listener. Login mode, or a signup with no
    // fullName entered (defensive — sendOtpCode's own validation
    // should already prevent this), intentionally leaves the ref
    // untouched: Root's existing checkProfile -> ProfileSetup
    // fallback handles those cases exactly as before this step.
    if (pendingOtpProfileRef && mode === "signup" && otpFullName.trim()) {
      pendingOtpProfileRef.current = {
        email: email.trim(),
        fullName: otpFullName,
        school: otpSchool,
        course: otpCourse,
        yearLevel: otpYearLevel,
      };
    }

    setLoading(true);
    setMessage("");

    try {
      const { error } = await supabase.auth.verifyOtp({
        email: email.trim(),
        token: otpCode.trim(),
        type: "email",
      });

      if (error) {
        const text = error.message.toLowerCase();

        if (
          text.includes("expired") ||
          text.includes("invalid") ||
          text.includes("token")
        ) {
          throw new Error(
            "That code is incorrect or has expired. Request a new one."
          );
        }

        throw error;
      }

      // Success: verifyOtp establishes a session exactly like any
      // other Supabase Auth call, which the existing
      // onAuthStateChange listener already picks up via its
      // SIGNED_IN branch — now via applySignedInUser(), which
      // consumes the hand-off above (if any) before ever deciding
      // needsProfile. Note on timing: Supabase Auth may already have
      // created an unconfirmed user record for this email back when
      // sendOtpCode() called signInWithOtp with
      // shouldCreateUser:true — that is a separate fact from, and
      // earlier than, this point. Nothing in this file ever reads
      // that as evidence of verification; the save Root performs
      // only runs after THIS verifyOtp() call has already succeeded.
    } catch (err) {
      setMessage(err.message || "Unable to verify the code.");
    } finally {
      setLoading(false);
    }
  }

  async function submit(e) {
    e.preventDefault();

    // Step 51G.29C: client-side profile-field validation for the
    // password signup form ONLY — login mode never shows or needs
    // these fields, so this block is a complete no-op for login,
    // exactly mirroring how sendOtpCode() already validates OTP's own
    // equivalent fields before doing anything else. UI/validation
    // only: nothing here touches signUp()'s arguments, the CAPTCHA
    // guard below, or any database write — a validation failure
    // simply returns, leaving every already-entered field (including
    // these) exactly as the user left them, since no state is cleared
    // on this path.
    if (mode === "signup") {
      if (!signupFullName.trim()) {
        setMessage("Please enter your full name.");
        return;
      }

      if (!signupCourse.trim()) {
        setMessage("Please enter your program or course.");
        return;
      }

      if (!signupYearLevel.trim()) {
        setMessage("Please enter your year or grade level.");
        return;
      }

      // Step 51G.29BK: explicit JS-level backstop matching the input's
      // own native minLength={6} — the disabled-button guard in the JSX
      // below covers the normal click path, but this still protects any
      // submit that reaches this handler (e.g. a programmatic submit)
      // without a password of the required length. Checked on the raw
      // password value, never trimmed/normalized, since a password's
      // whitespace is significant and must reach signUp() unchanged.
      if (password.length < 6) {
        setMessage("Password must be at least 6 characters.");
        return;
      }
    }

    // Requirement 5 (Step 51G.25B): defensive, in addition to the
    // disabled-button guard in the JSX below — never attempt a
    // protected request without a token when the flag is on.
    if (PASSWORD_CAPTCHA_ENABLED && !passwordCaptchaToken) {
      setMessage("Please complete the CAPTCHA challenge first.");
      return;
    }

    // Step 51G.25C: reject an overlapping attempt outright — before
    // the token is read for a request, before setLoading/setMessage
    // touch anything, and without consuming the single-use token.
    // Checked and set synchronously, so a second call arriving before
    // any re-render commits still sees the lock held.
    if (authRequestLockRef.current) return;
    authRequestLockRef.current = true;

    setLoading(true);
    setMessage("");

    try {
      if (mode === "signup") {
        // Step 51G.29E (Part A): carries the already-validated profile
        // fields (validated above, before this function ever reaches
        // this point) through Supabase Auth's own user_metadata —
        // written to the auth.users record at signUp() time regardless
        // of email-confirmation status, so it survives confirmation on
        // a different browser/device without any URL or local-storage
        // transport. Deliberately NEVER includes `password` or
        // `captchaToken` — those remain exactly where they already
        // were (the top-level signUp() argument and `options.captchaToken`
        // respectively), untouched by this addition. Snake_case keys
        // chosen to match the public.profiles column names this data
        // will eventually be written to (see reconcilePasswordSignupProfile
        // in Root below), making the shape self-describing wherever it's
        // inspected (e.g. the Supabase Auth dashboard).
        const { error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            emailRedirectTo: window.location.origin,
            captchaToken: passwordCaptchaToken || undefined,
            data: {
              full_name: signupFullName.trim(),
              // Kept as a plain string (possibly empty), never null —
              // matches the existing convention upsertProfile() and
              // the OTP signup path already use (school is always a
              // string there too; upsertProfile() itself is the one
              // place that converts an empty string to a stored NULL,
              // via `school.trim() || null`). Storing null here would
              // make that same `.trim()` call throw downstream.
              school: signupSchool.trim(),
              course: signupCourse.trim(),
              year_level: signupYearLevel.trim(),
            },
          },
        });

        if (error) {
          const text = (error.message || "").toLowerCase();

          if (text.includes("captcha")) {
            throw new Error(
              "CAPTCHA verification failed. Please try again."
            );
          }

          throw error;
        }

        setMessage(
          "Account created. Please check your email and confirm your account."
        );
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
          options: {
            captchaToken: passwordCaptchaToken || undefined,
          },
        });

        if (error) {
          const text = error.message.toLowerCase();

          if (text.includes("invalid login credentials")) {
            throw new Error("Incorrect email or password.");
          }

          if (text.includes("email not confirmed")) {
            throw new Error(
              "Your email is not confirmed yet. Please check your inbox."
            );
          }

          if (text.includes("captcha")) {
            throw new Error(
              "CAPTCHA verification failed. Please try again."
            );
          }

          throw error;
        }
      }
    } catch (err) {
      setMessage(err.message || "Something went wrong.");
    } finally {
      // Requirement 6 (Step 51G.25B): Turnstile tokens are single-use
      // — always clear and request a fresh one after any attempt,
      // success or failure, exactly like the OTP flow's sendOtpCode()
      // already does. A no-op (both sides already empty/0-driven)
      // whenever PASSWORD_CAPTCHA_ENABLED is false, since nothing
      // mounts the widget to produce a token in that case.
      setPasswordCaptchaToken("");
      setPasswordCaptchaResetSignal((n) => n + 1);
      setLoading(false);
      authRequestLockRef.current = false;
    }
  }

  async function forgotPassword() {
    if (!email.trim()) {
      setMessage("Enter your email address first.");
      return;
    }

    // Requirement 5 (Step 51G.25B), same guard as submit() above.
    // Requirement 7: this shares passwordCaptchaToken/widget with
    // submit() above rather than needing a form of its own — the
    // single password-screen-level widget (mounted below in the JSX,
    // not nested inside <form onSubmit={submit}>) already covers
    // login, signup, AND this reset action.
    if (PASSWORD_CAPTCHA_ENABLED && !passwordCaptchaToken) {
      setMessage("Please complete the CAPTCHA challenge first.");
      return;
    }

    // Step 51G.25C: same shared lock as submit() above — covers the
    // cross-function race too (e.g. "Log in" and "Forgot password?"
    // triggered close together would otherwise both read the same
    // passwordCaptchaToken before either's finally cleared it).
    if (authRequestLockRef.current) return;
    authRequestLockRef.current = true;

    setLoading(true);
    setMessage("");

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(
        email.trim(),
        {
          redirectTo: window.location.origin,
          captchaToken: passwordCaptchaToken || undefined,
        }
      );

      if (error) {
        if (error.status === 429) {
          throw new Error(
            "Too many password reset requests. Please wait before trying again."
          );
        }

        const text = (error.message || "").toLowerCase();

        if (text.includes("captcha")) {
          throw new Error(
            "CAPTCHA verification failed. Please try again."
          );
        }

        throw error;
      }

      setMessage(
        "Password reset email sent. Please check your inbox and spam folder."
      );
    } catch (err) {
      setMessage(
        err.message || "Unable to send password reset email."
      );
    } finally {
      // Requirement 6, same single-use-token refresh as submit().
      setPasswordCaptchaToken("");
      setPasswordCaptchaResetSignal((n) => n + 1);
      setLoading(false);
      authRequestLockRef.current = false;
    }
  }

  return (
    <div className="min-h-screen bg-[#F5F6FA] flex items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-2xl border border-[#E4E4F0] bg-white p-6 shadow-sm">

        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="mb-4 text-sm font-semibold text-[#3D2FE0]"
          >
            ← Back to Takda
          </button>
        )}

        <div className="mb-6 text-center">
          <img
            src="/takda-icon.png"
            alt="Takda"
            className="mx-auto mb-3 h-14 w-14 rounded-2xl object-cover shadow-sm"
          />

          <h1 className="text-2xl font-bold text-[#1B1B2F]">
            Takda
          </h1>

          <p className="mt-1 text-sm text-slate-500">
            Your academic task manager
          </p>
        </div>

        {authMethod === "password" && (
          <form onSubmit={submit} className="space-y-3">

            {/* Step 51G.29C: full registration fields shown inline on
                the password signup form itself — reusing the exact
                same field set, order, placeholders, and validation
                wording already established for the OTP signup screen
                (see otpFullName/otpSchool/otpCourse/otpYearLevel
                above), so the experience is consistent across both
                signup paths. Login mode never shows or needs these;
                gated purely on `mode`, independent of authMethod,
                OTP_AUTH_ENABLED, and PASSWORD_CAPTCHA_ENABLED. */}
            {mode === "signup" && (
              <input
                type="text"
                required
                value={signupFullName}
                onChange={(e) => setSignupFullName(e.target.value)}
                placeholder="Full name"
                autoComplete="name"
                className="w-full rounded-xl border border-[#E4E4F0] px-3 py-3 text-sm outline-none focus:border-[#3D2FE0]"
              />
            )}

            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email address"
              autoComplete="email"
              className="w-full rounded-xl border border-[#E4E4F0] px-3 py-3 text-sm outline-none focus:border-[#3D2FE0]"
            />

            {mode === "signup" && (
              <>
                <input
                  type="text"
                  value={signupSchool}
                  onChange={(e) => setSignupSchool(e.target.value)}
                  placeholder="School (optional)"
                  className="w-full rounded-xl border border-[#E4E4F0] px-3 py-3 text-sm outline-none focus:border-[#3D2FE0]"
                />

                <input
                  type="text"
                  required
                  value={signupCourse}
                  onChange={(e) => setSignupCourse(e.target.value)}
                  placeholder="Program / Track"
                  className="w-full rounded-xl border border-[#E4E4F0] px-3 py-3 text-sm outline-none focus:border-[#3D2FE0]"
                />

                <input
                  type="text"
                  required
                  value={signupYearLevel}
                  onChange={(e) => setSignupYearLevel(e.target.value)}
                  placeholder="Year / Grade level"
                  className="w-full rounded-xl border border-[#E4E4F0] px-3 py-3 text-sm outline-none focus:border-[#3D2FE0]"
                />
              </>
            )}

            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                autoComplete={
                  mode === "login"
                    ? "current-password"
                    : "new-password"
                }
                className="w-full rounded-xl border border-[#E4E4F0] px-3 py-3 pr-16 text-sm outline-none focus:border-[#3D2FE0]"
              />

              <button
                type="button"
                onClick={() => setShowPassword((current) => !current)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-[#3D2FE0]"
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>

            {mode === "login" && (
              <button
                type="button"
                onClick={forgotPassword}
                disabled={
                  loading ||
                  (PASSWORD_CAPTCHA_ENABLED && !passwordCaptchaToken)
                }
                className="w-full text-right text-xs font-medium text-[#3D2FE0] disabled:opacity-50"
              >
                Forgot password?
              </button>
            )}

            <button
              type="submit"
              disabled={
                loading ||
                (PASSWORD_CAPTCHA_ENABLED && !passwordCaptchaToken) ||
                (mode === "signup" &&
                  (!signupFullName.trim() ||
                    !signupCourse.trim() ||
                    !signupYearLevel.trim() ||
                    password.length < 6))
              }
              className="w-full rounded-xl bg-[#3D2FE0] py-3 text-sm font-semibold text-white disabled:opacity-50"
            >
              {loading
                ? "Please wait..."
                : mode === "login"
                ? "Log in"
                : "Create account"}
            </button>

            {/* Password-flow CAPTCHA (Step 51G.25B) — independent
                widget instance from the OTP one below, gated by its
                own PASSWORD_CAPTCHA_ENABLED flag (default OFF).
                Mounted inside this form so it unmounts/remounts with
                it, but shared by login, signup, AND the
                forgotPassword button above via passwordCaptchaToken
                — none of these three actions needs its own widget. */}
            {PASSWORD_CAPTCHA_ENABLED && (
              <TurnstileWidget
                siteKey={import.meta.env.VITE_TURNSTILE_SITE_KEY}
                resetSignal={passwordCaptchaResetSignal}
                onVerify={(token) => setPasswordCaptchaToken(token)}
                onExpire={() => setPasswordCaptchaToken("")}
                onError={() => setPasswordCaptchaToken("")}
              />
            )}
          </form>
        )}

        {/* OTP_AUTH_ENABLED gate: this toggle, and everything inside
            authMethod === "otp" below, is entirely absent from the
            rendered tree — not merely hidden — whenever the flag is
            off. The Turnstile script is therefore never requested and
            the password form above is completely unaffected either
            way. */}
        {OTP_AUTH_ENABLED && authMethod === "password" && (
          <button
            type="button"
            onClick={() => {
              setAuthMethod("otp");
              setOtpStage("email");
              setMessage("");
            }}
            className="mt-3 w-full text-center text-xs font-medium text-[#3D2FE0]"
          >
            Use a one-time email code instead
          </button>
        )}

        {/* Fix (Step 51D.5): the Turnstile widget now stays mounted
            for the whole OTP flow (both stages), not just the email
            step — otherwise no fresh token could ever be produced for
            a resend, since Turnstile tokens are single-use and the
            widget would have been unmounted along with the email
            stage. Kept as one shared block so it survives the
            email<->code stage transition without unmounting. */}
        {OTP_AUTH_ENABLED && authMethod === "otp" && (
          <TurnstileWidget
            siteKey={import.meta.env.VITE_TURNSTILE_SITE_KEY}
            resetSignal={captchaResetSignal}
            onVerify={(token) => setCaptchaToken(token)}
            // Step 51D.7: the widget now manages its own retry/backoff
            // internally (bounded auto-retry, then a manual Retry
            // button) — this parent callback only needs to clear the
            // token so Send/Resend correctly stay disabled; it no
            // longer also drives re-rendering, avoiding a second,
            // redundant re-render trigger alongside the widget's own.
            onExpire={() => setCaptchaToken("")}
            onError={() => setCaptchaToken("")}
          />
        )}

        {OTP_AUTH_ENABLED && authMethod === "otp" && otpStage === "email" && (
          <div className="space-y-3">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email address"
              autoComplete="email"
              className="w-full rounded-xl border border-[#E4E4F0] px-3 py-3 text-sm outline-none focus:border-[#3D2FE0]"
            />

            {/* Step 51G.26B: collected here, in the initial OTP
                signup form, instead of a separate post-signup
                ProfileSetup screen — same four fields, same
                required/optional split, reusing upsertProfile() in
                verifyOtpCode() above on success. Login mode never
                shows or needs these. */}
            {mode === "signup" && (
              <>
                <input
                  type="text"
                  required
                  value={otpFullName}
                  onChange={(e) => setOtpFullName(e.target.value)}
                  placeholder="Full name"
                  autoComplete="name"
                  className="w-full rounded-xl border border-[#E4E4F0] px-3 py-3 text-sm outline-none focus:border-[#3D2FE0]"
                />

                <input
                  type="text"
                  value={otpSchool}
                  onChange={(e) => setOtpSchool(e.target.value)}
                  placeholder="School (optional)"
                  className="w-full rounded-xl border border-[#E4E4F0] px-3 py-3 text-sm outline-none focus:border-[#3D2FE0]"
                />

                <input
                  type="text"
                  required
                  value={otpCourse}
                  onChange={(e) => setOtpCourse(e.target.value)}
                  placeholder="Program / Track"
                  className="w-full rounded-xl border border-[#E4E4F0] px-3 py-3 text-sm outline-none focus:border-[#3D2FE0]"
                />

                <input
                  type="text"
                  required
                  value={otpYearLevel}
                  onChange={(e) => setOtpYearLevel(e.target.value)}
                  placeholder="Year / Grade level"
                  className="w-full rounded-xl border border-[#E4E4F0] px-3 py-3 text-sm outline-none focus:border-[#3D2FE0]"
                />
              </>
            )}

            <button
              type="button"
              onClick={sendOtpCode}
              disabled={
                loading ||
                !email.trim() ||
                !captchaToken ||
                (mode === "signup" &&
                  (!otpFullName.trim() ||
                    !otpCourse.trim() ||
                    !otpYearLevel.trim()))
              }
              className="w-full rounded-xl bg-[#3D2FE0] py-3 text-sm font-semibold text-white disabled:opacity-50"
            >
              {loading ? "Sending code..." : "Send code"}
            </button>

            <button
              type="button"
              onClick={resetOtpFlow}
              disabled={loading}
              className="w-full text-center text-xs font-medium text-[#3D2FE0] disabled:opacity-50"
            >
              Use password instead
            </button>
          </div>
        )}

        {OTP_AUTH_ENABLED && authMethod === "otp" && otpStage === "code" && (
          <form onSubmit={verifyOtpCode} className="space-y-3">
            <label className="block text-center text-xs text-slate-500">
              Enter the 6-digit code sent to {email}
            </label>

            <input
              type="text"
              required
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              value={otpCode}
              onChange={(e) =>
                setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))
              }
              placeholder="000000"
              autoComplete="one-time-code"
              className="w-full rounded-xl border border-[#E4E4F0] px-3 py-3 text-center text-lg tracking-widest outline-none focus:border-[#3D2FE0]"
            />

            <button
              type="submit"
              disabled={loading || otpCode.length !== 6}
              className="w-full rounded-xl bg-[#3D2FE0] py-3 text-sm font-semibold text-white disabled:opacity-50"
            >
              {loading ? "Verifying..." : "Verify"}
            </button>

            <button
              type="button"
              onClick={sendOtpCode}
              disabled={loading || resendCooldown > 0 || !captchaToken}
              className="w-full text-center text-xs font-medium text-[#3D2FE0] disabled:opacity-50"
            >
              {resendCooldown > 0
                ? `Resend code in ${resendCooldown}s`
                : !captchaToken
                ? "Waiting for CAPTCHA..."
                : "Resend code"}
            </button>

            <button
              type="button"
              onClick={goBackToOtpEmailStage}
              disabled={loading}
              className="w-full text-center text-xs font-medium text-slate-400"
            >
              Change email
            </button>
          </form>
        )}

        {message && (
          <p className="mt-3 text-center text-xs text-slate-600">
            {message}
          </p>
        )}

        <button
          type="button"
          onClick={() => {
            setMode((current) =>
              current === "login" ? "signup" : "login"
            );

            setMessage("");
            setPassword("");
            setShowPassword(false);
            setAuthMethod("password");
            setOtpStage("email");
            setOtpCode("");
            setCaptchaToken("");
            setOtpFullName("");
            setOtpSchool("");
            setOtpCourse("");
            setOtpYearLevel("");

            // Step 51G.29C: clear the password-signup profile fields
            // on the same login/signup toggle, for the same reason —
            // avoids stale entered values lingering if a user fills
            // this form, switches to login, then back to signup.
            setSignupFullName("");
            setSignupSchool("");
            setSignupCourse("");
            setSignupYearLevel("");

            // Step 51G.26E (Item 2 fix): switching login/signup mode
            // also abandons any not-yet-consumed OTP signup hand-off
            // — otherwise stale data for this email could later be
            // picked up by an unrelated sign-in via a different auth
            // method.
            if (pendingOtpProfileRef) {
              pendingOtpProfileRef.current = null;
            }
          }}
          className="mt-5 w-full text-center text-sm font-medium text-[#3D2FE0]"
        >
          {mode === "login"
            ? "New to Takda? Create an account"
            : "Already have an account? Log in"}
        </button>

      </div>
    </div>
  );
}

/* =========================
   RESET PASSWORD
========================= */

function ResetPasswordScreen({ onDone }) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] =
    useState(false);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function updatePassword(e) {
    e.preventDefault();

    setMessage("");

    if (password.length < 6) {
      setMessage("Password must be at least 6 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setMessage("Passwords do not match.");
      return;
    }

    setLoading(true);

    try {
      const { error } = await supabase.auth.updateUser({
        password,
      });

      if (error) throw error;

      setMessage(
        "Password updated successfully. Redirecting to login..."
      );

      setTimeout(() => {
        onDone();
      }, 1200);
    } catch (err) {
      setMessage(
        err.message || "Unable to update password."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#F5F6FA] flex items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-2xl border border-[#E4E4F0] bg-white p-6 shadow-sm">

        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-[#3D2FE0] text-lg font-bold text-white">
            T
          </div>

          <h1 className="text-2xl font-bold text-[#1B1B2F]">
            Create new password
          </h1>

          <p className="mt-1 text-sm text-slate-500">
            Enter your new Takda password.
          </p>
        </div>

        <form onSubmit={updatePassword} className="space-y-3">

          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="New password"
              autoComplete="new-password"
              className="w-full rounded-xl border border-[#E4E4F0] px-3 py-3 pr-16 text-sm outline-none focus:border-[#3D2FE0]"
            />

            <button
              type="button"
              onClick={() =>
                setShowPassword((current) => !current)
              }
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-[#3D2FE0]"
            >
              {showPassword ? "Hide" : "Show"}
            </button>
          </div>

          <div className="relative">
            <input
              type={showConfirmPassword ? "text" : "password"}
              required
              minLength={6}
              value={confirmPassword}
              onChange={(e) =>
                setConfirmPassword(e.target.value)
              }
              placeholder="Confirm new password"
              autoComplete="new-password"
              className="w-full rounded-xl border border-[#E4E4F0] px-3 py-3 pr-16 text-sm outline-none focus:border-[#3D2FE0]"
            />

            <button
              type="button"
              onClick={() =>
                setShowConfirmPassword((current) => !current)
              }
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-[#3D2FE0]"
            >
              {showConfirmPassword ? "Hide" : "Show"}
            </button>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-[#3D2FE0] py-3 text-sm font-semibold text-white disabled:opacity-50"
          >
            {loading ? "Updating..." : "Update password"}
          </button>

        </form>

        {message && (
          <p className="mt-3 text-center text-xs text-slate-600">
            {message}
          </p>
        )}

      </div>
    </div>
  );
}

/* =========================
   FIRST PROFILE SETUP
========================= */

// Shared save logic (Step 51G.26B) — the ONE place that writes to
// `profiles`, used by both ProfileSetup below and the new in-flow OTP
// signup save in AuthScreen. `upsert(..., { onConflict: "id" })` is
// keyed on the auth user's own id, so calling this more than once
// with the same data is always safe (overwrites the same row, never
// creates a duplicate) — the real duplicate-save risk this plan cares
// about is a confusing UI flash, not an actual extra row, and that is
// handled by the caller checking for an existing completed profile
// first (see hasCompletedProfile below), not by this function itself.
async function upsertProfile(
  userId,
  { fullName, school, course, yearLevel }
) {
  return supabase
    .from("profiles")
    .upsert(
      {
        id: userId,
        full_name: fullName.trim(),
        school: school.trim() || null,
        course: course.trim() || null,
        year_level: yearLevel.trim() || null,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: "id",
      }
    )
    .select()
    .single();
}

// Requirement 6 (Step 51G.26B): read-only check for an existing,
// already-completed profile — mirrors checkProfile's own definition
// of "complete" (`data && data.full_name`) exactly, so this never
// disagrees with the check that decides whether ProfileSetup itself
// would be shown. Used to guarantee the new in-flow OTP save never
// overwrites real information a returning/existing user already has.
async function hasCompletedProfile(userId) {
  const { data, error } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", userId)
    .maybeSingle();

  if (error) throw error;

  return !!(data && data.full_name);
}

// Step 51G.29E (Part B, requirement 1): validates the SHAPE of
// auth user_metadata before it is ever used as a save candidate —
// metadata is self-reported by the client at signUp() time (see
// AuthScreen's submit(), Part A above), so it is treated here as
// ordinary, untrusted user input, never as authorization data
// (requirement 2): this function only checks that the expected
// string fields exist and that the required ones are non-empty; it
// grants no elevated access and is not consulted for anything beyond
// what values to attempt to save. Returns a normalized
// {fullName, school, course, yearLevel} object (matching
// upsertProfile()'s own parameter shape exactly) on success, or null
// if the metadata is absent, the wrong shape, or missing a required
// field — the null case is the normal, expected outcome for every
// OTP signup, every existing user, and every password signup that
// predates this change, not an error.
function extractPasswordSignupMetadata(user) {
  const metadata = user?.user_metadata;

  if (!metadata || typeof metadata !== "object") return null;

  const fullName =
    typeof metadata.full_name === "string" ? metadata.full_name : "";
  const school =
    typeof metadata.school === "string" ? metadata.school : "";
  const course =
    typeof metadata.course === "string" ? metadata.course : "";
  const yearLevel =
    typeof metadata.year_level === "string" ? metadata.year_level : "";

  if (!fullName.trim() || !course.trim() || !yearLevel.trim()) {
    return null;
  }

  return { fullName, school, course, yearLevel };
}

function ProfileSetup({ user, onComplete }) {
  const [fullName, setFullName] = useState("");
  const [school, setSchool] = useState("");
  const [course, setCourse] = useState("");
  const [yearLevel, setYearLevel] = useState("");

  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  async function saveProfile(e) {
    e.preventDefault();

    if (!fullName.trim()) {
      setMessage("Please enter your full name.");
      return;
    }

    // Required for NEW onboarding only (Step 51D.3): this component
    // only ever renders when checkProfile finds full_name missing
    // (src/main.jsx checkProfile, "data && data.full_name"), so an
    // already-onboarded existing user — even one who left course/
    // yearLevel blank before this change — never reaches this form
    // again and is never retroactively blocked by this validation.
    if (!course.trim()) {
      setMessage("Please enter your program or course.");
      return;
    }

    if (!yearLevel.trim()) {
      setMessage("Please enter your year or grade level.");
      return;
    }

    setSaving(true);
    setMessage("");

    try {
      const { data, error } = await upsertProfile(user.id, {
        fullName,
        school,
        course,
        yearLevel,
      });

      if (error) throw error;

      onComplete(data);
    } catch (err) {
      console.error("Profile save error:", err);

      setMessage(
        err.message || "Unable to save your profile."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#F5F6FA] flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl border border-[#E4E4F0] bg-white p-6 shadow-sm">

        <div className="mb-6 text-center">

          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-[#3D2FE0] text-xl font-bold text-white">
            T
          </div>

          <h1 className="text-2xl font-bold text-[#1B1B2F]">
            Welcome to Takda! 👋
          </h1>

          <p className="mt-2 text-sm text-slate-500">
            Tell us a little about yourself to personalize your experience.
          </p>

          <p className="mt-2 text-xs text-slate-400">
            {user.email}
          </p>

        </div>

        <form onSubmit={saveProfile} className="space-y-4">

          <div>
            <label className="mb-1 block text-sm font-medium text-[#1B1B2F]">
              Full Name <span className="text-red-500">*</span>
            </label>

            <input
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="e.g. Juan Dela Cruz"
              className="w-full rounded-xl border border-[#E4E4F0] px-3 py-3 text-sm outline-none focus:border-[#3D2FE0]"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-[#1B1B2F]">
              School
            </label>

            <input
              type="text"
              value={school}
              onChange={(e) => setSchool(e.target.value)}
              placeholder="e.g. University of the Philippines"
              className="w-full rounded-xl border border-[#E4E4F0] px-3 py-3 text-sm outline-none focus:border-[#3D2FE0]"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-[#1B1B2F]">
              Program / Track <span className="text-red-500">*</span>
            </label>

            <input
              type="text"
              required
              value={course}
              onChange={(e) => setCourse(e.target.value)}
              placeholder="e.g. BS Information Technology"
              className="w-full rounded-xl border border-[#E4E4F0] px-3 py-3 text-sm outline-none focus:border-[#3D2FE0]"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-[#1B1B2F]">
              Year / Grade Level <span className="text-red-500">*</span>
            </label>

            <input
              type="text"
              required
              value={yearLevel}
              onChange={(e) => setYearLevel(e.target.value)}
              placeholder="e.g. 2nd Year or Grade 12"
              className="w-full rounded-xl border border-[#E4E4F0] px-3 py-3 text-sm outline-none focus:border-[#3D2FE0]"
            />
          </div>

          {message && (
            <div className="rounded-xl bg-red-50 px-3 py-2 text-center text-xs text-red-600">
              {message}
            </div>
          )}

          <button
            type="submit"
            disabled={saving}
            className="w-full rounded-xl bg-[#3D2FE0] py-3 text-sm font-semibold text-white disabled:opacity-50"
          >
            {saving ? "Saving profile..." : "Save & Continue"}
          </button>

        </form>

      </div>
    </div>
  );
}

/* =========================
   AVATAR
========================= */

function Avatar({ profile, email, size = "normal" }) {
  const dimension =
    size === "large"
      ? "h-24 w-24 text-2xl"
      : "h-10 w-10 text-sm";

  if (profile?.avatar_url) {
    return (
      <img
        src={profile.avatar_url}
        alt="Profile"
        className={`${dimension} rounded-full object-cover border border-[#E4E4F0] bg-white`}
      />
    );
  }

  return (
    <div
      className={`${dimension} flex items-center justify-center rounded-full bg-[#3D2FE0] font-bold text-white`}
    >
      {getInitials(profile?.full_name, email)}
    </div>
  );
}

/* =========================
   PLAN HELPERS
========================= */

function getTakdaPlan(profile) {
  const plan = String(profile?.plan || "free").toLowerCase();
  const proUntil = profile?.pro_until ? new Date(profile.pro_until) : null;
  const hasActiveProDate =
    proUntil instanceof Date &&
    !Number.isNaN(proUntil.getTime()) &&
    proUntil.getTime() > Date.now();

  return plan === "pro" && hasActiveProDate
  ? "pro"
  : "free";
}

function ProBadge({ compact }) {
  return (
    <span
      className={`takda-pro-badge rounded-full font-extrabold tracking-wide ${
        compact ? "px-2 py-0.5 text-[9px]" : "px-2 py-1 text-[10px]"
      }`}
    >
      <span aria-hidden="true">✦</span> PRO
    </span>
  );
}

function ProModal({ onClose }) {
  const [billing, setBilling] = useState("yearly");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function startCheckout() {
    if (loading) return;

    setLoading(true);
    setMessage("");

    try {
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError) throw sessionError;

      if (!session?.access_token) {
        throw new Error(
          "Your login session has expired. Please log in again."
        );
      }

      const response = await fetch("/api/create-checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          plan: billing,
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          data?.error || "Unable to start PayMongo checkout."
        );
      }

      if (!data?.checkoutUrl) {
        throw new Error(
          "PayMongo checkout URL was not returned."
        );
      }

      window.location.href = data.checkoutUrl;
    } catch (err) {
      console.error("Takda Pro checkout error:", err);
      setMessage(
        err.message ||
          "Unable to start checkout. Please try again."
      );
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[120] overflow-y-auto bg-black/50 p-4">
      <div className="flex min-h-full items-center justify-center">
        <div className="w-full max-w-md overflow-hidden rounded-3xl border border-[#E4E4F0] bg-white shadow-2xl">
          <div className="relative bg-[#1B1B2F] px-6 pb-7 pt-6 text-white">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-xl disabled:opacity-50"
              aria-label="Close Takda Pro"
            >
              ×
            </button>

            <div className="inline-flex rounded-full border border-amber-300/30 bg-amber-300/10 px-3 py-1 text-xs font-extrabold tracking-wide text-amber-300">
              ⭐ TAKDA PRO
            </div>

            <h2 className="mt-4 text-3xl font-extrabold">
              Do more with your school life.
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              Unlock premium Takda tools designed to help you stay organized,
              focused, and ready for deadlines.
            </p>
          </div>

          <div className="p-6">
            <div className="space-y-3 text-sm text-[#1B1B2F]">
              {[
                "Advanced academic insights",
                "More powerful grade tracking",
                "Premium productivity tools",
                "Future Pro features included",
              ].map((feature) => (
                <div key={feature} className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#F0EEFF] text-xs font-bold text-[#3D2FE0]">
                    ✓
                  </span>
                  <span className="font-medium">{feature}</span>
                </div>
              ))}
            </div>

            <div className="mt-6 grid grid-cols-2 gap-3">
              <button
                type="button"
                disabled={loading}
                onClick={() => setBilling("monthly")}
                className={`rounded-2xl border p-4 text-left disabled:opacity-60 ${
                  billing === "monthly"
                    ? "border-[#3D2FE0] bg-[#F7F6FF] ring-1 ring-[#3D2FE0]"
                    : "border-[#E4E4F0] bg-white"
                }`}
              >
                <p className="text-xs font-bold text-slate-500">MONTHLY</p>
                <p className="mt-1 text-2xl font-extrabold text-[#1B1B2F]">₱29</p>
                <p className="text-xs text-slate-400">per month</p>
              </button>

              <button
                type="button"
                disabled={loading}
                onClick={() => setBilling("yearly")}
                className={`relative rounded-2xl border p-4 text-left disabled:opacity-60 ${
                  billing === "yearly"
                    ? "border-[#3D2FE0] bg-[#F7F6FF] ring-1 ring-[#3D2FE0]"
                    : "border-[#E4E4F0] bg-white"
                }`}
              >
                <span className="absolute -top-2 right-2 rounded-full bg-amber-400 px-2 py-0.5 text-[10px] font-extrabold text-[#1B1B2F]">
                  BEST VALUE
                </span>
                <p className="text-xs font-bold text-slate-500">YEARLY</p>
                <p className="mt-1 text-2xl font-extrabold text-[#1B1B2F]">₱299</p>
                <p className="text-xs text-slate-400">per year</p>
              </button>
            </div>

            {message && (
              <div className="mt-4 rounded-xl bg-red-50 px-3 py-2.5 text-center text-xs font-medium text-red-600">
                {message}
              </div>
            )}

            <button
              type="button"
              onClick={startCheckout}
              disabled={loading}
              className="mt-5 w-full rounded-xl bg-[#3D2FE0] py-3.5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading
                ? "Opening secure checkout..."
                : `Upgrade to Pro — ${
                    billing === "monthly" ? "₱29/month" : "₱299/year"
                  }`}
            </button>

            <p className="mt-3 text-center text-xs leading-5 text-slate-400">
              You will be redirected to PayMongo's secure checkout page.
              Takda Pro is activated only after payment is confirmed.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

/* =========================
   PROFILE MENU
========================= */

function ProfileMenu({
  profile,
  user,
  onOpenProfile,
  onOpenPro,
  onLogout,
}) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);
  const isPro = getTakdaPlan(profile) === "pro";

  useEffect(() => {
    function handleOutsideClick(event) {
      if (
        menuRef.current &&
        !menuRef.current.contains(event.target)
      ) {
        setOpen(false);
      }
    }

    document.addEventListener(
      "mousedown",
      handleOutsideClick
    );

    document.addEventListener(
      "touchstart",
      handleOutsideClick
    );

    return () => {
      document.removeEventListener(
        "mousedown",
        handleOutsideClick
      );

      document.removeEventListener(
        "touchstart",
        handleOutsideClick
      );
    };
  }, []);

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex items-center gap-2 rounded-full focus:outline-none"
        aria-label="Open profile menu"
      >
        <Avatar
          profile={profile}
          email={user.email}
        />
        {isPro ? (
          <ProBadge />
        ) : (
          <span className="hidden rounded-full bg-slate-100 px-2 py-1 text-[10px] font-extrabold tracking-wide text-slate-500 sm:inline-flex">
            FREE
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-64 overflow-hidden rounded-2xl border border-[#E4E4F0] bg-white shadow-lg">
          <div className="border-b border-[#E4E4F0] p-4">
            <div className="flex items-center gap-3">
              <Avatar
                profile={profile}
                email={user.email}
              />

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-semibold text-[#1B1B2F]">
                    {profile?.full_name || "Takda Student"}
                  </p>
                  {isPro ? (
                    <ProBadge compact />
                  ) : (
                    <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-extrabold tracking-wide text-slate-500">
                      FREE
                    </span>
                  )}
                </div>

                <p className="truncate text-xs text-slate-400">
                  {user.email}
                </p>
              </div>
            </div>
          </div>

          <div className="p-2">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onOpenProfile();
              }}
              className="w-full rounded-xl px-3 py-2.5 text-left text-sm font-medium text-[#1B1B2F] hover:bg-[#F5F6FA]"
            >
              👤 My Profile
            </button>

            {!isPro && (
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  onOpenPro();
                }}
                className="mt-1 w-full rounded-xl bg-[#FFF8E7] px-3 py-2.5 text-left text-sm font-bold text-amber-700 hover:bg-amber-100"
              >
                ⭐ Upgrade to Pro
              </button>
            )}

            <button
              type="button"
              onClick={onLogout}
              className="mt-1 w-full rounded-xl px-3 py-2.5 text-left text-sm font-medium text-red-600 hover:bg-red-50"
            >
              Log out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* =========================
   MY PROFILE MODAL
========================= */

function MyProfile({
  user,
  profile,
  onClose,
  onProfileUpdated,
}) {
  const fileInputRef = useRef(null);

  const [fullName, setFullName] = useState(
    profile?.full_name || ""
  );

  const [school, setSchool] = useState(
    profile?.school || ""
  );

  const [course, setCourse] = useState(
    profile?.course || ""
  );

  const [yearLevel, setYearLevel] = useState(
    profile?.year_level || ""
  );

  const [avatarUrl, setAvatarUrl] = useState(
    profile?.avatar_url || null
  );

  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("");

  async function uploadAvatar(event) {
    const file = event.target.files?.[0];

    event.target.value = "";

    if (!file) return;

    const allowedTypes = [
      "image/jpeg",
      "image/png",
      "image/webp",
    ];

    if (!allowedTypes.includes(file.type)) {
      setMessageType("error");
      setMessage(
        "Please choose a JPEG, PNG, or WebP image."
      );
      return;
    }

    if (file.size > 4 * 1024 * 1024) {
      setMessageType("error");
      setMessage(
        "Profile picture must be 4 MB or smaller."
      );
      return;
    }

    setUploading(true);
    setMessage("");

    try {
      const extension =
        file.name.split(".").pop()?.toLowerCase() ||
        "jpg";

      const filePath =
        `${user.id}/avatar-${Date.now()}.${extension}`;

      const { error: uploadError } =
        await supabase.storage
          .from("avatars")
          .upload(filePath, file, {
            cacheControl: "3600",
            upsert: false,
          });

      if (uploadError) throw uploadError;

      const { data: publicUrlData } =
        supabase.storage
          .from("avatars")
          .getPublicUrl(filePath);

      const newAvatarUrl =
        publicUrlData.publicUrl;

      const { data: updatedProfile, error: profileError } =
        await supabase
          .from("profiles")
          .update({
            avatar_url: newAvatarUrl,
            updated_at: new Date().toISOString(),
          })
          .eq("id", user.id)
          .select()
          .single();

      if (profileError) throw profileError;

      /*
        Delete previous image after the new image
        has successfully been saved to the profile.
      */

      if (profile?.avatar_url) {
        try {
          const marker = "/avatars/";

          const oldPath =
            profile.avatar_url.includes(marker)
              ? decodeURIComponent(
                  profile.avatar_url
                    .split(marker)[1]
                    .split("?")[0]
                )
              : null;

          if (oldPath && oldPath !== filePath) {
            await supabase.storage
              .from("avatars")
              .remove([oldPath]);
          }
        } catch (deleteError) {
          console.warn(
            "Old avatar cleanup failed:",
            deleteError
          );
        }
      }

      setAvatarUrl(newAvatarUrl);
      onProfileUpdated(updatedProfile);

      setMessageType("success");
      setMessage(
        "Profile picture updated successfully."
      );
    } catch (err) {
      console.error("Avatar upload error:", err);

      setMessageType("error");
      setMessage(
        err.message ||
          "Unable to upload profile picture."
      );
    } finally {
      setUploading(false);
    }
  }

  async function saveChanges(e) {
    e.preventDefault();

    if (!fullName.trim()) {
      setMessageType("error");
      setMessage("Full name is required.");
      return;
    }

    setSaving(true);
    setMessage("");

    try {
      const { data, error } = await supabase
        .from("profiles")
        .update({
          full_name: fullName.trim(),
          school: school.trim() || null,
          course: course.trim() || null,
          year_level: yearLevel.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", user.id)
        .select()
        .single();

      if (error) throw error;

      onProfileUpdated(data);

      setMessageType("success");
      setMessage("Profile saved successfully.");
    } catch (err) {
      console.error("Profile update error:", err);

      setMessageType("error");
      setMessage(
        err.message || "Unable to save profile."
      );
    } finally {
      setSaving(false);
    }
  }

  const displayProfile = {
    ...profile,
    full_name: fullName,
    avatar_url: avatarUrl,
  };

  return (
    <div className="fixed inset-0 z-[100] overflow-y-auto bg-black/40 p-4">

      <div className="flex min-h-full items-center justify-center">

        <div className="w-full max-w-lg rounded-3xl bg-white shadow-xl">

          <div className="flex items-center justify-between border-b border-[#E4E4F0] px-5 py-4">

            <div>
              <h2 className="text-lg font-bold text-[#1B1B2F]">
                My Profile
              </h2>

              <p className="text-xs text-slate-400">
                Manage your Takda profile
              </p>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-[#F5F6FA] text-lg text-slate-500"
              aria-label="Close profile"
            >
              ×
            </button>

          </div>

          <div className="p-5">

            {/* PROFILE PHOTO */}

            <div className="mb-6 flex flex-col items-center">

              <div className="relative">

                <Avatar
                  profile={displayProfile}
                  email={user.email}
                  size="large"
                />

                <button
                  type="button"
                  onClick={() =>
                    fileInputRef.current?.click()
                  }
                  disabled={uploading}
                  className="absolute -bottom-1 -right-1 flex h-9 w-9 items-center justify-center rounded-full border-2 border-white bg-[#3D2FE0] text-white shadow disabled:opacity-50"
                  title="Change profile picture"
                >
                  {uploading ? "…" : "📷"}
                </button>

              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={uploadAvatar}
                className="hidden"
              />

              <button
                type="button"
                onClick={() =>
                  fileInputRef.current?.click()
                }
                disabled={uploading}
                className="mt-3 text-sm font-semibold text-[#3D2FE0] disabled:opacity-50"
              >
                {uploading
                  ? "Uploading..."
                  : avatarUrl
                  ? "Change Photo"
                  : "Upload Photo"}
              </button>

              <p className="mt-1 text-center text-xs text-slate-400">
                JPEG, PNG or WebP • Maximum 4 MB
              </p>

            </div>

            {/* PROFILE FORM */}

            <form onSubmit={saveChanges} className="space-y-4">

              <div>
                <label className="mb-1 block text-sm font-medium text-[#1B1B2F]">
                  Email
                </label>

                <input
                  type="email"
                  value={user.email || ""}
                  disabled
                  className="w-full rounded-xl border border-[#E4E4F0] bg-[#F5F6FA] px-3 py-3 text-sm text-slate-400"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-[#1B1B2F]">
                  Full Name{" "}
                  <span className="text-red-500">*</span>
                </label>

                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) =>
                    setFullName(e.target.value)
                  }
                  placeholder="Full name"
                  className="w-full rounded-xl border border-[#E4E4F0] px-3 py-3 text-sm outline-none focus:border-[#3D2FE0]"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-[#1B1B2F]">
                  School
                </label>

                <input
                  type="text"
                  value={school}
                  onChange={(e) =>
                    setSchool(e.target.value)
                  }
                  placeholder="School"
                  className="w-full rounded-xl border border-[#E4E4F0] px-3 py-3 text-sm outline-none focus:border-[#3D2FE0]"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-[#1B1B2F]">
                  Program / Track
                </label>

                <input
                  type="text"
                  value={course}
                  onChange={(e) =>
                    setCourse(e.target.value)
                  }
                  placeholder="Program / Track"
                  className="w-full rounded-xl border border-[#E4E4F0] px-3 py-3 text-sm outline-none focus:border-[#3D2FE0]"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-[#1B1B2F]">
                  Year / Grade Level
                </label>

                <input
                  type="text"
                  value={yearLevel}
                  onChange={(e) =>
                    setYearLevel(e.target.value)
                  }
                  placeholder="Year / Grade Level"
                  className="w-full rounded-xl border border-[#E4E4F0] px-3 py-3 text-sm outline-none focus:border-[#3D2FE0]"
                />
              </div>

              {message && (
                <div
                  className={`rounded-xl px-3 py-2.5 text-center text-xs ${
                    messageType === "success"
                      ? "bg-green-50 text-green-700"
                      : "bg-red-50 text-red-600"
                  }`}
                >
                  {message}
                </div>
              )}

              <div className="flex gap-3 pt-2">

                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 rounded-xl border border-[#E4E4F0] bg-white py-3 text-sm font-semibold text-slate-600"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={saving || uploading}
                  className="flex-1 rounded-xl bg-[#3D2FE0] py-3 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {saving
                    ? "Saving..."
                    : "Save Changes"}
                </button>

              </div>

            </form>

          </div>

        </div>

      </div>

    </div>
  );
}

/* =========================
   TIMEZONE CAPTURE (pre-9E-4C-2 mini-stage)
========================= */

// Fire-and-forget: fills in profiles.timezone for the currently
// authenticated user only when their stored value is missing/invalid AND
// the browser can detect a real IANA zone (src/lib/timezone.js owns both
// checks — never guesses, never overwrites an already-valid saved zone,
// e.g. while a user is traveling). Never awaited by its caller and never
// throws out of itself, so a slow/failed write can never delay or break
// login/app loading.
async function syncDetectedTimeZone(user, currentTimeZone) {
  const detected = detectBrowserTimeZone();

  if (!shouldStoreDetectedTimeZone(currentTimeZone, detected)) return;

  try {
    const { error } = await supabase
      .from("profiles")
      .update({ timezone: detected })
      .eq("id", user.id);

    if (error) throw error;
  } catch (err) {
    console.error("Takda timezone sync error:", err);
  }
}

/* =========================
   PUBLIC ROUTE METADATA
========================= */

// Phase B2 Implementation #4: single source of truth for per-route
// <title>/description/canonical/Open Graph/Twitter values, consumed by
// the pathname-keyed effect below. ROOT doubles as the fallback for any
// pathname that isn't exactly one of these five — deliberately, so an
// unknown/nonexistent SPA path never gets a canonical URL built from
// arbitrary, possibly-fake pathname text.
const ROUTE_METADATA = {
  "/": {
    title: "Takda — Student Academic Planner",
    description: "Organize subjects, activities, deadlines, notes, calendar, and grades in one student academic planner.",
    canonical: "https://takda-ecru.vercel.app/"
  },
  "/about": {
    title: "About Takda | Takda",
    description: "What Takda offers students: subjects, activities, calendar, notes, grades, semesters, recurring activities, and reminders — plus Free and Pro plans.",
    canonical: "https://takda-ecru.vercel.app/about"
  },
  "/privacy": {
    title: "Privacy Policy | Takda",
    description: "How Takda collects and uses account and academic information, including the service providers involved.",
    canonical: "https://takda-ecru.vercel.app/privacy"
  },
  "/terms": {
    title: "Terms of Service | Takda",
    description: "The terms governing use of Takda, including account responsibility and acceptable use.",
    canonical: "https://takda-ecru.vercel.app/terms"
  },
  "/help": {
    title: "Help & FAQ | Takda",
    description: "Answers to common questions about creating an account, using Takda's features, and Free vs Pro plans.",
    canonical: "https://takda-ecru.vercel.app/help"
  }
};

// Updates an existing head tag's attribute in place rather than creating
// a new node — index.html already ships one of each tag this function
// is ever called with, so this never produces duplicates across
// repeated navigation. Safely no-ops (never throws) if a tag is
// unexpectedly missing from the document.
function setMetaAttribute(selector, attribute, value) {
  document.querySelector(selector)?.setAttribute(attribute, value);
}

/* =========================
   MAIN APP / SESSION
========================= */

function Root() {
  const [session, setSession] = useState(null);

  // Step 52B.3: lazy initializer runs once, on Root's first render
  // only — never re-reads localStorage on subsequent renders.
  const [theme] = useState(readStoredTheme);

  // Runs on every Root render regardless of which branch below is
  // currently returned (loading, public landing, auth screens, or the
  // authenticated shell) — document.documentElement is outside all of
  // them, so this is the one place that reaches every state uniformly.
  useEffect(() => {
    document.documentElement.setAttribute(
      "data-takda-theme",
      theme
    );
  }, [theme]);

  const [loading, setLoading] = useState(true);
  const [profileLoading, setProfileLoading] =
    useState(false);

  const [isRecovery, setIsRecovery] = useState(false);

  const [profile, setProfile] = useState(null);
  const [needsProfile, setNeedsProfile] =
    useState(false);

  const [showProfile, setShowProfile] =
    useState(false);

  const [showPro, setShowPro] =
    useState(false);

  const [publicScreen, setPublicScreen] = useState("landing");

  // Phase B2 Implementation #1: minimal pathname routing for a small set
  // of fully public pages (currently only /about). Deliberately NOT a
  // router — no dependency, no route table — and deliberately kept
  // separate from Supabase session semantics: this state is never read
  // by, and never influences, the session/profile/loading/isRecovery
  // logic above or below it. It only decides what Root DISPLAYS for the
  // current URL; the auth effect further below still runs unconditionally
  // on every render regardless of pathname, so session handling,
  // PASSWORD_RECOVERY, and the tab-return fix are all completely
  // unaffected by which page is currently showing.
  const [pathname, setPathname] = useState(() => window.location.pathname);

  useEffect(() => {
    function handlePopState() {
      setPathname(window.location.pathname);
    }
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  // Pushes a new history entry and updates local state together — a bare
  // pushState() fires no event of its own, so React would never notice
  // the URL changed without this explicit setPathname call alongside it.
  // A no-op when already on the target path, so clicking "Home" while
  // already on "/" never adds a duplicate history entry.
  function navigateTo(path) {
    if (window.location.pathname !== path) {
      window.history.pushState(null, "", path);
    }
    setPathname(path);
  }

  // Phase B2 Implementation #4: route-aware <title>/description/
  // canonical/Open Graph/Twitter metadata, driven by the ROUTE_METADATA
  // map above. Any pathname other than the five known public routes
  // (including mid-navigation/unknown paths) falls back to ROOT's
  // metadata rather than ever constructing a canonical URL from
  // arbitrary pathname text.
  useEffect(() => {
    const meta = ROUTE_METADATA[pathname] || ROUTE_METADATA["/"];

    document.title = meta.title;
    setMetaAttribute('meta[name="description"]', "content", meta.description);
    setMetaAttribute('link[rel="canonical"]', "href", meta.canonical);
    setMetaAttribute('meta[property="og:title"]', "content", meta.title);
    setMetaAttribute('meta[property="og:description"]', "content", meta.description);
    setMetaAttribute('meta[property="og:type"]', "content", "website");
    setMetaAttribute('meta[property="og:url"]', "content", meta.canonical);
    setMetaAttribute('meta[property="og:site_name"]', "content", "Takda");
    setMetaAttribute('meta[name="twitter:card"]', "content", "summary");
    setMetaAttribute('meta[name="twitter:title"]', "content", meta.title);
    setMetaAttribute('meta[name="twitter:description"]', "content", meta.description);
  }, [pathname]);

  // getTakdaPlan(profile) compares profile.pro_until to Date.now(), so its
  // result only changes when something forces a re-render. Recheck on an
  // interval and when the tab regains focus/visibility so a session left
  // open past expiration drops back to Free without a page reload.
  const [planCheckTick, setPlanCheckTick] = useState(0);

  useEffect(() => {
    const recheckPlan = () => setPlanCheckTick((t) => t + 1);
    const intervalId = setInterval(recheckPlan, 60000);
    document.addEventListener("visibilitychange", recheckPlan);
    window.addEventListener("focus", recheckPlan);
    return () => {
      clearInterval(intervalId);
      document.removeEventListener("visibilitychange", recheckPlan);
      window.removeEventListener("focus", recheckPlan);
    };
  }, []);

  const isPro = useMemo(
    () => getTakdaPlan(profile) === "pro",
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [profile, planCheckTick]
  );

  // Tab-return loading-flash fix: identifies the user id for whom Root
  // currently holds a successfully loaded, usable profile — deliberately
  // NOT "the current session's user id." Only ever set inside
  // checkProfile's own success branch below (never before the fetch,
  // never merely because a session exists, never after a failed/missing
  // profile), so a previously-failed or not-yet-attempted check always
  // remains untrusted and therefore still blocking on retry. A plain
  // ref (not React state) is used deliberately: the onAuthStateChange
  // callback below is created once, inside an effect with an empty
  // dependency array, so any session/profile STATE it closed over would
  // be permanently stale (always the initial null values) for the
  // listener's entire lifetime. A ref's `.current` is read fresh on
  // every invocation regardless of when the closure was created, so
  // this avoids that trap without adding session/profile to the effect
  // dependency array (which would tear down and resubscribe the auth
  // listener on every session/profile change).
  const authedUserIdWithProfileRef = useRef(null);

  // Step 51G.26C: incremented at the very top of EVERY auth event
  // (not just SIGNED_IN) — lets an in-flight async chain started by an
  // earlier event detect that a newer event has already superseded
  // it, and bail out before touching state or the database. Same
  // "cancelled" idiom already used by TurnstileWidget elsewher in this
  // file, adapted to a counter since multiple events (not just
  // mount/unmount) need distinguishing here.
  const authEventTokenRef = useRef(0);

  // Step 51G.26C: the ONE hand-off point between AuthScreen and Root
  // for an OTP signup's collected profile fields. AuthScreen only
  // ever WRITES here (right before calling verifyOtp, see
  // AuthScreen's verifyOtpCode); Root is the only reader, and the only
  // place that ever saves this data or decides needsProfile as a
  // result — closing the two-subscriber race from Step 51G.26B by
  // giving the save and the SIGNED_IN profile check a single owner.
  // A ref, not state: no re-render is needed or wanted for this
  // hand-off, and it must survive AuthScreen unmounting the instant
  // `session` becomes truthy.
  const pendingOtpSignupProfileRef = useRef(null);

  // Step 51G.26E (Item 1 fix): one shared in-flight reconciliation per
  // user id — `{ userId, promise }` while a save is running, else
  // null. When a second, overlapping SIGNED_IN callback arrives for
  // the SAME user while an earlier one is still saving, it joins
  // (awaits) this SAME promise instead of starting a second save or
  // racing ahead to checkProfile() before the first save has landed.
  // Only the caller that actually started the entry clears it
  // (checked by identity below), so a third overlapping callback that
  // joins after cleanup simply finds nothing and falls through to a
  // plain checkProfile() call, exactly as if there had been no
  // pending data at all.
  const pendingProfileReconcileRef = useRef(null);

  // silent=true: a background revalidation for a user we already trust
  // (see authedUserIdWithProfileRef above) — refreshes profile data
  // (name/timezone/plan fields) without ever toggling profileLoading, so
  // Root's full-screen "Loading Takda…" gate never replaces an
  // already-mounted, already-authenticated app merely because Supabase's
  // own visibility-triggered session recovery re-emitted SIGNED_IN for
  // the same already-signed-in user. A silent check can only ever
  // IMPROVE state (apply a fresh usable profile) or no-op (leave
  // whatever was already there untouched) — it never regresses the app
  // into ProfileSetup or a cleared-profile state, so a transient network
  // hiccup during a silent background check can never visibly disrupt
  // an already-working session. silent=false (the default) is byte-for-
  // byte the original, unconditionally blocking behavior.
  // Step 51G.26E (Item 3 fix): `isStale`, when passed, is checked
  // immediately after the awaited read below, BEFORE any
  // profile/needsProfile state is touched — closing the "after the
  // await" half of the guard (applySignedInUser already covers the
  // "before calling checkProfile" half via the same mechanism). Left
  // undefined by the one other, pre-existing call site (the initial
  // getSession() load, which has no newer-event concept to compare
  // against) — behavior there is completely unchanged.
  async function checkProfile(
    user,
    { silent = false, isStale } = {}
  ) {
    if (!user) {
      setProfile(null);
      setNeedsProfile(false);
      setProfileLoading(false);
      return;
    }

    if (!silent) setProfileLoading(true);

    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .maybeSingle();

      if (isStale && isStale()) return;

      if (error) throw error;

      if (data && data.full_name) {
        setProfile(data);
        setNeedsProfile(false);
        authedUserIdWithProfileRef.current = user.id;
        // Not awaited: a slow/failed timezone write must never delay
        // profileLoading from clearing below.
        syncDetectedTimeZone(user, data.timezone);
      } else if (!silent) {
        setProfile(null);
        setNeedsProfile(true);
      }
      // silent + no usable profile: leave existing profile/needsProfile
      // state exactly as it was — never surface ProfileSetup as a side
      // effect of a background revalidation. The next non-silent check
      // (e.g. a genuine re-login) will resolve it normally.
    } catch (err) {
      // Step 51G.26E: a rejected await (e.g. a network failure) jumps
      // straight here, skipping the isStale() check placed after the
      // try block's own await — so it must be re-checked here too,
      // before this catch's own state writes.
      if (isStale && isStale()) return;

      console.error(
        "Profile loading error:",
        err
      );

      if (!silent) {
        setProfile(null);
        setNeedsProfile(true);
      }
      // silent errors are logged only, for the same reason as above — a
      // transient hiccup during a background revalidation must never
      // disrupt an already-working app.
    } finally {
      // Step 51G.26G (Item 1 fix): same isStale guard the try/catch
      // bodies above already use for setProfile/setNeedsProfile — a
      // stale caller must not clear profileLoading either, since a
      // newer, still-current callback's own checkProfile() may still
      // genuinely be in flight relying on it staying true. The one
      // caller that is never superseded always eventually reaches
      // this finally with isStale() false, so this cannot leave
      // profileLoading stuck.
      if (!silent && !(isStale && isStale())) {
        setProfileLoading(false);
      }
    }
  }

  // Step 51G.26E: the actual save, factored out so it can be shared
  // (awaited by multiple overlapping callbacks via
  // pendingProfileReconcileRef) instead of each callback racing to
  // run it independently. Never throws — a failure is logged and
  // simply leaves the row as-is, so the checkProfile() call that
  // every awaiter performs afterward falls through to the normal
  // ProfileSetup fallback exactly as if there had been no pending
  // data at all (Item 3 of the 51G.26B requirements).
  async function reconcileOtpSignupProfile(user, pending) {
    try {
      // Requirement 4 (existing-user protection): never overwrite a
      // real, already-completed profile — read fresh here rather
      // than assumed. This is a sequential check-then-upsert, not an
      // atomic database-level guarantee — a concurrent writer could
      // in principle still land a completed profile in the gap
      // between this read and the upsert below; closing that fully
      // would require a database-level constraint this application
      // code does not add and cannot claim.
      const alreadyComplete = await hasCompletedProfile(user.id);

      if (!alreadyComplete) {
        const { error: saveError } = await upsertProfile(user.id, {
          fullName: pending.fullName,
          school: pending.school,
          course: pending.course,
          yearLevel: pending.yearLevel,
        });

        if (saveError) throw saveError;
      }
    } catch (saveErr) {
      console.error("OTP signup profile save error:", saveErr);
    }
  }

  // Step 51G.29E (Part B): the password-signup counterpart to
  // reconcileOtpSignupProfile above — same shape, same guarantees,
  // deliberately NOT merged into one shared function, since the two
  // candidate sources (an in-memory ref vs. auth user_metadata) have
  // different lifecycles (single-use-and-cleared vs. persistent —
  // see the metadata-sourced branch in applySignedInUser below for
  // why that difference matters). `metadata` here has already been
  // shape-validated by extractPasswordSignupMetadata() before this is
  // ever called — this function itself only concerns the save.
  async function reconcilePasswordSignupProfile(user, metadata) {
    try {
      // Requirement 6: never overwrite a real, already-completed
      // profile — same sequential check-then-upsert pattern and same
      // disclosed limitation as reconcileOtpSignupProfile above (not
      // an atomic database-level guarantee).
      const alreadyComplete = await hasCompletedProfile(user.id);

      if (!alreadyComplete) {
        const { error: saveError } = await upsertProfile(user.id, {
          fullName: metadata.fullName,
          school: metadata.school,
          course: metadata.course,
          yearLevel: metadata.yearLevel,
        });

        if (saveError) throw saveError;
      }
    } catch (saveErr) {
      // Requirement 10 fallback: log only — the caller's own
      // checkProfile() call falls through to the normal ProfileSetup
      // screen exactly as if no metadata had existed at all.
      console.error("Password signup profile save error:", saveErr);
    }
  }

  // Step 51G.26C/51G.26E: the single place a SIGNED_IN event is
  // turned into profile state. A pending OTP-signup profile (if any)
  // is always fully resolved — saved or given up on — BEFORE
  // needsProfile is ever set, never after, which is what prevents the
  // premature ProfileSetup flash. Step 51G.26E additionally makes
  // this safe for OVERLAPPING SIGNED_IN callbacks for the same user:
  // instead of each one independently racing to save and then
  // independently deciding whether it's "still current" before
  // calling checkProfile (which let a newer callback's checkProfile
  // run before an older callback's still-in-flight save had landed),
  // every callback for the same user now joins and awaits the SAME
  // save via pendingProfileReconcileRef, so by the time ANY of them
  // reaches checkProfile() below, the save (if any) has already
  // fully settled.
  async function applySignedInUser(user, { silent, myToken }) {
    const stillCurrent = () =>
      authEventTokenRef.current === myToken;

    // Synchronous, same tick as the SIGNED_IN event itself — covers
    // the whole combined operation below (any pending save + the
    // checkProfile call), so there is no gap where profileLoading is
    // false while real work is still in flight.
    if (!silent) setProfileLoading(true);

    let reconcile = pendingProfileReconcileRef.current;

    // A reconciliation for a DIFFERENT user is in flight (e.g. a
    // very fast sign-out/sign-in as someone else) — never let this
    // callback piggyback on the wrong one.
    if (reconcile && reconcile.userId !== user.id) {
      reconcile = null;
    }

    if (!reconcile) {
      const pending = pendingOtpSignupProfileRef.current;
      const pendingMatches =
        pending &&
        pending.email.trim().toLowerCase() ===
          (user.email || "").toLowerCase();

      if (pendingMatches) {
        // Consume exactly once, synchronously, before anything async
        // starts — a second overlapping callback arriving after this
        // line sees null here and joins the shared promise below
        // instead of ever re-reading the hand-off itself (Item 1 and
        // Item 2's "consume exactly once" requirements).
        pendingOtpSignupProfileRef.current = null;

        reconcile = {
          userId: user.id,
          promise: reconcileOtpSignupProfile(user, pending),
        };
        pendingProfileReconcileRef.current = reconcile;
      } else {
        // Step 51G.29E (Part B, requirement 7): the OTP hand-off above
        // keeps absolute priority — this password-signup metadata path
        // is only ever consulted when there was no OTP pending match
        // at all, so the two sources can never race for the same
        // event. Requirement 8/9: reusing the exact same
        // pendingProfileReconcileRef shape (keyed by userId) means a
        // second overlapping SIGNED_IN/INITIAL_SESSION for this same
        // user joins this SAME promise below rather than starting a
        // second read/write, and needsProfile is still only decided
        // (further down) after this fully settles — identical
        // coordination to the OTP path, reused rather than
        // reimplemented. Requirement 11: deliberately does NOT clear
        // `user.user_metadata` on success — it is left exactly as
        // Supabase wrote it; hasCompletedProfile() inside
        // reconcilePasswordSignupProfile is what makes every
        // subsequent sign-in's re-read of this same metadata a safe
        // no-op, not a one-time-consumption ref.
        const passwordSignupMetadata =
          extractPasswordSignupMetadata(user);

        if (passwordSignupMetadata) {
          reconcile = {
            userId: user.id,
            promise: reconcilePasswordSignupProfile(
              user,
              passwordSignupMetadata
            ),
          };
          pendingProfileReconcileRef.current = reconcile;
        }
      }
    }

    if (reconcile) {
      try {
        await reconcile.promise;
      } finally {
        // Only the entry's own identity match clears it — if a
        // completely unrelated newer reconciliation has already
        // replaced this ref's contents, leave that one alone.
        if (pendingProfileReconcileRef.current === reconcile) {
          pendingProfileReconcileRef.current = null;
        }
      }
    }

    if (!stillCurrent()) {
      // Superseded by a newer auth event. This caller must not apply
      // checkProfile's state (a newer callback's own call below will
      // do that with fresh, post-save data) — but it must still
      // release the loading gate it engaged above, so a superseded
      // operation never leaves profileLoading stuck.
      if (!silent) setProfileLoading(false);
      return;
    }

    // Only now, after any pending save has fully settled one way or
    // the other, does checkProfile() ever get to decide
    // needsProfile — so a successful save is always reflected before
    // the user could see a "complete your profile" screen. isStale
    // closes the remaining gap INSIDE checkProfile's own awaited
    // read (Item 3).
    await checkProfile(user, { silent, isStale: () => !stillCurrent() });
  }

  // Stage 9E-2 shared-device fix: must call unsubscribeFromPush() BEFORE
  // supabase.auth.signOut(), never from inside onAuthStateChange's
  // SIGNED_OUT branch below. GoTrueClient clears the persisted session —
  // and therefore what supabase.auth.getUser() can see — before it ever
  // emits the SIGNED_OUT event, so cleanup attempted from that event
  // handler would silently no-op every time (unsubscribeFromPush() would
  // find no authenticated user and do nothing). Calling it here, while
  // the outgoing session is still the active one, is the only place this
  // device's own push_subscriptions row can actually still be deleted
  // under its owner's RLS policy. Only unsubscribes THIS device's own Web
  // Push registration — never touches the device-local notification
  // preference (that stays exactly as Stage 9B already leaves it), never
  // touches any other device's or user's row.
  async function signOutAndCleanupPush() {
    await unsubscribeFromPush();
    await supabase.auth.signOut();
  }

  useEffect(() => {
    // Step 51G.26G (Item 2 fix): captured BEFORE the request starts —
    // this is the generation this initial load is allowed to apply.
    // onAuthStateChange is registered right after this same effect
    // and can fire a real SIGNED_IN/SIGNED_OUT before this resolves;
    // without this, that more current event's own setSession()/
    // checkProfile() result could be overwritten by this stale
    // snapshot landing afterward.
    const initialSessionToken = authEventTokenRef.current;

    supabase.auth
      .getSession()
      .then(async ({ data }) => {
        const currentSession = data.session;

        // Verify no newer auth event has superseded this BEFORE ever
        // calling setSession() — if one has, that event's own handler
        // already set session/profile/needsProfile/loading state
        // correctly; this stale snapshot must not touch any of it.
        if (authEventTokenRef.current !== initialSessionToken) return;

        setSession(currentSession);

        if (currentSession?.user) {
          await checkProfile(currentSession.user, {
            isStale: () =>
              authEventTokenRef.current !== initialSessionToken,
          });
        }

        // Check staleness again after the awaited checkProfile call,
        // before the final setLoading(false) below — a newer event
        // may have superseded this one while checkProfile's own read
        // was in flight; that event's own handler already cleared
        // `loading` itself, so there is nothing stuck left behind by
        // returning here without touching it again.
        if (authEventTokenRef.current !== initialSessionToken) return;

        setLoading(false);
      });

    const { data: listener } =
      supabase.auth.onAuthStateChange(
        (event, newSession) => {
          setSession(newSession);

          // Step 51G.26C: every event — not just SIGNED_IN — advances
          // this token, so any in-flight applySignedInUser() chain
          // from an earlier event (still awaiting its own save/read)
          // can detect it has been superseded and stop before
          // touching state or the database (Requirement 4).
          authEventTokenRef.current += 1;

          if (event === "PASSWORD_RECOVERY") {
            setIsRecovery(true);
            setLoading(false);
            return;
          }

          if (event === "SIGNED_OUT") {
            setProfile(null);
            setNeedsProfile(false);
            setProfileLoading(false);
            setShowProfile(false);
            setShowPro(false);
            setLoading(false);
            // Reset trust so the next authenticated view (even a
            // same-user re-login) always gets a full, blocking check
            // rather than silently trusting state from before sign-out.
            authedUserIdWithProfileRef.current = null;
            // Step 51G.26E (Item 2 fix): abandon any not-yet-consumed
            // OTP signup hand-off on sign-out — otherwise it could
            // later be picked up by an unrelated sign-in for the same
            // email via a different auth method.
            pendingOtpSignupProfileRef.current = null;
            return;
          }

          if (
            (event === "SIGNED_IN" || event === "INITIAL_SESSION") &&
            newSession?.user
          ) {
            // Step 51G.27B regression fix: INITIAL_SESSION is included
            // here now, not just SIGNED_IN. supabase-js emits
            // INITIAL_SESSION as soon as onAuthStateChange is
            // subscribed below — this increments authEventTokenRef
            // (line above) exactly like every other event, which
            // means it can win the race against the separate
            // getSession().then() initial loader and mark THAT
            // loader's own checkProfile call stale before it ever
            // runs (see that effect's own isStale comments). Before
            // this fix, INITIAL_SESSION fell through to the generic
            // branch below (setSession + setLoading(false) only, no
            // reconciliation at all) — so an existing user's profile/
            // plan was simply never loaded, silently rendering them
            // as a signed-in user with a null profile (e.g. a Pro
            // plan read back as Free) until an unrelated later
            // SIGNED_IN happened to fire. Routing INITIAL_SESSION
            // through the exact same applySignedInUser() path SIGNED_IN
            // already uses gives it a real, valid replacement
            // reconciliation — including setting profileLoading(true)
            // synchronously below, before this listener's own
            // unconditional setLoading(false) at the bottom runs, so
            // the combined loading gate (loading || profileLoading)
            // is never left showing "done" while a check is still
            // genuinely in flight. The now-redundant getSession()-based
            // initial loader is intentionally left in place unchanged
            // as a fallback — its own isStale guard correctly makes it
            // a no-op once INITIAL_SESSION has already won this race,
            // via the same token mechanism, with no duplicate work
            // (the shared pendingProfileReconcileRef/stillCurrent
            // machinery in applySignedInUser already coordinates two
            // reconciliations for the same user if both somehow ran).
            //
            // Tab-return loading-flash fix (pre-existing): Supabase's
            // own internal visibility-triggered session recovery
            // re-emits SIGNED_IN for the SAME already-authenticated
            // user on ordinary tab return (see authedUserIdWithProfileRef's
            // own comment above) — comparing against a ref, never
            // against session/profile React state (which this closure
            // would otherwise see as permanently stale).
            const isSameKnownUser =
              authedUserIdWithProfileRef.current === newSession.user.id;
            applySignedInUser(newSession.user, {
              silent: isSameKnownUser,
              myToken: authEventTokenRef.current,
            });
          }

          setLoading(false);
        }
      );

    return () =>
      listener.subscription.unsubscribe();
  }, []);

  /* PUBLIC: ABOUT PAGE */

  // Phase B2 Implementation #1: deliberately placed before the loading
  // gate below so /about never waits on auth/profile resolution — it
  // needs no session data at all. The explicit `!isRecovery` guard keeps
  // PASSWORD_RECOVERY's existing absolute priority completely intact:
  // if a recovery flow is in progress, control falls through exactly as
  // it did before this change, unaffected by pathname.
  if (pathname === "/about" && !isRecovery) {
    return (
      <AboutPage
        isAuthenticated={!!session}
        onNavigateHome={() => navigateTo("/")}
        onNavigateAbout={() => navigateTo("/about")}
        onNavigatePrivacy={() => navigateTo("/privacy")}
        onNavigateTerms={() => navigateTo("/terms")}
        onNavigateHelp={() => navigateTo("/help")}
        onLogin={() => {
          navigateTo("/");
          setPublicScreen("auth");
        }}
        onSignup={() => {
          navigateTo("/");
          setPublicScreen("signup");
        }}
      />
    );
  }

  // Phase B2 Implementation #2: same minimal pathname-routing pattern as
  // /about above — standalone, public, no session dependency, and
  // gated by !isRecovery so PASSWORD_RECOVERY keeps its existing
  // absolute priority over this page exactly as it does over /about.
  if (pathname === "/privacy" && !isRecovery) {
    return (
      <PrivacyPage
        isAuthenticated={!!session}
        onNavigateHome={() => navigateTo("/")}
        onNavigateAbout={() => navigateTo("/about")}
        onNavigatePrivacy={() => navigateTo("/privacy")}
        onNavigateTerms={() => navigateTo("/terms")}
        onNavigateHelp={() => navigateTo("/help")}
        onLogin={() => {
          navigateTo("/");
          setPublicScreen("auth");
        }}
        onSignup={() => {
          navigateTo("/");
          setPublicScreen("signup");
        }}
      />
    );
  }

  // Phase B2 Implementation #3: same minimal pathname-routing pattern as
  // /about and /privacy above — standalone, public, no session
  // dependency, and gated by !isRecovery so PASSWORD_RECOVERY keeps its
  // existing absolute priority over this page exactly as it does over
  // /about and /privacy.
  if (pathname === "/terms" && !isRecovery) {
    return (
      <TermsPage
        isAuthenticated={!!session}
        onNavigateHome={() => navigateTo("/")}
        onNavigateAbout={() => navigateTo("/about")}
        onNavigatePrivacy={() => navigateTo("/privacy")}
        onNavigateTerms={() => navigateTo("/terms")}
        onNavigateHelp={() => navigateTo("/help")}
        onLogin={() => {
          navigateTo("/");
          setPublicScreen("auth");
        }}
        onSignup={() => {
          navigateTo("/");
          setPublicScreen("signup");
        }}
      />
    );
  }

  // Phase B2 Implementation #4: same minimal pathname-routing pattern as
  // /about, /privacy, and /terms above — standalone, public, no session
  // dependency, and gated by !isRecovery so PASSWORD_RECOVERY keeps its
  // existing absolute priority over this page exactly as it does over
  // /about, /privacy, and /terms.
  if (pathname === "/help" && !isRecovery) {
    return (
      <HelpPage
        isAuthenticated={!!session}
        onNavigateHome={() => navigateTo("/")}
        onNavigateAbout={() => navigateTo("/about")}
        onNavigatePrivacy={() => navigateTo("/privacy")}
        onNavigateTerms={() => navigateTo("/terms")}
        onNavigateHelp={() => navigateTo("/help")}
        onLogin={() => {
          navigateTo("/");
          setPublicScreen("auth");
        }}
        onSignup={() => {
          navigateTo("/");
          setPublicScreen("signup");
        }}
      />
    );
  }

  /* LOADING */

  if (loading || profileLoading) {
    return (
      <div className="min-h-screen bg-[#F5F6FA] grid place-items-center">

        <div className="text-center">

          <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-[#3D2FE0] text-lg font-bold text-white">
            T
          </div>

          <p className="text-sm text-slate-500">
            Loading Takda…
          </p>

        </div>

      </div>
    );
  }

  /* PASSWORD RECOVERY */

  if (isRecovery) {
    return (
      <ResetPasswordScreen
        onDone={async () => {
          setIsRecovery(false);
          await signOutAndCleanupPush();
        }}
      />
    );
  }

  /* NOT LOGGED IN */

  if (!session) {
    if (publicScreen === "auth") {
      return (
        <AuthScreen
          initialMode="login"
          onBack={() => setPublicScreen("landing")}
          pendingOtpProfileRef={pendingOtpSignupProfileRef}
        />
      );
    }

    if (publicScreen === "signup") {
      return (
        <AuthScreen
          initialMode="signup"
          onBack={() => setPublicScreen("landing")}
          pendingOtpProfileRef={pendingOtpSignupProfileRef}
        />
      );
    }

    return (
      <LandingPage
        onLogin={() => setPublicScreen("auth")}
        onSignup={() => setPublicScreen("signup")}
        onNavigateAbout={() => navigateTo("/about")}
        onNavigatePrivacy={() => navigateTo("/privacy")}
        onNavigateTerms={() => navigateTo("/terms")}
        onNavigateHelp={() => navigateTo("/help")}
      />
    );
  }

  /* PROFILE SETUP */

  if (needsProfile) {
    return (
      <ProfileSetup
        user={session.user}
        onComplete={(savedProfile) => {
          setProfile(savedProfile);
          setNeedsProfile(false);
        }}
      />
    );
  }

  /* TAKDA DASHBOARD */

  return (
    <div className="min-h-screen bg-[var(--takda-bg-page)] p-0 md:p-6">

      <div className="mx-auto max-w-5xl">

        {/* TOP PROFILE BAR */}

        <div className="mb-3 flex items-center justify-between px-3 pt-3 md:px-0 md:pt-0">

          <div>
            {profile?.full_name && (
              <>
                <p className="text-xs text-slate-400">
                  Welcome back,
                </p>

                <p className="text-sm font-semibold text-[var(--takda-text-primary)]">
                  {profile.full_name}
                </p>
              </>
            )}
          </div>

          <ProfileMenu
            profile={profile}
            user={session.user}
            onOpenProfile={() =>
              setShowProfile(true)
            }
            onOpenPro={() =>
              setShowPro(true)
            }
            onLogout={() =>
              signOutAndCleanupPush()
            }
          />

        </div>

        <TakdaApp isPro={isPro} onUpgrade={() => setShowPro(true)} />

      </div>

      {/* MY PROFILE MODAL */}

      {showProfile && (
        <MyProfile
          user={session.user}
          profile={profile}
          onClose={() =>
            setShowProfile(false)
          }
          onProfileUpdated={(updatedProfile) => {
            setProfile(updatedProfile);
          }}
        />
      )}

      {showPro && (
        <ProModal
          onClose={() => setShowPro(false)}
        />
      )}

    </div>
  );
}

/* =========================
   START TAKDA
========================= */

ReactDOM.createRoot(
  document.getElementById("root")
).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
