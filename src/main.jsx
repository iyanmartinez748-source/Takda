import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import TakdaApp from "./App";
import { supabase } from "./lib/supabase";
import { installSupabaseStorageAdapter } from "./lib/storageAdapter";
import "./index.css";

installSupabaseStorageAdapter();

/* =========================
   LOGIN / SIGN UP SCREEN
========================= */

function AuthScreen() {
  const [mode, setMode] = useState("login");
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

        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-[#3D2FE0] text-lg font-bold text-white">
            T
          </div>

          <h1 className="text-2xl font-bold text-[#1B1B2F]">
            Takda
          </h1>

          <p className="mt-1 text-sm text-slate-500">
            Your academic task manager
          </p>
        </div>

        <form onSubmit={submit} className="space-y-3">

          {/* EMAIL */}

          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email address"
            autoComplete="email"
            className="w-full rounded-xl border border-[#E4E4F0] px-3 py-3 text-sm outline-none focus:border-[#3D2FE0]"
          />

          {/* PASSWORD + SHOW/HIDE */}

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

          {/* FORGOT PASSWORD */}

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

          {/* LOGIN / CREATE ACCOUNT */}

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

        {/* MESSAGE */}

        {message && (
          <p className="mt-3 text-center text-xs text-slate-600">
            {message}
          </p>
        )}

        {/* SWITCH LOGIN / SIGN UP */}

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
   RESET PASSWORD SCREEN
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
      setMessage(
        "Password must be at least 6 characters."
      );
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

        <form
          onSubmit={updatePassword}
          className="space-y-3"
        >

          {/* NEW PASSWORD */}

          <div className="relative">

            <input
              type={showPassword ? "text" : "password"}
              required
              minLength={6}
              value={password}
              onChange={(e) =>
                setPassword(e.target.value)
              }
              placeholder="New password"
              autoComplete="new-password"
              className="w-full rounded-xl border border-[#E4E4F0] px-3 py-3 pr-16 text-sm outline-none focus:border-[#3D2FE0]"
            />

            <button
              type="button"
              onClick={() =>
                setShowPassword(
                  (current) => !current
                )
              }
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-[#3D2FE0]"
            >
              {showPassword ? "Hide" : "Show"}
            </button>

          </div>

          {/* CONFIRM PASSWORD */}

          <div className="relative">

            <input
              type={
                showConfirmPassword
                  ? "text"
                  : "password"
              }
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
                setShowConfirmPassword(
                  (current) => !current
                )
              }
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-[#3D2FE0]"
            >
              {showConfirmPassword
                ? "Hide"
                : "Show"}
            </button>

          </div>

          {/* UPDATE PASSWORD */}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-[#3D2FE0] py-3 text-sm font-semibold text-white disabled:opacity-50"
          >
            {loading
              ? "Updating..."
              : "Update password"}
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
   MAIN APP / SESSION
========================= */

function Root() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isRecovery, setIsRecovery] = useState(false);

  useEffect(() => {

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const { data: listener } =
      supabase.auth.onAuthStateChange(
        (event, newSession) => {

          setSession(newSession);

          if (event === "PASSWORD_RECOVERY") {
            setIsRecovery(true);
          }
        }
      );

    return () =>
      listener.subscription.unsubscribe();

  }, []);

  /* LOADING */

  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center text-slate-500">
        Loading Takda…
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
    return <AuthScreen />;
  }

  /* LOGGED IN */

  return (
    <div className="min-h-screen bg-[#F5F6FA] p-0 md:p-6">

      <div className="mx-auto max-w-5xl">

        <div className="mb-3 flex justify-end">

          <button
            type="button"
            onClick={() =>
              supabase.auth.signOut()
            }
            className="rounded-lg border border-[#E4E4F0] bg-white px-3 py-2 text-xs font-medium text-slate-600"
          >
            Log out
          </button>

        </div>

        <TakdaApp />

      </div>
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
