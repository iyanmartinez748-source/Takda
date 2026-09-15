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
   PROFILE MENU
========================= */

function ProfileMenu({
  profile,
  user,
  onOpenProfile,
  onLogout,
}) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);

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
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-64 overflow-hidden rounded-2xl border border-[#E4E4F0] bg-white shadow-lg">

          <div className="border-b border-[#E4E4F0] p-4">

            <div className="flex items-center gap-3">

              <Avatar
                profile={profile}
                email={user.email}
              />

              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-[#1B1B2F]">
                  {profile?.full_name || "Takda Student"}
                </p>

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
    return <AuthScreen />;
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
            onLogout={() =>
              supabase.auth.signOut()
            }
          />

        </div>

        <TakdaApp />

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
