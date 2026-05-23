import "./FightDetail.css";
import { useEffect, useRef, useState } from "react";
import type { FightRecord } from "../data/types";
import {
  cancel as cancelVoice,
  profileForSpeaker,
  speakUtterance,
  voiceIsEnabled,
  voiceSupported,
} from "../lib/voice";
import { ShieldIcon, SpeakerOnIcon, SwordIcon } from "./Icon";
import { SystemUnderTest } from "./SystemUnderTest";

interface Props {
  fight: FightRecord;
  liveIndex?: number; // when set, only renders utterances up to this index (for typewriter playback)
}

export function FightDetail({ fight, liveIndex }: Props) {
  const { transcript, verdict } = fight;
  const utts =
    liveIndex !== undefined
      ? transcript.utterances.slice(0, liveIndex + 1)
      : transcript.utterances;
  const isLive = liveIndex !== undefined;
  const finished = !isLive || liveIndex >= transcript.utterances.length - 1;

  // Local "Listen" controller for the non-live (already-completed)
  // transcript view in Fight Log. Independent from RunFightModal's
  // own playback. Highlights the currently-spoken bubble.
  const [listenIndex, setListenIndex] = useState<number | null>(null);
  const cancelledRef = useRef(false);

  useEffect(() => {
    return () => {
      cancelledRef.current = true;
      cancelVoice();
    };
  }, []);

  const startListen = async () => {
    if (listenIndex !== null) return;
    if (!voiceIsEnabled()) {
      alert(
        "Voice playback is off. Turn it on in the top-right of the page (Voice toggle) and try again."
      );
      return;
    }
    cancelledRef.current = false;
    for (let i = 0; i < transcript.utterances.length; i++) {
      if (cancelledRef.current) break;
      setListenIndex(i);
      const u = transcript.utterances[i];
      const profile = profileForSpeaker(u.speaker, transcript.persona_name);
      await speakUtterance(u.content, profile);
    }
    setListenIndex(null);
  };

  const stopListen = () => {
    cancelledRef.current = true;
    cancelVoice();
    setListenIndex(null);
  };

  return (
    <div className="fight-detail">
      {!isLive && voiceSupported() && (
        <div className="fight-detail-controls">
          {listenIndex === null ? (
            <button className="btn btn-outline btn-sm fd-listen" onClick={startListen}>
              <SpeakerOnIcon size={14} /> Listen
            </button>
          ) : (
            <button className="btn btn-ghost btn-sm" onClick={stopListen}>
              Stop ({listenIndex + 1}/{transcript.utterances.length})
            </button>
          )}
        </div>
      )}
      <div className="transcript-pane">
        {utts.map((u, i) => {
          const speaking = listenIndex === i;
          return (
            <div
              key={i}
              className={`utt utt-${u.speaker} ${speaking ? "utt-speaking" : ""}`}
            >
              <span className="utt-who">
                {u.speaker === "red" && (
                  <>
                    <SwordIcon size={12} /> <strong>RED</strong> · {transcript.persona_name}
                  </>
                )}
                {u.speaker === "blue" && (
                  <>
                    <ShieldIcon size={12} /> <strong>BLUE</strong> · Cara (MetroBank CSR)
                  </>
                )}
                {u.speaker !== "red" && u.speaker !== "blue" && u.speaker.toUpperCase()}
                {speaking && (
                  <span className="utt-speaking-dot">
                    <SpeakerOnIcon size={11} />
                  </span>
                )}
              </span>
              <div className="utt-body">{u.content}</div>
              {u.tool_calls && u.tool_calls.length > 0 && (
                <div className="utt-tools">
                  tools called: {u.tool_calls.map((c) => c.name).join(", ")}
                </div>
              )}
            </div>
          );
        })}
        {isLive && !finished && (
          <div className="typing-indicator">
            <span /> <span /> <span />
          </div>
        )}
      </div>
      {finished && (
        <div className="verdict-pane">
          <div className="verdict-meta">
            <div className="verdict-header">
              <span className={`verdict-badge verdict-${verdict.winner}`}>
                {verdict.winner === "red" && (
                  <>
                    <SwordIcon size={13} /> RED won. Regression case captured.
                  </>
                )}
                {verdict.winner === "blue" && (
                  <>
                    <ShieldIcon size={13} /> BLUE held. Defense locked in.
                  </>
                )}
                {verdict.winner === "draw" && "Draw. Inconclusive."}
              </span>
              <span className="verdict-score">
                Blue {verdict.blue_score} / Red {verdict.red_score}
              </span>
            </div>
            <div className="verdict-sut">
              <SystemUnderTest
                variant="badge"
                mode={transcript.blue_mode}
                model={transcript.blue_model}
              />
            </div>
            <p className="verdict-notes">{verdict.notes}</p>
          </div>
          <div className="verdict-findings">
            {verdict.policy_breaches?.length > 0 && (
              <div>
                <h4>Policy breaches detected</h4>
                <ul>
                  {verdict.policy_breaches.map((b, i) => (
                    <li key={i}>{b}</li>
                  ))}
                </ul>
              </div>
            )}
            {verdict.deterministic_findings?.length > 0 && (
              <div>
                <h4>Deterministic findings</h4>
                <ul>
                  {verdict.deterministic_findings.map((b, i) => (
                    <li key={i}>{b}</li>
                  ))}
                </ul>
              </div>
            )}
            {verdict.policy_breaches?.length === 0 &&
              verdict.deterministic_findings?.length === 0 && (
                <div className="no-findings">No policy breaches detected.</div>
              )}
          </div>
        </div>
      )}
    </div>
  );
}
