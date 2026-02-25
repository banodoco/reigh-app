import {
  BaseButton,
  baseButtonVariants,
  type BaseButtonProps,
} from "@/shared/components/ui/baseButton";

/** @uiContract Theme-agnostic base button primitive contract. */
const buttonVariants = baseButtonVariants;
const Button = BaseButton;

export type ButtonProps = BaseButtonProps;

export { Button, buttonVariants };
