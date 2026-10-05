import { Suspense } from "react";
import { DynamicIcon, type IconName } from "lucide-react/dynamic";
import { Box } from "lucide-react";

interface IconProps {
  name?: string;
  size?: number;
  className?: string;
}

/**
 * Renders a Lucide icon by its kebab-case name (as supplied in display.icon).
 * Falls back to a generic box glyph when the name is missing or unknown.
 */
export function Icon({ name, size = 22, className }: IconProps) {
  if (!name) {
    return <Box size={size} className={className} aria-hidden />;
  }
  return (
    <Suspense fallback={<Box size={size} className={className} aria-hidden />}>
      <DynamicIcon
        name={name as IconName}
        size={size}
        className={className}
        aria-hidden
        fallback={() => <Box size={size} className={className} aria-hidden />}
      />
    </Suspense>
  );
}
