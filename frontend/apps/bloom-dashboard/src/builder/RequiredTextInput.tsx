import { type InputHTMLAttributes, useEffect, useState } from "react";

type RequiredTextInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "onChange" | "value"> & {
  fallback: string;
  onCommit: (value: string) => void;
  value: string;
};

/**
 * A name that must never be saved empty. Committing the fallback per keystroke put "Untitled widget" into the
 * field the moment it was cleared, and the next letter landed after it; the fallback now waits for the blur.
 */
export function RequiredTextInput({ fallback, onCommit, onBlur, value, ...inputProps }: RequiredTextInputProps) {
  const [draft, setDraft] = useState(value);

  // biome-ignore lint/correctness/useExhaustiveDependencies: only an outside change to the saved value replaces the draft.
  useEffect(() => {
    if (draft !== "" || value !== fallback) {
      setDraft(value);
    }
  }, [value]);

  return (
    <input
      {...inputProps}
      onBlur={(event) => {
        if (draft.trim() === "") {
          setDraft(fallback);
          onCommit(fallback);
        }
        onBlur?.(event);
      }}
      onChange={(event) => {
        setDraft(event.target.value);
        onCommit(event.target.value.trim() === "" ? fallback : event.target.value);
      }}
      type="text"
      value={draft}
    />
  );
}
