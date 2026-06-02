import type { ReactNode } from "react";

export type BloomButtonProps = {
  children: ReactNode;
  onClick?: () => void;
  tone?: "primary" | "secondary" | "subtle";
  type?: "button" | "reset" | "submit";
};

export function BloomButton({ children, onClick, tone = "secondary", type = "button" }: BloomButtonProps) {
  return (
    <button className={`bloom-button bloom-button-${tone}`} onClick={onClick} type={type}>
      {children}
    </button>
  );
}
