import { useState } from "react";
import { motion } from "framer-motion";
import { useQueryClient } from "@tanstack/react-query";
import { getGetMeQueryKey } from "@workspace/api-client-react";
import { useAuth } from "@/lib/auth";

export function NameWizard() {
  const { token, user, isLoading } = useAuth();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const needsName = !isLoading && !!token && !!user && !user.name;
  if (!needsName) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      setError("نام باید حداقل ۲ کاراکتر باشه");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/auth/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: trimmed }),
      });
      if (!res.ok) throw new Error("خطا در ذخیره‌سازی");
      await queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
    } catch {
      setError("مشکلی پیش اومد، دوباره امتحان کن");
    } finally {
      setSaving(false);
    }
  };

  return (
    <motion.div
      className="fixed inset-0 z-[200] flex flex-col items-center justify-center px-6"
      style={{ background: "linear-gradient(160deg, #0a0617 0%, #0f0a1e 50%, #0c0818 100%)" }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      dir="rtl"
    >
      {/* Logo / decoration */}
      <motion.div
        className="mb-8 flex flex-col items-center gap-2"
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.1, duration: 0.4 }}
      >
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center mb-2"
          style={{ background: "linear-gradient(135deg, #7c3aed, #4f46e5)", boxShadow: "0 0 40px rgba(124,58,237,0.4)" }}
        >
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
        </div>
        <h1 className="text-xl font-black text-white">خوش اومدی!</h1>
        <p className="text-sm text-center" style={{ color: "rgba(255,255,255,0.5)" }}>
          قبل از شروع، فقط اسمت رو بهمون بگو
        </p>
      </motion.div>

      {/* Form */}
      <motion.form
        onSubmit={handleSubmit}
        className="w-full max-w-[380px] flex flex-col gap-4"
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.2, duration: 0.4 }}
      >
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-bold" style={{ color: "rgba(255,255,255,0.6)" }}>
            نام و نام خانوادگی
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => { setName(e.target.value); setError(""); }}
            placeholder="مثلاً: علی رضایی"
            autoFocus
            className="w-full rounded-xl px-4 py-3.5 text-sm font-bold text-white outline-none transition-all"
            style={{
              background: "rgba(255,255,255,0.06)",
              border: error ? "1.5px solid rgba(239,68,68,0.7)" : "1.5px solid rgba(124,58,237,0.35)",
              caretColor: "#7c3aed",
            }}
            onFocus={(e) => {
              if (!error) e.currentTarget.style.borderColor = "rgba(124,58,237,0.8)";
            }}
            onBlur={(e) => {
              if (!error) e.currentTarget.style.borderColor = "rgba(124,58,237,0.35)";
            }}
          />
          {error && (
            <p className="text-xs text-red-400 font-bold">{error}</p>
          )}
        </div>

        <button
          type="submit"
          disabled={saving || name.trim().length < 2}
          className="w-full py-3.5 rounded-xl text-sm font-black transition-all active:scale-[0.97] disabled:opacity-50"
          style={{ background: "linear-gradient(135deg, #7c3aed, #4f46e5)", color: "white", boxShadow: "0 4px 20px rgba(124,58,237,0.4)" }}
        >
          {saving ? "در حال ذخیره..." : "ادامه"}
        </button>
      </motion.form>
    </motion.div>
  );
}
