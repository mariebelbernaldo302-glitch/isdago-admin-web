"use client";

import * as React from "react";

type ActionButtonVariant =
  | "primary"
  | "secondary"
  | "success"
  | "danger"
  | "ghost";

type ActionButtonType = "button" | "submit" | "reset";

type ActionButtonProps = Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  "children" | "type"
> & {
  children: React.ReactNode;
  type?: ActionButtonType;
  variant?: ActionButtonVariant;
  danger?: boolean;
  loading?: boolean;
  icon?: React.ReactNode;
  ariaLabel?: string;
};

const variantClassMap: Record<ActionButtonVariant, string> = {
  primary: "btn btn-primary",
  secondary: "btn",
  success: "btn btn-green",
  danger: "btn btn-red",
  ghost: "btn action",
};

export default function ActionButton({
  children,
  type = "button",
  variant = "primary",
  danger = false,
  loading = false,
  icon,
  className = "",
  disabled = false,
  title,
  ariaLabel,
  "aria-label": ariaLabelNative,
  onClick,
  ...props
}: ActionButtonProps) {
  const resolvedVariant: ActionButtonVariant = danger ? "danger" : variant;

  const buttonClassName = `${variantClassMap[resolvedVariant]} ${className}`.trim();

  const buttonProps: React.ButtonHTMLAttributes<HTMLButtonElement> = {
    ...props,
    className: buttonClassName,
    disabled: disabled || loading,
    "aria-busy": loading,
    "aria-label": ariaLabel ?? ariaLabelNative,
    title,
    onClick,
  };

  const buttonContent = (
    <>
      {icon ? (
        <span className="btn-icon" aria-hidden="true">
          {icon}
        </span>
      ) : null}

      <span>{loading ? "Processing..." : children}</span>
    </>
  );

  if (type === "submit") {
    return (
      <button type="submit" {...buttonProps}>
        {buttonContent}
      </button>
    );
  }

  if (type === "reset") {
    return (
      <button type="reset" {...buttonProps}>
        {buttonContent}
      </button>
    );
  }

  return (
    <button type="button" {...buttonProps}>
      {buttonContent}
    </button>
  );
}