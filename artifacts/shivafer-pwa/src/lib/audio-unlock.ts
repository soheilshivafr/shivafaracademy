type WebkitWindow = Window & {
  webkitAudioContext?: typeof AudioContext;
};

let sharedAudioContext: AudioContext | null = null;
let unlockListenersInstalled = false;

function getAudioContextConstructor() {
  if (typeof window === "undefined") return null;
  return window.AudioContext ?? (window as WebkitWindow).webkitAudioContext ?? null;
}

/**
 * Returns the one AudioContext used by the PWA's notification sounds.
 *
 * Browsers commonly create a new context in the "suspended" state when it is
 * created from a timer or an async callback. Keeping one context and unlocking
 * it from a real user gesture avoids that silent-failure path.
 */
export function getAudioCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (sharedAudioContext) return sharedAudioContext;

  const AudioContextConstructor = getAudioContextConstructor();
  if (!AudioContextConstructor) return null;

  try {
    sharedAudioContext = new AudioContextConstructor();
    return sharedAudioContext;
  } catch {
    return null;
  }
}

/**
 * Install the one-time browser-gesture unlock listeners.
 *
 * The listeners stay in place until resume succeeds so a blocked first
 * gesture does not permanently disable sounds on mobile Safari.
 */
export function setupAudioUnlock() {
  if (typeof document === "undefined" || unlockListenersInstalled) return;
  unlockListenersInstalled = true;

  const unlock = () => {
    const ctx = getAudioCtx();
    if (!ctx) return;

    if (ctx.state === "running") {
      removeListeners();
      return;
    }

    void ctx.resume()
      .then(() => {
        if (ctx.state === "running") removeListeners();
      })
      .catch(() => {
        // Try again on the next real user gesture.
      });
  };

  const removeListeners = () => {
    document.removeEventListener("click", unlock);
    document.removeEventListener("touchstart", unlock);
    document.removeEventListener("keydown", unlock);
  };

  document.addEventListener("click", unlock, { passive: true });
  document.addEventListener("touchstart", unlock, { passive: true });
  document.addEventListener("keydown", unlock, { passive: true });
}