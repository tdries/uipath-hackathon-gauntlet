// Voice playback using the browser's SpeechSynthesis API.
//
// Free, no API key, no backend. Quality varies by OS (macOS/iOS
// Safari has the richest voice library; Chrome/Edge use OS voices on
// macOS+Windows, fall back to a smaller set elsewhere). For a demo
// this is enough to put audio on the screen without depending on
// external infra.
//
// Each persona gets a profile: a voice-selection hint (gender,
// preferred locale), a pitch, and a rate. We pick the closest
// available voice from the browser's list at speak() time.
//
// API design:
//   - voice.speakUtterance(text, profile) -> Promise<void>
//   - voice.cancel() -> stops everything immediately
//   - voice.setEnabled(true|false) -> persisted in localStorage
//   - voice.isEnabled() -> reads from localStorage
//
// The Promise resolves on `onend` so callers can chain utterances.
// If voice is disabled, speak() resolves immediately without doing
// anything - lets a transcript player call speak() unconditionally.

export type SpeakerSide = "red" | "blue" | "system";

export interface VoiceProfile {
  /** Hint passed to the voice picker. */
  gender?: "female" | "male" | "neutral";
  /** ISO locale, e.g. "en-US". Defaults to caller's locale. */
  locale?: string;
  /** 0.5 (low) - 2.0 (high). 1.0 = default. */
  pitch?: number;
  /** 0.5 (slow) - 1.5 (fast). 1.0 = default. */
  rate?: number;
  /** 0.0 (mute) - 1.0 (full). */
  volume?: number;
  /** Optional explicit voice name (overrides gender/locale hints). */
  preferred_voice_name?: string;
}

const ENABLED_KEY = "gauntlet.voice.enabled.v1";
const RATE_KEY = "gauntlet.voice.rate.v1";

// Per-persona profiles. Tunes pitch/rate to match the persona's
// stage direction. Falls back to a sane default if persona not listed.
export const PERSONA_VOICE: Record<string, VoiceProfile> = {
  "panicked-grandma": { gender: "female", pitch: 1.25, rate: 1.0 },
  "aggressive-lawyer": { gender: "male", pitch: 0.85, rate: 1.15 },
  "fake-ceo": { gender: "male", pitch: 0.95, rate: 1.18 },
  "executor-of-the-will": { gender: "male", pitch: 0.9, rate: 0.95 },
  "prompt-injector": { gender: "neutral", pitch: 1.0, rate: 1.05 },
  "multi-turn-erosion": { gender: "female", pitch: 1.05, rate: 0.95 },
  "regulator-compliance-audit": { gender: "male", pitch: 0.9, rate: 1.05 },
  "indirect-injector": { gender: "female", pitch: 1.0, rate: 0.95 },
};

const BLUE_PROFILE: VoiceProfile = {
  gender: "female",
  pitch: 1.0,
  rate: 1.0,
};

const SYSTEM_PROFILE: VoiceProfile = {
  gender: "neutral",
  pitch: 0.95,
  rate: 1.0,
};

export function profileForSpeaker(
  side: SpeakerSide,
  persona?: string | null
): VoiceProfile {
  if (side === "blue") return BLUE_PROFILE;
  if (side === "system") return SYSTEM_PROFILE;
  if (persona && PERSONA_VOICE[persona]) return PERSONA_VOICE[persona];
  return { gender: "neutral", pitch: 1.0, rate: 1.0 };
}

// Browser voice list - cached after first successful retrieval.
let _voices: SpeechSynthesisVoice[] | null = null;

function getVoices(): SpeechSynthesisVoice[] {
  if (typeof window === "undefined" || !window.speechSynthesis) return [];
  if (_voices && _voices.length > 0) return _voices;
  const list = window.speechSynthesis.getVoices();
  if (list.length > 0) _voices = list;
  return _voices ?? [];
}

// On some browsers the voice list loads asynchronously. Warm it.
if (
  typeof window !== "undefined" &&
  window.speechSynthesis &&
  "onvoiceschanged" in window.speechSynthesis
) {
  window.speechSynthesis.onvoiceschanged = () => {
    _voices = window.speechSynthesis.getVoices();
  };
}

const FEMALE_HINTS = [
  "samantha", "victoria", "karen", "moira", "tessa", "ava", "allison",
  "susan", "kate", "fiona", "joanna", "amy", "olivia", "alex", "google us english",
  "female", "vrouw",
];
const MALE_HINTS = [
  "daniel", "fred", "oliver", "thomas", "alex", "tom", "lee", "ralph",
  "matthew", "male", "man",
];

function pickVoice(profile: VoiceProfile): SpeechSynthesisVoice | null {
  const voices = getVoices();
  if (voices.length === 0) return null;

  if (profile.preferred_voice_name) {
    const exact = voices.find(
      (v) => v.name.toLowerCase() === profile.preferred_voice_name!.toLowerCase()
    );
    if (exact) return exact;
  }

  const locale = profile.locale ?? "en-US";
  const localeMatches = voices.filter((v) =>
    v.lang.toLowerCase().startsWith(locale.toLowerCase().split("-")[0])
  );
  const pool = localeMatches.length > 0 ? localeMatches : voices;

  const hints =
    profile.gender === "female"
      ? FEMALE_HINTS
      : profile.gender === "male"
        ? MALE_HINTS
        : [];

  for (const h of hints) {
    const match = pool.find((v) => v.name.toLowerCase().includes(h));
    if (match) return match;
  }
  // Prefer default voice, otherwise first in pool.
  return pool.find((v) => v.default) ?? pool[0];
}

// ---------- Public API ----------

export function voiceIsEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(ENABLED_KEY) === "1";
  } catch {
    return false;
  }
}

export function setVoiceEnabled(enabled: boolean) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(ENABLED_KEY, enabled ? "1" : "0");
  } catch {
    // private mode, ignore
  }
}

export function voiceRate(): number {
  if (typeof window === "undefined") return 1.0;
  try {
    const v = parseFloat(window.localStorage.getItem(RATE_KEY) ?? "");
    if (Number.isFinite(v) && v >= 0.5 && v <= 1.5) return v;
  } catch {
    // ignore
  }
  return 1.0;
}

export function setVoiceRate(rate: number) {
  if (typeof window === "undefined") return;
  const clamped = Math.max(0.5, Math.min(1.5, rate));
  try {
    window.localStorage.setItem(RATE_KEY, String(clamped));
  } catch {
    // ignore
  }
}

export function voiceSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.speechSynthesis !== "undefined"
  );
}

export function cancel() {
  if (!voiceSupported()) return;
  window.speechSynthesis.cancel();
}

/** Speak the given text using the profile. Resolves when audio
 *  finishes (or immediately if voice is disabled / unsupported). */
export function speakUtterance(
  text: string,
  profile: VoiceProfile
): Promise<void> {
  if (!voiceSupported() || !voiceIsEnabled()) return Promise.resolve();
  const trimmed = text.trim();
  if (!trimmed) return Promise.resolve();

  return new Promise<void>((resolve) => {
    const utter = new SpeechSynthesisUtterance(trimmed);
    const voice = pickVoice(profile);
    if (voice) utter.voice = voice;
    utter.pitch = profile.pitch ?? 1.0;
    utter.rate = (profile.rate ?? 1.0) * voiceRate();
    utter.volume = profile.volume ?? 1.0;
    utter.lang = profile.locale ?? voice?.lang ?? "en-US";
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    utter.onend = finish;
    utter.onerror = finish;
    try {
      window.speechSynthesis.speak(utter);
    } catch {
      finish();
    }
  });
}
