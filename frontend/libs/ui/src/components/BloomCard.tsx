import type { ReactNode } from "react";

export type BloomCardProps = {
  children: ReactNode;
  className?: string;
  tone?: "canvas" | "default" | "soft";
};

export function BloomCard({ children, className = "", tone = "default" }: BloomCardProps) {
  return <article className={`bloom-card bloom-card-${tone} ${className}`.trim()}>{children}</article>;
}
