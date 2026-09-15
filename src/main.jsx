import React, { useEffect, useRef, useState } from "react";
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
   LOGIN / SIGN UP
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
  const fileInputRef = useRef(null);

  const [fullName, setFullName] = useState("");
  const [school, setSchool] = useState("");
  const [course, setCourse] = useState("");
  const [yearLevel, setYearLevel] = useState("");

  const [selectedPhoto, setSelectedPhoto] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);

  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  /* =========================
     PHOTO PREVIEW
  ========================= */

  function selectPhoto(event) {
    const file = event.target.files?.[0];

    event.target.value = "";

    if (!file) return;

    const allowedTypes = [
      "image/jpeg",
      "image/png",
      "image/webp",
    ];

    if (!allowedTypes.includes(file.type)) {
      setMessage(
        "Please choose a JPEG, PNG, or WebP image."
      );
      return;
    }

    if (file.size > 4 * 1024 * 1024) {
      setMessage(
        "Profile picture must be 4 MB or smaller."
      );
      return;
    }

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }

    const newPreviewUrl = URL.createObjectURL(file);

    setSelectedPhoto(file);
    setPreviewUrl(newPreviewUrl);
    setMessage("");
  }

  function removePhoto() {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }

    setSelectedPhoto(null);
    setPreviewUrl(null);

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  /* =========================
     SAVE PROFILE
  ========================= */

  async function saveProfile(e) {
    e.preventDefault();

    if (!fullName.trim()) {
      setMessage("Please enter your full name.");
      return;
    }

    setSaving(true);
    setMessage("");

    let uploadedAvatarPath = null;

    try {
      let avatarUrl = null;

      /* =========================
         UPLOAD OPTIONAL PHOTO
      ========================= */

      if (selectedPhoto) {
        const extension =
          selectedPhoto.name
            .split(".")
            .pop()
            ?.toLowerCase() || "jpg";

        const filePath =
          `${user.id}/avatar-${Date.now()}.${extension}`;

        const { error: uploadError } =
          await supabase.storage
            .from("avatars")
            .upload(filePath, selectedPhoto, {
              cacheControl: "3600",
              upsert: false,
            });

        if (uploadError) {
          throw uploadError;
        }

        uploadedAvatarPath = filePath;

        const { data: publicUrlData } =
          supabase.storage
            .from("avatars")
            .getPublicUrl(filePath);

        avatarUrl =
          publicUrlData.publicUrl;
      }

      /* =========================
         SAVE STUDENT PROFILE
      ========================= */

      const { data, error } = await supabase
        .from("profiles")
        .upsert(
          {
            id: user.id,
            full_name: fullName.trim(),
            school: school.trim() || null,
            course: course.trim() || null,
            year_level: yearLevel.trim() || null,
            avatar_url: avatarUrl,
            updated_at: new Date().toISOString(),
          },
          {
            onConflict: "id",
          }
        )
        .select()
        .single();

      if (error) {
        /*
          If the image uploaded successfully but
          saving the profile failed, remove the image
          so we do not leave an unused file.
        */

        if (uploadedAvatarPath) {
          try {
            await supabase.storage
              .from("avatars")
              .remove([uploadedAvatarPath]);
          } catch (cleanupError) {
            console.warn(
              "Avatar cleanup failed:",
              cleanupError
            );
          }
        }

        throw error;
      }

      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }

      onComplete(data);
    } catch (err) {
      console.error(
        "Profile setup error:",
        err
      );

      setMessage(
        err.message ||
          "Unable to save your profile. Please try again."
      );
    } finally {
      setSaving(false);
    }
  }

  const initials = getInitials(
    fullName,
    user.email
  );

  return (
    <div className="min-h-screen bg-[#F5F6FA] flex items-center justify-center p-4 py-8">

      <div className="w-full max-w-md rounded-3xl border border-[#E4E4F0] bg-white p-6 shadow-sm">

        {/* HEADER */}

        <div className="mb-5 text-center">

          <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-[#3D2FE0] text-lg font-bold text-white">
            T
          </div>

          <h1 className="text-2xl font-bold text-[#1B1B2F]">
            Complete Your Profile
          </h1>

          <p className="mt-2 text-sm text-slate-500">
            Set up your student profile before you start using Takda.
          </p>

          <p className="mt-1 text-xs text-slate-400">
            {user.email}
          </p>

        </div>

        {/* PROFILE PICTURE */}

        <div className="mb-6 flex flex-col items-center">

          <div className="relative">

            {previewUrl ? (
              <img
                src={previewUrl}
                alt="Profile preview"
                className="h-24 w-24 rounded-full border-4 border-white object-cover shadow-md"
              />
            ) : (
              <div className="flex h-24 w-24 items-center justify-center rounded-full bg-[#3D2FE0] text-2xl font-bold text-white shadow-md">
                {initials}
              </div>
            )}

            <button
              type="button"
              onClick={() =>
                fileInputRef.current?.click()
              }
              disabled={saving}
              className="absolute -bottom-1 -right-1 flex h-9 w-9 items-center justify-center rounded-full border-2 border-white bg-[#3D2FE0] text-white shadow disabled:opacity-50"
              title="Choose profile picture"
            >
              📷
            </button>

          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={selectPhoto}
            className="hidden"
          />

          <button
            type="button"
            onClick={() =>
              fileInputRef.current?.click()
            }
            disabled={saving}
            className="mt-3 text-sm font-semibold text-[#3D2FE0] disabled:opacity-50"
          >
            {selectedPhoto
              ? "Change Photo"
              : "Upload Photo"}
          </button>

          {selectedPhoto && (
            <button
              type="button"
              onClick={removePhoto}
              disabled={saving}
              className="mt-1 text-xs font-medium text-red-500 disabled:opacity-50"
            >
              Remove Photo
            </button>
          )}

          <p className="mt-2 text-center text-xs text-slate-400">
            Optional • JPEG, PNG or WebP • Maximum 4 MB
          </p>

        </div>

        {/* PROFILE FORM */}

        <form
          onSubmit={saveProfile}
          className="space-y-4"
        >

          <div>
            <label className="mb-1 block text-sm font-medium text-[#1B1B2F]">
              Full Name{" "}
              <span className="text-red-500">
                *
              </span>
            </label>

            <input
              type="text"
              required
              value={fullName}
              onChange={(e) =>
                setFullName(e.target.value)
              }
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
              onChange={(e) =>
                setSchool(e.target.value)
              }
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
              onChange={(e) =>
                setCourse(e.target.value)
              }
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
              onChange={(e) =>
                setYearLevel(e.target.value)
              }
              placeholder="e.g. 2nd Year or Grade 12"
              className="w-full rounded-xl border border-[#E4E4F0] px-3 py-3 text-sm outline-none focus:border-[#3D2FE0]"
            />
          </div>

          {message && (
            <div className="rounded-xl bg-red-50 px-3 py-2.5 text-center text-xs text-red-600">
              {message}
            </div>
          )}

          <button
            type="submit"
            disabled={saving}
            className="w-full rounded-xl bg-[#3D2FE0] py-3 text-sm font-semibold text-white shadow-sm disabled:opacity-50"
          >
            {saving
              ? "Setting up your profile..."
              : "Save & Continue"}
          </button>

        </form>

        <p className="mt-4 text-center text-xs text-slate-400">
          You can update your profile anytime.
        </p>

      </div>

    </div>
  );
}
