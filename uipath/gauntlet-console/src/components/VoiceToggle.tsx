// VoiceToggle - small audio settings pill in the TopNav. Lets the
// user enable/disable voice playback globally and tweak the speech
// rate. State persists in localStorage via lib/voice.

import "./VoiceToggle.css";
import { useEffect, useRef, useState } from "react";
import {
  cancel,
  setVoiceEnabled,
  setVoiceRate,
  speakUtterance,
  voiceIsEnabled,
  voiceRate,
  voiceSupported,
} from "../lib/voice";
import { ChevronDownIcon, SpeakerOffIcon, SpeakerOnIcon } from "./Icon";

export function VoiceToggle() {
  const [enabled, setEnabled] = useState(false);
  const [rate, setRate] = useState(1.0);
  const [open, setOpen] = useState(false);
  const popRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setEnabled(voiceIsEnabled());
    setRate(voiceRate());
  }, []);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!popRef.current) return;
      if (!popRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const toggle = () => {
    const next = !enabled;
    setEnabled(next);
    setVoiceEnabled(next);
    if (!next) cancel();
    else {
      // First-time enable: speak a short confirmation so iOS / Chrome
      // tabs the audio permission gate.
      void speakUtterance("Voice enabled.", { gender: "female", rate: 1.05 });
    }
  };

  const onRate = (r: number) => {
    setRate(r);
    setVoiceRate(r);
  };

  if (!voiceSupported()) return null;

  return (
    <div className="voice-toggle-wrap" ref={popRef}>
      <button
        className={`voice-toggle ${enabled ? "voice-on" : "voice-off"}`}
        onClick={toggle}
        title={enabled ? "Voice on. Click to mute." : "Voice off. Click to enable."}
        aria-pressed={enabled}
      >
        <span className="voice-icon">
          {enabled ? <SpeakerOnIcon size={14} /> : <SpeakerOffIcon size={14} />}
        </span>
        <span className="voice-label">{enabled ? "Voice on" : "Voice off"}</span>
      </button>
      <button
        className="voice-gear"
        onClick={() => setOpen((o) => !o)}
        title="Voice settings"
        aria-label="Voice settings"
      >
        <ChevronDownIcon size={11} />
      </button>
      {open && (
        <div className="voice-pop">
          <div className="voice-pop-row">
            <label htmlFor="voice-rate">Speed</label>
            <span className="voice-pop-rate">{rate.toFixed(2)}x</span>
          </div>
          <input
            id="voice-rate"
            type="range"
            min={0.5}
            max={1.5}
            step={0.05}
            value={rate}
            onChange={(e) => onRate(parseFloat(e.target.value))}
          />
          <p className="voice-pop-hint">
            Uses the browser's built-in voices. Quality depends on your OS.
            Click any "Listen" or "Run a fight" button to hear it in action.
          </p>
        </div>
      )}
    </div>
  );
}
