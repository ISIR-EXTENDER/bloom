import type { ReactNode } from "react";

export type BloomButtonProps = {
  ariaLabel?: string;
  children: ReactNode;
  className?: string;
  disabled?: boolean;
  onClick?: () => void;
  tone?: "primary" | "secondary" | "subtle";
  type?: "button" | "reset" | "submit";
};

export function BloomButton({
  ariaLabel,
  children,
  className = "",
  disabled = false,
  onClick,
  tone = "secondary",
  type = "button",
}: BloomButtonProps) {
  return (
    <button
      aria-label={ariaLabel}
      className={`bloom-button bloom-button-${tone} ${className}`.trim()}
      disabled={disabled}
      onClick={onClick}
      type={type}
    >
      {children}
    </button>
  );
}
