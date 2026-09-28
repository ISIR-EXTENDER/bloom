import { forgetAllConfirmedState } from "@bloom/widget-renderers";

type SessionStartListener = (ownerModeRequest: string | null) => void;

const listeners = new Set<SessionStartListener>();

/** A new runtime session or control lease: the server neutralised what the old one set. */
export function onRuntimeSessionStart(listener: SessionStartListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function announceRuntimeSessionStart(ownerModeRequest: string | null): void {
  forgetAllConfirmedState();
  for (const listener of [...listeners]) {
    listener(ownerModeRequest);
  }
}
