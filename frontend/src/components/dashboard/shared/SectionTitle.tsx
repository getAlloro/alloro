/**
 * Card section title — Fraunces (font-display) for legibility. Used in card
 * headers where a mono slug felt too small/typewritten. Pair with a colored
 * dot on the left and a mono context label on the right.
 */
export function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="font-display text-[15px] lg:text-base font-medium text-alloro-navy tracking-tight leading-tight">
      {children}
    </h3>
  );
}
