import React, { useEffect, useMemo, useRef, useState } from "react";
import ReactDOM from "react-dom/client";
import TakdaApp from "./App";
import { supabase } from "./lib/supabase";
import { installSupabaseStorageAdapter } from "./lib/storageAdapter";
import "./index.css";

installSupabaseStorageAdapter();

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

function LandingPage({ onLogin, onSignup }) {
  const [legalPage, setLegalPage] = useState(null);

  const legalContent = {
    privacy: {
      title: "Privacy Policy",
      body: [
        "Takda collects account information such as your email address and the profile details you choose to provide so the app can provide your student workspace.",
        "Academic information you add, such as subjects, activities, grades, calendar items, and notes, is used to provide Takda's features and is associated with your account.",
        "Takda uses service providers, including Supabase for authentication and data storage and Vercel for website hosting. We do not sell your personal information.",
        "You are responsible for the information you choose to enter. Avoid storing highly sensitive information that is not necessary for managing your schoolwork.",
        "This policy may be updated as Takda develops. Material changes should be reflected on this page."
      ]
    },
    terms: {
      title: "Terms of Service",
      body: [
        "Takda is a student productivity tool for organizing academic tasks and information. By using Takda, you agree to use the service lawfully and responsibly.",
        "You are responsible for maintaining the security of your account and for the content you add to your workspace.",
        "Takda is provided on an as-available basis. While we work to keep the service reliable, uninterrupted availability or permanent preservation of every item cannot be guaranteed.",
        "Do not misuse the service, attempt unauthorized access, interfere with other users, or upload unlawful or harmful content.",
        "Features and these terms may change as Takda grows. Continued use after an update means you accept the updated terms."
      ]
    }
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
              <button type="button" onClick={() => setLegalPage("privacy")} className="hover:text-[#3D2FE0]">Privacy Policy</button>
              <button type="button" onClick={() => setLegalPage("terms")} className="hover:text-[#3D2FE0]">Terms of Service</button>
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
   LOGIN / SIGN UP
========================= */

function AuthScreen({ initialMode = "login", onBack }) {
  const [mode, setMode] = useState(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e) {
    e.preventDefault();

    setLoading(true);
    setMessage("");

    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            emailRedirectTo: window.location.origin,
          },
        });

        if (error) throw error;

        setMessage(
          "Account created. Please check your email and confirm your account."
        );
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
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

          throw error;
        }
      }
    } catch (err) {
      setMessage(err.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  async function forgotPassword() {
    if (!email.trim()) {
      setMessage("Enter your email address first.");
      return;
    }

    setLoading(true);
    setMessage("");

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(
        email.trim(),
        {
          redirectTo: window.location.origin,
        }
      );

      if (error) {
        if (error.status === 429) {
          throw new Error(
            "Too many password reset requests. Please wait before trying again."
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
      setLoading(false);
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

        <form onSubmit={submit} className="space-y-3">

          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email address"
            autoComplete="email"
            className="w-full rounded-xl border border-[#E4E4F0] px-3 py-3 text-sm outline-none focus:border-[#3D2FE0]"
          />

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
              disabled={loading}
              className="w-full text-right text-xs font-medium text-[#3D2FE0] disabled:opacity-50"
            >
              Forgot password?
            </button>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-[#3D2FE0] py-3 text-sm font-semibold text-white disabled:opacity-50"
          >
            {loading
              ? "Please wait..."
              : mode === "login"
              ? "Log in"
              : "Create account"}
          </button>
        </form>

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

    setSaving(true);
    setMessage("");

    try {
      const { data, error } = await supabase
        .from("profiles")
        .upsert(
          {
            id: user.id,
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
              Program / Track
            </label>

            <input
              type="text"
              value={course}
              onChange={(e) => setCourse(e.target.value)}
              placeholder="e.g. BS Information Technology"
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
   MAIN APP / SESSION
========================= */

function Root() {
  const [session, setSession] = useState(null);

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

  async function checkProfile(user) {
    if (!user) {
      setProfile(null);
      setNeedsProfile(false);
      setProfileLoading(false);
      return;
    }

    setProfileLoading(true);

    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .maybeSingle();

      if (error) throw error;

      if (data && data.full_name) {
        setProfile(data);
        setNeedsProfile(false);
      } else {
        setProfile(null);
        setNeedsProfile(true);
      }
    } catch (err) {
      console.error(
        "Profile loading error:",
        err
      );

      setProfile(null);
      setNeedsProfile(true);
    } finally {
      setProfileLoading(false);
    }
  }

  useEffect(() => {
    supabase.auth
      .getSession()
      .then(async ({ data }) => {
        const currentSession = data.session;

        setSession(currentSession);

        if (currentSession?.user) {
          await checkProfile(
            currentSession.user
          );
        }

        setLoading(false);
      });

    const { data: listener } =
      supabase.auth.onAuthStateChange(
        (event, newSession) => {
          setSession(newSession);

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
            return;
          }

          if (
            event === "SIGNED_IN" &&
            newSession?.user
          ) {
            checkProfile(newSession.user);
          }

          setLoading(false);
        }
      );

    return () =>
      listener.subscription.unsubscribe();
  }, []);

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
          await supabase.auth.signOut();
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
        />
      );
    }

    if (publicScreen === "signup") {
      return (
        <AuthScreen
          initialMode="signup"
          onBack={() => setPublicScreen("landing")}
        />
      );
    }

    return (
      <LandingPage
        onLogin={() => setPublicScreen("auth")}
        onSignup={() => setPublicScreen("signup")}
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
    <div className="min-h-screen bg-[#F5F6FA] p-0 md:p-6">

      <div className="mx-auto max-w-5xl">

        {/* TOP PROFILE BAR */}

        <div className="mb-3 flex items-center justify-between px-3 pt-3 md:px-0 md:pt-0">

          <div>
            {profile?.full_name && (
              <>
                <p className="text-xs text-slate-400">
                  Welcome back,
                </p>

                <p className="text-sm font-semibold text-[#1B1B2F]">
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
              supabase.auth.signOut()
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
