import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "neutral" | "info" | "danger";
type Size = "sm" | "md" | "lg";

const VARIANT_BG: Record<Variant, string> = {
  primary: "bg-golf",
  secondary: "bg-sun",
  neutral: "bg-white",
  info: "bg-sky",
  danger: "bg-pink",
};

const SIZE_CLASSES: Record<Size, string> = {
  sm: "px-4 py-2 text-sm",
  md: "px-5 py-3 text-base",
  lg: "py-5 text-2xl",
};

const SHADOW_BY_SIZE: Record<Size, string> = {
  sm: "shadow-chunky-sm",
  md: "shadow-chunky-sm",
  lg: "shadow-chunky",
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  full?: boolean;
}

export function Button({
  variant = "primary",
  size = "md",
  full = false,
  className = "",
  type = "button",
  children,
  ...rest
}: ButtonProps) {
  const bg = VARIANT_BG[variant];
  const sizing = SIZE_CLASSES[size];
  const shadow = SHADOW_BY_SIZE[size];
  const width = full ? "w-full" : "";
  return (
    <button
      type={type}
      {...rest}
      className={`press inline-flex items-center justify-center gap-2 rounded-2xl border-[3px] border-ink font-heading font-bold uppercase tracking-wide text-ink ${bg} ${sizing} ${shadow} ${width} cursor-pointer disabled:cursor-not-allowed disabled:opacity-70 ${className}`}
    >
      {children}
    </button>
  );
}
