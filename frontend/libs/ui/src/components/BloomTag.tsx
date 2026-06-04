import type { ReactNode } from "react";

export type BloomTagProps = {
  children: ReactNode;
  className?: string;
  tone?: "accent" | "default" | "muted" | "primary";
};

export function BloomTag({ children, className = "", tone = "default" }: BloomTagProps) {
  return <span className={`bloom-tag bloom-tag-${tone} ${className}`.trim()}>{children}</span>;
}
