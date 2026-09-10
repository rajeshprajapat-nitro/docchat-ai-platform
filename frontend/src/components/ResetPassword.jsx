import { useState } from "react";
import { resetPassword } from "../api";

export default function ResetPassword() {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  const token = new URLSearchParams(window.location.search).get("token");

  async function handleSubmit(e) {
    e.preventDefault();

    setError("");
    setSuccess("");

    if (!token) {
      setError("Invalid password reset link.");
      return;
    }

    if (newPassword.length < 6) {
      setError("Password must be at least 6 characters long.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);

    try {
      const data = await resetPassword(token, newPassword);

      setSuccess(
        data.message ||
          "Password reset successfully. You can now log in."
      );

      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      setError(err.message || "Unable to reset password.");
    } finally {
      setLoading(false);
    }
  }

  function goToLogin() {
    window.history.replaceState({}, "", "/");
    window.location.reload();
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-brand-50 to-white dark:from-gray-950 dark:to-gray-900 px-4">
      <div className="w-full max-w-sm bg-white dark:bg-gray-900 rounded-2xl shadow-xl p-8">

        {/* Header */}
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">
          DocChat
        </h1>

        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
          Reset your password
        </p>

        {!success ? (
          <form onSubmit={handleSubmit} className="space-y-4">

            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                Create a new password
              </h2>

              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Enter your new password below.
              </p>
            </div>

            {/* New Password */}
            <input
              type="password"
              required
              minLength={6}
              placeholder="New password"
              value={newPassword}
              onChange={(e) => {
                setNewPassword(e.target.value);
                setError("");
              }}
              className="w-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />

            {/* Confirm Password */}
            <input
              type="password"
              required
              minLength={6}
              placeholder="Confirm new password"
              value={confirmPassword}
              onChange={(e) => {
                setConfirmPassword(e.target.value);
                setError("");
              }}
              className="w-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />

            {/* Error */}
            {error && (
              <p className="text-sm text-red-500">
                {error}
              </p>
            )}

            {/* Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium py-2.5 rounded-lg transition disabled:opacity-60"
            >
              {loading ? "Resetting…" : "Reset password"}
            </button>

            <button
              type="button"
              onClick={goToLogin}
              className="w-full text-sm text-brand-600 dark:text-brand-400 hover:underline py-1"
            >
              ← Back to Log in
            </button>
          </form>
        ) : (
          <div className="space-y-4">

            <div className="text-center">
              <div className="text-4xl mb-3">
                ✓
              </div>

              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                Password reset successful
              </h2>

              <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
                Your password has been updated successfully.
                You can now log in using your new password.
              </p>
            </div>

            <button
              type="button"
              onClick={goToLogin}
              className="w-full bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium py-2.5 rounded-lg transition"
            >
              Go to Log in
            </button>

          </div>
        )}
      </div>
    </div>
  );
}