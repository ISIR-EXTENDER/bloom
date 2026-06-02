import type { ReactNode } from "react";

export type BloomPanelProps = {
  children: ReactNode;
  className?: string;
  labelledBy?: string;
};

export function BloomPanel({ children, className = "", labelledBy }: BloomPanelProps) {
  return (
    <section aria-labelledby={labelledBy} className={`bloom-panel ${className}`.trim()}>
      {children}
    </section>
  );
}
