
import { useState } from "react";
import { login, signup, forgotPassword } from "../api";

export default function AuthScreen({ onAuthenticated }) {
  const [mode, setMode] = useState("login");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();

    setError("");
    setSuccess("");
    setLoading(true);

    try {
      const data =
        mode === "login"
          ? await login(email, password)
          : await signup(email, password, fullName);

      localStorage.setItem("token", data.access_token);

      onAuthenticated(data.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleForgotPassword(e) {
    e.preventDefault();

    setError("");
    setSuccess("");

    if (!email.trim()) {
      setError("Please enter your email address.");
      return;
    }

    setLoading(true);

    try {
      const data = await forgotPassword(email.trim());

      setSuccess(
        data.message ||
          "If an account exists with this email, a password reset link has been sent."
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function switchMode(newMode) {
    setMode(newMode);
    setError("");
    setSuccess("");
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-brand-50 to-white dark:from-gray-950 dark:to-gray-900 px-4">
      <div className="w-full max-w-sm bg-white dark:bg-gray-900 rounded-2xl shadow-xl p-8">

      {/* Header */}
<div className="flex flex-col items-center mb-1">
  <img
    src="/logo-full.png"
    alt="DocChat"
    className="h-24 w-auto object-contain dark:hidden"
  />

  <img
    src="/logo-full-dark.png"
    alt="DocChat"
    className="h-24 w-auto object-contain hidden dark:block"
  />
</div>

        {/* Login / Signup Tabs */}
        {mode !== "forgot" && (
          <div className="flex mb-6 rounded-lg bg-gray-100 dark:bg-gray-800 p-1">
            {["login", "signup"].map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => switchMode(m)}
                className={`flex-1 py-1.5 text-sm font-medium rounded-md transition ${
                  mode === m
                    ? "bg-white dark:bg-gray-700 shadow text-brand-700 dark:text-brand-300"
                    : "text-gray-500 dark:text-gray-400"
                }`}
              >
                {m === "login" ? "Log in" : "Sign up"}
              </button>
            ))}
          </div>
        )}

        {/* =========================
            FORGOT PASSWORD
           ========================= */}

        {mode === "forgot" ? (
          <form onSubmit={handleForgotPassword} className="space-y-4">

            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                Forgot your password?
              </h2>

              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Enter your email address and we'll send you a password reset
                link.
              </p>
            </div>

            {/* Email */}
            <input
              type="email"
              required
              className="w-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              placeholder="Email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setError("");
                setSuccess("");
              }}
            />

            {/* Error */}
            {error && (
              <p className="text-sm text-red-500">
                {error}
              </p>
            )}

            {/* Success */}
            {success && (
              <p className="text-sm text-green-600 dark:text-green-400">
                {success}
              </p>
            )}

            {/* Send Reset Link */}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium py-2.5 rounded-lg transition disabled:opacity-60"
            >
              {loading ? "Sending…" : "Send reset link"}
            </button>

            {/* Back to Login */}
            <button
              type="button"
              onClick={() => switchMode("login")}
              className="w-full text-sm text-brand-600 dark:text-brand-400 hover:underline py-1"
            >
              ← Back to Log in
            </button>
          </form>
        ) : (

          /* =========================
             LOGIN / SIGNUP
             ========================= */

          <form onSubmit={handleSubmit} className="space-y-3">

            {/* Full Name - Signup Only */}
            {mode === "signup" && (
              <input
                className="w-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                placeholder="Full name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
              />
            )}

            {/* Email */}
            <input
              type="email"
              required
              className="w-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              placeholder="Email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setError("");
                setSuccess("");
              }}
            />

            {/* Password */}
            <input
              type="password"
              required
              minLength={6}
              className="w-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              placeholder="Password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setError("");
                setSuccess("");
              }}
            />

            {/* Forgot Password */}
            {mode === "login" && (
              <div className="text-right -mt-1">
                <button
                  type="button"
                  onClick={() => switchMode("forgot")}
                  className="text-sm text-brand-600 dark:text-brand-400 hover:underline"
                >
                  Forgot password?
                </button>
              </div>
            )}

            {/* Error */}
            {error && (
              <p className="text-sm text-red-500">
                {error}
              </p>
            )}

            {/* Success */}
            {success && (
              <p className="text-sm text-green-600 dark:text-green-400">
                {success}
              </p>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium py-2.5 rounded-lg transition disabled:opacity-60"
            >
              {loading
                ? "Please wait…"
                : mode === "login"
                ? "Log in"
                : "Create account"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

