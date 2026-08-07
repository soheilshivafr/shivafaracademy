/**
 * iOS 26 Camera-style Glass Controls
 *
 * GlassPickerH  — horizontal swipe picker (camera mode bar)
 * GlassPickerV  — vertical swipe picker (zoom levels)
 * GlassIconBtn  — frosted glass circle icon button
 * GlassPanel    — 3-column glass grid panel (like camera settings)
 */

import { useRef, useState, useCallback } from "react";
import { motion, useMotionValue, useTransform, animate } from "framer-motion";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PickerItem {
  value: string;
  label: string;
  icon?: React.ReactNode;
}

// ─── GlassPickerH ─────────────────────────────────────────────────────────────
// Horizontal swipe picker, like the iOS Camera mode bar

const ITEM_W = 120;     // px per item slot — wider for Persian text
const ITEM_GAP = 0;

interface GlassPickerHProps {
  items: PickerItem[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

export function GlassPickerH({ items, value, onChange, className = "" }: GlassPickerHProps) {
  const selectedIndex = items.findIndex((i) => i.value === value);
  const dragX = useMotionValue(0);
  const trackRef = useRef<HTMLDivElement>(null);
  const startXRef = useRef(0);
  const isDraggingRef = useRef(false);

  // Convert selectedIndex → track translateX so selected item is centered
  // The track left edge is at 50% of container; first item starts at padW offset.
  // To center item[idx]: we need item's center to land at 0 relative to 50%.
  // item[idx] center = padW + idx * ITEM_W + ITEM_W/2, so dragX = -(padW + idx*ITEM_W + ITEM_W/2 - padW) = -(idx*ITEM_W + ITEM_W/2)
  const sideCount = Math.ceil(items.length / 2) + 1;
  const padW = sideCount * (ITEM_W + ITEM_GAP);
  const centerOffset = (idx: number) => -(idx * (ITEM_W + ITEM_GAP) + ITEM_W / 2);

  const snapTo = useCallback(
    (idx: number, instantly = false) => {
      const clamped = Math.max(0, Math.min(items.length - 1, idx));
      animate(dragX, centerOffset(clamped), {
        type: "spring",
        stiffness: 320,
        damping: 32,
        mass: 0.8,
        duration: instantly ? 0 : undefined,
      });
      if (items[clamped].value !== value) onChange(items[clamped].value);
    },
    [items, value, onChange, dragX]
  );

  // Initialise position to current selection
  const [initialised, setInitialised] = useState(false);
  if (!initialised) {
    dragX.set(centerOffset(selectedIndex < 0 ? 0 : selectedIndex));
    setInitialised(true);
  }

  // Also keep in sync if parent changes value
  const prevValue = useRef(value);
  if (prevValue.current !== value) {
    prevValue.current = value;
    const idx = items.findIndex((i) => i.value === value);
    if (idx >= 0) animate(dragX, centerOffset(idx), { type: "spring", stiffness: 320, damping: 32 });
  }

  const handleDragStart = (_: unknown, info: { point: { x: number } }) => {
    startXRef.current = info.point.x;
    isDraggingRef.current = true;
  };

  const handleDragEnd = (_: unknown, info: { offset: { x: number }; velocity: { x: number } }) => {
    isDraggingRef.current = false;
    const swipeDelta = info.offset.x;
    const velocity = info.velocity.x;

    const currentIdx = items.findIndex((i) => i.value === value);
    let targetIdx = currentIdx;

    if (Math.abs(velocity) > 200) {
      targetIdx = velocity < 0 ? currentIdx + 1 : currentIdx - 1;
    } else {
      targetIdx = currentIdx - Math.round(swipeDelta / ITEM_W);
    }

    snapTo(targetIdx);
  };

  return (
    <div
      className={`relative overflow-hidden select-none ${className}`}
      style={{ height: 52 }}
    >
      {/* Active pill indicator — truly transparent glass, text shows through */}
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10 pointer-events-none overflow-hidden"
        style={{
          width: 116,
          height: 40,
          borderRadius: 20,
          // Nearly invisible fill — just enough to catch the specular
          background: "linear-gradient(170deg, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0.02) 50%, rgba(0,0,0,0.05) 100%)",
          // Very light blur so text underneath shows clearly
          backdropFilter: "blur(3px) brightness(1.04)",
          WebkitBackdropFilter: "blur(3px) brightness(1.04)",
          border: "1px solid rgba(255,255,255,0.28)",
          boxShadow: [
            // Bright top specular strip — the main "glass" cue
            "inset 0 1.5px 0 rgba(255,255,255,0.60)",
            // Faint bottom shadow
            "inset 0 -1px 0 rgba(0,0,0,0.18)",
            // Gold rim glow
            "0 0 0 0.5px rgba(240,192,64,0.25)",
            "0 2px 14px rgba(240,192,64,0.18)",
          ].join(", "),
        }}
      >
        {/* Top lens highlight arc */}
        <div style={{
          position: "absolute",
          top: 2,
          left: "15%",
          right: "15%",
          height: "35%",
          borderRadius: "50%",
          background: "linear-gradient(180deg, rgba(255,255,255,0.38) 0%, rgba(255,255,255,0.0) 100%)",
          filter: "blur(0.5px)",
        }} />
      </div>

      {/* Draggable track — left:50% so item[0] starts at center; dragX shifts to center active item */}
      <motion.div
        ref={trackRef}
        style={{
          x: dragX,
          display: "flex",
          alignItems: "center",
          position: "absolute",
          top: 0,
          left: "50%",
          height: "100%",
          gap: ITEM_GAP,
          cursor: "grab",
          paddingLeft: padW,
          paddingRight: padW,
          marginLeft: -padW,
        }}
        drag="x"
        dragConstraints={{
          left: centerOffset(items.length - 1),
          right: centerOffset(0),
        }}
        dragElastic={0.12}
        onDragStart={handleDragStart as any}
        onDragEnd={handleDragEnd as any}
        whileDrag={{ cursor: "grabbing" }}
      >
        {items.map((item) => {
          const isSel = item.value === value;
          return (
            <PickerItemEl
              key={item.value}
              item={item}
              isSelected={isSel}
              onClick={() => {
                const idx = items.findIndex((i) => i.value === item.value);
                snapTo(idx);
              }}
            />
          );
        })}
      </motion.div>
    </div>
  );
}

function PickerItemEl({
  item,
  isSelected,
  onClick,
}: {
  item: PickerItem;
  isSelected: boolean;
  onClick: () => void;
}) {
  return (
    <div
      onClick={onClick}
      style={{
        width: ITEM_W,
        height: 52,
        flexShrink: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 3,
        cursor: "pointer",
        userSelect: "none",
        transition: "color 0.2s, opacity 0.2s",
        color: isSelected ? "#e8b800" : "rgba(255,255,255,0.45)",
        fontWeight: isSelected ? 800 : 500,
        fontSize: 13,
        letterSpacing: isSelected ? "0.01em" : "0.02em",
        opacity: isSelected ? 1 : 0.75,
        position: "relative",
        zIndex: 20,
      }}
    >
      {item.icon && (
        <span style={{ fontSize: 13, lineHeight: 1 }}>{item.icon}</span>
      )}
      <span style={{ whiteSpace: "nowrap" }}>{item.label}</span>
    </div>
  );
}

// ─── GlassPickerV ─────────────────────────────────────────────────────────────
// Vertical swipe picker (like zoom levels)

const ITEM_H = 44;

interface GlassPickerVProps {
  items: PickerItem[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

export function GlassPickerV({ items, value, onChange, className = "" }: GlassPickerVProps) {
  const selectedIndex = items.findIndex((i) => i.value === value);
  const dragY = useMotionValue(0);
  const isDraggingRef = useRef(false);

  const centerOffset = (idx: number) => -idx * ITEM_H;

  const snapTo = useCallback(
    (idx: number) => {
      const clamped = Math.max(0, Math.min(items.length - 1, idx));
      animate(dragY, centerOffset(clamped), { type: "spring", stiffness: 320, damping: 32 });
      if (items[clamped].value !== value) onChange(items[clamped].value);
    },
    [items, value, onChange, dragY]
  );

  const [initialised, setInitialised] = useState(false);
  if (!initialised) {
    dragY.set(centerOffset(selectedIndex < 0 ? 0 : selectedIndex));
    setInitialised(true);
  }

  const prevValue = useRef(value);
  if (prevValue.current !== value) {
    prevValue.current = value;
    const idx = items.findIndex((i) => i.value === value);
    if (idx >= 0) animate(dragY, centerOffset(idx), { type: "spring", stiffness: 320, damping: 32 });
  }

  const handleDragEnd = (_: unknown, info: { offset: { y: number }; velocity: { y: number } }) => {
    isDraggingRef.current = false;
    const currentIdx = items.findIndex((i) => i.value === value);
    let targetIdx = currentIdx;
    if (Math.abs(info.velocity.y) > 200) {
      targetIdx = info.velocity.y < 0 ? currentIdx + 1 : currentIdx - 1;
    } else {
      targetIdx = currentIdx - Math.round(info.offset.y / ITEM_H);
    }
    snapTo(targetIdx);
  };

  const padItems = Math.ceil(items.length / 2) + 1;
  const padH = padItems * ITEM_H;

  return (
    <div
      className={`relative overflow-hidden select-none ${className}`}
      style={{ width: 64, display: "flex", flexDirection: "column", alignItems: "center" }}
    >
      {/* Active pill */}
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10 pointer-events-none"
        style={{
          width: 56,
          height: 38,
          borderRadius: 12,
          background: "linear-gradient(160deg, rgba(253,230,138,0.14) 0%, rgba(240,192,64,0.07) 100%)",
          border: "1px solid rgba(240,192,64,0.28)",
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.22), 0 2px 12px rgba(240,192,64,0.15)",
        }}
      />

      <motion.div
        style={{
          y: dragY,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          position: "relative",
          paddingTop: padH,
          paddingBottom: padH,
          marginTop: -padH + ITEM_H / 2,
          cursor: "grab",
        }}
        drag="y"
        dragConstraints={{ top: -(items.length - 1) * ITEM_H, bottom: 0 }}
        dragElastic={0.12}
        onDragEnd={handleDragEnd as any}
        whileDrag={{ cursor: "grabbing" }}
      >
        {items.map((item) => {
          const isSel = item.value === value;
          return (
            <div
              key={item.value}
              onClick={() => {
                const idx = items.findIndex((i) => i.value === item.value);
                snapTo(idx);
              }}
              style={{
                height: ITEM_H,
                width: 64,
                flexShrink: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                color: isSel ? "#e8b800" : "rgba(255,255,255,0.45)",
                fontWeight: isSel ? 800 : 500,
                fontSize: 14,
                transition: "color 0.2s, opacity 0.2s",
                opacity: isSel ? 1 : 0.7,
                position: "relative",
                zIndex: 20,
                userSelect: "none",
              }}
            >
              {item.label}
            </div>
          );
        })}
      </motion.div>
    </div>
  );
}

// ─── GlassIconBtn ─────────────────────────────────────────────────────────────
// Frosted glass circle icon button — mirror/droplet effect

interface GlassIconBtnProps {
  onClick?: () => void;
  children: React.ReactNode;
  size?: number;
  active?: boolean;
  className?: string;
  "aria-label"?: string;
  style?: React.CSSProperties;
}

export function GlassIconBtn({
  onClick,
  children,
  size = 38,
  active = false,
  className = "",
  style,
  ...rest
}: GlassIconBtnProps) {
  return (
    <motion.button
      onClick={onClick}
      whileTap={{ scale: 0.88 }}
      whileHover={{ scale: 1.04 }}
      className={`relative overflow-hidden flex-shrink-0 ${className}`}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        border: "none",
        padding: 0,
        // Mirror/droplet glass effect
        background: active
          ? "linear-gradient(160deg, rgba(253,230,138,0.22) 0%, rgba(240,192,64,0.14) 50%, rgba(180,131,9,0.18) 100%)"
          : "linear-gradient(160deg, rgba(255,255,255,0.14) 0%, rgba(255,255,255,0.06) 50%, rgba(0,0,0,0.12) 100%)",
        backdropFilter: "blur(24px) saturate(180%)",
        WebkitBackdropFilter: "blur(24px) saturate(180%)",
        boxShadow: active
          ? [
              "inset 0 1px 0 rgba(255,255,255,0.50)",
              "inset 0 -1px 0 rgba(0,0,0,0.30)",
              "inset 1px 0 0 rgba(255,255,255,0.20)",
              "inset -1px 0 0 rgba(0,0,0,0.10)",
              "0 4px 16px rgba(240,192,64,0.25)",
              "0 1px 4px rgba(0,0,0,0.4)",
            ].join(", ")
          : [
              "inset 0 1px 0 rgba(255,255,255,0.35)",
              "inset 0 -1px 0 rgba(0,0,0,0.25)",
              "inset 1px 0 0 rgba(255,255,255,0.12)",
              "inset -1px 0 0 rgba(0,0,0,0.08)",
              "0 4px 16px rgba(0,0,0,0.35)",
              "0 1px 3px rgba(0,0,0,0.3)",
            ].join(", "),
        outline: "none",
        WebkitTapHighlightColor: "transparent",
        ...style,
      }}
      {...rest}
    >
      {/* Specular highlight top arc */}
      <span
        className="pointer-events-none absolute"
        style={{
          top: 0,
          left: "10%",
          right: "10%",
          height: "45%",
          borderRadius: "50%",
          background: "linear-gradient(180deg, rgba(255,255,255,0.28) 0%, transparent 100%)",
          mixBlendMode: "overlay",
        }}
      />
      {/* Content */}
      <span
        className="relative z-10 flex items-center justify-center"
        style={{ color: active ? "#e8b800" : "var(--glass-icon-btn-content)" }}
      >
        {children}
      </span>
    </motion.button>
  );
}

// ─── GlassPanel ───────────────────────────────────────────────────────────────
// 3-column grid of glass icon buttons with labels

export interface GlassPanelItem {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  onClick?: () => void;
}

interface GlassPanelProps {
  items: GlassPanelItem[];
  columns?: number;
  className?: string;
}

export function GlassPanel({ items, columns = 3, className = "" }: GlassPanelProps) {
  return (
    <div
      className={`relative overflow-hidden rounded-3xl p-4 ${className}`}
      style={{
        background: "linear-gradient(160deg, rgba(255,255,255,0.10) 0%, rgba(240,192,64,0.04) 40%, rgba(0,0,0,0.15) 100%)",
        backdropFilter: "blur(40px) saturate(160%)",
        WebkitBackdropFilter: "blur(40px) saturate(160%)",
        border: "1px solid rgba(255,255,255,0.12)",
        boxShadow: [
          "inset 0 1px 0 rgba(255,255,255,0.22)",
          "inset 0 -1px 0 rgba(0,0,0,0.20)",
          "0 8px 40px rgba(0,0,0,0.4)",
        ].join(", "),
      }}
    >
      {/* Specular sweep */}
      <div
        className="pointer-events-none absolute inset-0 rounded-3xl"
        style={{
          background: "linear-gradient(135deg, rgba(255,255,255,0.08) 0%, transparent 50%)",
        }}
      />
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${columns}, 1fr)`,
          gap: "16px 8px",
          position: "relative",
          zIndex: 1,
        }}
      >
        {items.map((item, i) => (
          <button
            key={i}
            onClick={item.onClick}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 8,
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 0,
              WebkitTapHighlightColor: "transparent",
            }}
          >
            <GlassIconBtn size={52} active={item.active} onClick={item.onClick}>
              {item.icon}
            </GlassIconBtn>
            <span
              style={{
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: "0.06em",
                color: item.active ? "#e8b800" : "rgba(255,255,255,0.65)",
                textTransform: "uppercase",
              }}
            >
              {item.label}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
