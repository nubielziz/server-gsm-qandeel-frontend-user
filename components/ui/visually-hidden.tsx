// VisuallyHidden: text for screen readers only.
import type { ComponentProps, ElementType } from "react";

export type VisuallyHiddenProps = ComponentProps<"span"> & {
  /** The element to render (default `span`). */
  as?: ElementType;
};

/** Content that is invisible but read by assistive technology (labels for icon-only controls, extra context). */
export function VisuallyHidden({ as: Tag = "span", className, ...props }: VisuallyHiddenProps) {
  return <Tag className={className ? `sr-only ${className}` : "sr-only"} {...props} />;
}
