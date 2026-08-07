import { motion, AnimatePresence } from "framer-motion";
import logoGold from "@/assets/logo-gold.webp";

interface Props {
  visible: boolean;
}

const SPARKLES = [
  { x: 22, y: 24, delay: 0.3,  size: 3 },
  { x: 75, y: 18, delay: 0.9,  size: 2 },
  { x: 82, y: 52, delay: 1.3,  size: 2 },
  { x: 15, y: 58, delay: 0.6,  size: 2.5 },
  { x: 50, y: 7,  delay: 1.05, size: 2 },
  { x: 60, y: 78, delay: 0.45, size: 1.8 },
  { x: 30, y: 80, delay: 1.5,  size: 2.2 },
];

export function SplashScreen({ visible }: Props) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="fixed inset-0 z-[9999] flex flex-col items-center overflow-hidden select-none"
          style={{ background: "var(--splash-bg)", direction: "ltr" }}
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.55, ease: "easeInOut" }}
        >
          {/* Deep background radial */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                "radial-gradient(ellipse 70% 60% at 50% 40%, rgba(240,192,64,0.07) 0%, rgba(124,58,237,0.04) 55%, transparent 100%)",
            }}
          />

          {/* Sparkle dots */}
          {SPARKLES.map((s, i) => (
            <motion.div
              key={i}
              className="absolute rounded-full pointer-events-none"
              style={{ left: `${s.x}%`, top: `${s.y}%`, width: s.size, height: s.size, background: "#e8b800" }}
              animate={{ opacity: [0, 0.7, 0], scale: [0.5, 1.6, 0.5] }}
              transition={{ duration: 2.4, delay: s.delay, repeat: Infinity, ease: "easeInOut" }}
            />
          ))}

          {/* ── Center group: logo + texts ── */}
          <div className="flex-1 flex flex-col items-center justify-center w-full">
          {/* ── Logo ── */}
          <motion.div
            className="relative flex items-center justify-center"
            initial={{ opacity: 0, scale: 0.55 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          >
            {/* Wide soft base glow behind logo */}
            <motion.div
              className="absolute pointer-events-none"
              style={{
                width: 140, height: 140, borderRadius: "50%",
                background: "radial-gradient(circle, rgba(240,192,64,0.09) 0%, rgba(200,150,20,0.03) 45%, transparent 70%)",
                filter: "blur(28px)",
              }}
              animate={{ scale: [0.88, 1.12, 0.88], opacity: [0.5, 1, 0.5] }}
              transition={{ duration: 3.5, repeat: Infinity, ease: "easeInOut" }}
            />
            {/* Rotating golden halo ring */}
            <motion.div
              className="absolute pointer-events-none"
              style={{
                width: 160, height: 160, borderRadius: "50%",
                background: "conic-gradient(from 0deg, transparent 60%, rgba(240,192,64,0.28) 75%, rgba(255,230,100,0.42) 82%, rgba(240,192,64,0.28) 89%, transparent 100%)",
                filter: "blur(4px)",
              }}
              animate={{ rotate: 360 }}
              transition={{ duration: 3.2, repeat: Infinity, ease: "linear" }}
            />
            {/* Inner halo ring */}
            <motion.div
              className="absolute pointer-events-none"
              style={{
                width: 150, height: 150, borderRadius: "50%",
                background: "conic-gradient(from 180deg, transparent 55%, rgba(255,220,80,0.18) 70%, rgba(240,192,64,0.25) 78%, rgba(255,220,80,0.18) 86%, transparent 100%)",
                filter: "blur(3px)",
              }}
              animate={{ rotate: -360 }}
              transition={{ duration: 4.8, repeat: Infinity, ease: "linear" }}
            />
            {/* Logo image */}
            <motion.img
              src={logoGold}
              alt="آکادمی شیوافر"
              className="relative z-10"
              style={{ width: 300, height: 300, objectFit: "contain", mixBlendMode: "var(--logo-blend-mode)" as React.CSSProperties["mixBlendMode"] }}
              draggable={false}
              animate={{ scale: [1, 1.03, 1] }}
              transition={{ duration: 3.5, repeat: Infinity, ease: "easeInOut" }}
            />
          </motion.div>

          {/* ── Texts — below logo ── */}
          <div className="flex flex-col items-center" style={{ marginTop: 28 }}>
            <motion.p
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.38, delay: 0.14 }}
              className="font-black uppercase text-center"
              style={{
                fontSize: 20,
                letterSpacing: "0.12em",
                background: "var(--splash-title-gradient)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              Shivafar Academy
            </motion.p>

            <motion.div
              initial={{ scaleX: 0, opacity: 0 }}
              animate={{ scaleX: 1, opacity: 1 }}
              transition={{ duration: 0.4, delay: 0.28 }}
              style={{
                width: 80, height: 1, marginTop: 12, marginBottom: 12,
                background: "linear-gradient(90deg, transparent, rgba(240,192,64,0.7), transparent)",
              }}
            />

            <motion.p
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: 0.38 }}
              className="text-sm font-semibold tracking-wide text-center"
              style={{ color: "var(--splash-subtitle)" }}
            >
              پلتفرم پولسازی اینترنتی
            </motion.p>

            {/* ── Progress bar — below subtitle ── */}
            <motion.div
              className="rounded-full overflow-hidden"
              style={{
                width: 120,
                height: 4,
                marginTop: 20,
                background: "var(--splash-bar-track)",
              }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4 }}
            >
              <motion.div
                className="h-full rounded-full"
                style={{
                  background: "linear-gradient(90deg, #f0c040, #a78bfa)",
                  transformOrigin: "left center",
                  scaleX: 0,
                }}
                animate={{ scaleX: 1 }}
                transition={{ duration: 2.65, delay: 0.3, ease: "linear" }}
              />
            </motion.div>
          </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
