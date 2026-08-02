import type { ButtonHTMLAttributes, ReactNode } from "react";

type BrandButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  tone?: "primary" | "secondary" | "quiet";
};

export default function BrandButton({
  children,
  tone = "primary",
  className = "",
  ...props
}: BrandButtonProps) {
  return (
    <button className={`brand-button brand-button--${tone} ${className}`} {...props}>
      {children}
    </button>
  );
}
