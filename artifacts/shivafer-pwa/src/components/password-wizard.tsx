import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useQueryClient } from "@tanstack/react-query";
import { getGetMeQueryKey } from "@workspace/api-client-react";
import { useAuth } from "@/lib/auth";
import { Eye, EyeOff, Lock } from "lucide-react";

const ONE_HOUR_MS = 60 * 60 * 1000;

export function PasswordWizard() {
  const { token, user, isLoading } = useAuth();
  const queryClient = useQueryClient();
  const [visible, setVisible] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (isLoading || !token || !user || !user.name || user.hasPassword) {
      setVisible(false);
      return;
    }

    const registeredAt = new Date(user.createdAt).getTime();
    const now = Date.now();
    const elapsed = now - registeredAt;

    if (elapsed >= ONE_HOUR_MS) {
      setVisible(true);
      return;
    } else {
      const delay = ONE_HOUR_MS - elapsed;
      const timer = setTimeout(() => setVisible(true), delay);
      return () => clearTimeout(timer);
    }
  }, [isLoading, token, user]);

  if (!visible) return null;

  const strength = (() => {
    if (password.length === 0) return 0;
    let s = 0;
    if (password.length >= 6) s++;
    if (password.length >= 8) s++;
    if (/[A-Z]/.test(password)) s++;
    if (/[0-9]/.test(password)) s++;
    if (/[^A-Za-z0-9]/.test(password)) s++;
    return s;
  })();

  const strengthColor = strength <= 1 ? "#ef4444" : strength <= 2 ? "#f59e0b" : strength <= 3 ? "#eab308" : "#22c55e";
  const strengthLabel = strength <= 1 ? "ضعیف" : strength <= 2 ? "متوسط" : strength <= 3 ? "خوب" : "قوی";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) { setError("رمز عبور باید حداقل ۶ کاراکتر باشه"); return; }
    if (password !== confirm) { setError("رمز عبور و تکرار آن یکسان نیستند"); return; }
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ newPassword: password }),
      });
      if (!res.ok) throw new Error();
      await queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
      setVisible(false);
    } catch {
      setError("مشکلی پیش اومد، دوباره امتحان کن");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[200] flex flex-col items-center justify-center px-6"
        style={{ background: "linear-gradient(160deg, #0a0617 0%, #0f0a1e 50%, #0c0818 100%)" }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.35 }}
        dir="rtl"
      >
        {/* Icon */}
        <motion.div
          className="mb-8 flex flex-col items-center gap-3"
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.1, duration: 0.4 }}
        >
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center"
            style={{ background: "linear-gradient(135deg, #7c3aed, #4f46e5)", boxShadow: "0 0 40px rgba(124,58,237,0.4)" }}
          >
            <Lock className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-xl font-black text-white">رمز عبور بساز</h1>
          <p className="text-sm text-center" style={{ color: "rgba(255,255,255,0.5)" }}>
            برای امنیت حسابت یک رمز عبور انتخاب کن
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
          {/* Password field */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold" style={{ color: "rgba(255,255,255,0.6)" }}>
              رمز عبور
            </label>
            <div className="relative">
              <input
                type={showPw ? "text" : "password"}
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError(""); }}
                placeholder="حداقل ۶ کاراکتر"
                autoFocus
                className="w-full rounded-xl px-4 py-3.5 pr-12 text-sm font-bold text-white outline-none transition-all"
                style={{
                  background: "rgba(255,255,255,0.06)",
                  border: error ? "1.5px solid rgba(239,68,68,0.7)" : "1.5px solid rgba(124,58,237,0.35)",
                  caretColor: "#7c3aed",
                  direction: "ltr",
                  textAlign: "right",
                }}
                onFocus={(e) => { if (!error) e.currentTarget.style.borderColor = "rgba(124,58,237,0.8)"; }}
                onBlur={(e) => { if (!error) e.currentTarget.style.borderColor = "rgba(124,58,237,0.35)"; }}
              />
              <button
                type="button"
                onClick={() => setShowPw(v => !v)}
                className="absolute left-3 top-1/2 -translate-y-1/2 p-1"
                style={{ color: "rgba(255,255,255,0.4)" }}
              >
                {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {/* Strength bar */}
            {password.length > 0 && (
              <div className="flex items-center gap-2 mt-1">
                <div className="flex gap-1 flex-1">
                  {[1, 2, 3, 4, 5].map(i => (
                    <div
                      key={i}
                      className="h-1 flex-1 rounded-full transition-all duration-300"
                      style={{ background: i <= strength ? strengthColor : "rgba(255,255,255,0.1)" }}
                    />
                  ))}
                </div>
                <span className="text-[10px] font-bold" style={{ color: strengthColor }}>{strengthLabel}</span>
              </div>
            )}
          </div>

          {/* Confirm field */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold" style={{ color: "rgba(255,255,255,0.6)" }}>
              تکرار رمز عبور
            </label>
            <div className="relative">
              <input
                type={showConfirm ? "text" : "password"}
                value={confirm}
                onChange={(e) => { setConfirm(e.target.value); setError(""); }}
                placeholder="رمز عبور رو دوباره وارد کن"
                className="w-full rounded-xl px-4 py-3.5 pr-12 text-sm font-bold text-white outline-none transition-all"
                style={{
                  background: "rgba(255,255,255,0.06)",
                  border: error ? "1.5px solid rgba(239,68,68,0.7)" : "1.5px solid rgba(124,58,237,0.35)",
                  caretColor: "#7c3aed",
                  direction: "ltr",
                  textAlign: "right",
                }}
                onFocus={(e) => { if (!error) e.currentTarget.style.borderColor = "rgba(124,58,237,0.8)"; }}
                onBlur={(e) => { if (!error) e.currentTarget.style.borderColor = "rgba(124,58,237,0.35)"; }}
              />
              <button
                type="button"
                onClick={() => setShowConfirm(v => !v)}
                className="absolute left-3 top-1/2 -translate-y-1/2 p-1"
                style={{ color: "rgba(255,255,255,0.4)" }}
              >
                {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {error && <p className="text-xs text-red-400 font-bold -mt-1">{error}</p>}

          <button
            type="submit"
            disabled={saving || password.length < 6 || password !== confirm}
            className="w-full py-3.5 rounded-xl text-sm font-black transition-all active:scale-[0.97] disabled:opacity-40"
            style={{ background: "linear-gradient(135deg, #7c3aed, #4f46e5)", color: "white", boxShadow: "0 4px 20px rgba(124,58,237,0.4)" }}
          >
            {saving ? "در حال ذخیره..." : "تأیید و ادامه"}
          </button>
        </motion.form>
      </motion.div>
    </AnimatePresence>
  );
}
