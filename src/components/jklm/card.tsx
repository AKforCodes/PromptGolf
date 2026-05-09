import type { HTMLAttributes } from "react";

type Elevation = "sm" | "md" | "lg";

const SHADOW_BY_ELEVATION: Record<Elevation, string> = {
  sm: "shadow-chunky-sm",
  md: "shadow-chunky",
  lg: "shadow-chunky-lg",
};

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  elevation?: Elevation;
}

export function Card({
  elevation = "lg",
  className = "",
  ...rest
}: CardProps) {
  const shadow = SHADOW_BY_ELEVATION[elevation];
  return (
    <div
      {...rest}
      className={`rounded-3xl border-[3px] border-ink bg-white p-6 ${shadow} ${className}`}
    />
  );
}
