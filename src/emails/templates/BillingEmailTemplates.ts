import {
  BRAND_COLORS,
  EMAIL_FONT_STACKS,
  createCard,
  escapeHtml,
  wrapInBaseTemplate,
} from "./base";

export type LocationLifecycleEmailKind =
  | "cancel_scheduled"
  | "cancelled_immediately"
  | "subscription_ending"
  | "reopened";

export type QuantityUpdateEmailData = {
  organizationName: string;
  direction: "added" | "removed";
  oldQuantity: number;
  newQuantity: number;
  unitPrice: string;
  newTotal: string;
};

export type LocationLifecycleEmailData = {
  locationName: string;
  kind: LocationLifecycleEmailKind;
  effectiveDate: string | null;
};

const LIFECYCLE_COPY: Record<
  LocationLifecycleEmailKind,
  (locationName: string, effectiveDate: string | null) => string
> = {
  cancel_scheduled: (locationName, effectiveDate) =>
    `<strong>${escapeHtml(locationName)}</strong> is scheduled to be cancelled${
      effectiveDate
        ? ` on <strong>${escapeHtml(effectiveDate)}</strong>`
        : ""
    }. It stays fully active until then, and you can reopen it any time before that date at no charge.`,
  cancelled_immediately: (locationName) =>
    `<strong>${escapeHtml(locationName)}</strong> has been cancelled. Its data is retained and it can be reopened at any time.`,
  subscription_ending: (locationName, effectiveDate) =>
    `<strong>${escapeHtml(locationName)}</strong> was your last active location, so your Alloro subscription is scheduled to end${
      effectiveDate
        ? ` on <strong>${escapeHtml(effectiveDate)}</strong>`
        : ""
    }. Reopening the location before then keeps your subscription running.`,
  reopened: (locationName) =>
    `<strong>${escapeHtml(locationName)}</strong> has been reopened and is active again.`,
};

function locationLabel(quantity: number): string {
  return quantity === 1 ? "location" : "locations";
}

export function buildQuantityUpdateEmail(
  data: QuantityUpdateEmailData
): string {
  const oldQuantity = escapeHtml(String(data.oldQuantity));
  const newQuantity = escapeHtml(String(data.newQuantity));
  const unitPrice = escapeHtml(data.unitPrice);
  const newTotal = escapeHtml(data.newTotal);

  const summary = createCard(`
    <p style="margin: 4px 0; color: ${BRAND_COLORS.darkGray}; line-height: 1.6;">
      Previous: <strong>${oldQuantity}</strong> ${locationLabel(
        data.oldQuantity
      )} × $${unitPrice}/mo
    </p>
    <p style="margin: 4px 0; color: ${BRAND_COLORS.darkGray}; line-height: 1.6;">
      Updated: <strong>${newQuantity}</strong> ${locationLabel(
        data.newQuantity
      )} × $${unitPrice}/mo
    </p>
    <hr style="border: none; border-top: 1px solid ${BRAND_COLORS.border}; margin: 12px 0;" />
    <p style="margin: 4px 0; color: ${BRAND_COLORS.navy}; font-weight: 700; line-height: 1.6;">
      New monthly total: $${newTotal}/mo
    </p>
  `);

  return wrapInBaseTemplate(
    `
      <h1 style="margin: 0 0 16px; color: ${BRAND_COLORS.navy}; font-family: ${EMAIL_FONT_STACKS.display}; font-size: 28px; line-height: 1.2;">
        Subscription Updated
      </h1>
      <p style="margin: 0 0 20px; color: ${BRAND_COLORS.darkGray}; font-size: 16px; line-height: 1.6;">
        A location was ${data.direction} for <strong>${escapeHtml(
          data.organizationName
        )}</strong>, and your subscription has been automatically adjusted.
      </p>
      ${summary}
      <p style="margin: 20px 0 0; color: ${BRAND_COLORS.mediumGray}; font-size: 14px; line-height: 1.6;">
        Any price difference for the current billing period will be prorated on your next invoice.
      </p>
    `,
    { preheader: "Your Alloro subscription has been updated." }
  );
}

export function buildLocationLifecycleEmail(
  data: LocationLifecycleEmailData
): string {
  return wrapInBaseTemplate(
    `
      <h1 style="margin: 0 0 16px; color: ${BRAND_COLORS.navy}; font-family: ${EMAIL_FONT_STACKS.display}; font-size: 28px; line-height: 1.2;">
        Location Update
      </h1>
      <p style="margin: 0 0 20px; color: ${BRAND_COLORS.darkGray}; font-size: 16px; line-height: 1.6;">
        ${LIFECYCLE_COPY[data.kind](data.locationName, data.effectiveDate)}
      </p>
      <p style="margin: 0; color: ${BRAND_COLORS.mediumGray}; font-size: 14px; line-height: 1.6;">
        Manage your locations any time in Settings → Properties.
      </p>
    `,
    { preheader: "Your Alloro location settings have been updated." }
  );
}
