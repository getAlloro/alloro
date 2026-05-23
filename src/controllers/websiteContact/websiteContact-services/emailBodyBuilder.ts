/**
 * Email Body Builder
 *
 * Builds the HTML email body for form submission notifications.
 * Used by both the inbound submit flow and the manual resend endpoint.
 */

import type { FormContents, FormSection, FileValue } from "../../../models/website-builder/FormSubmissionModel";

const DEFAULT_HEADER_COLOR = "#0e8988";
const HEADER_TEXT_LIGHT = "#ffffff";
const HEADER_TEXT_DARK = "#212D40";
const SERIF_FONT = "Georgia, 'Times New Roman', Times, serif";
const SANS_FONT = "Arial, sans-serif";
const DEFAULT_LOGO_URL = "https://app.getalloro.com/logo.png";

export interface FormSubmissionEmailBodyOptions {
  headerColor?: string | null;
  logoUrl?: string | null;
}

export function buildEmailBody(
  formName: string,
  contents: FormContents,
  options: FormSubmissionEmailBodyOptions = {},
): string {
  const headerColor = normalizeHexColor(options.headerColor) || DEFAULT_HEADER_COLOR;
  const headerTextColor = getContrastTextColor(headerColor);
  const logoUrl = options.logoUrl || DEFAULT_LOGO_URL;
  const emailTableHtml = Array.isArray(contents)
    ? buildSectionsHtml(contents as FormSection[])
    : buildFlatHtml(contents as Record<string, string | FileValue>);

  const filesNote = hasFiles(contents)
    ? `<p style="margin-top:16px;font-size:12px;color:#9ca3af;text-align:center;">Photos and uploaded files are available in the <a href="https://app.getalloro.com/dfy/website?tab=submissions" style="color:#0e8988;text-decoration:underline;">Alloro submissions dashboard</a> for clearer previews and full-size downloads.</p>`
    : "";

  return `<div style="font-family:${SANS_FONT};max-width:600px;margin:0 auto;padding:24px;">
      <div style="background:${headerColor};color:${headerTextColor};padding:24px 32px;border-radius:16px 16px 0 0;">
        <table role="presentation" style="width:100%;border-collapse:collapse;">
          <tr>
            <td style="width:48px;padding:0 14px 0 0;vertical-align:middle;">
              <div style="width:42px;height:42px;background:#ffffff;border-radius:12px;text-align:center;line-height:42px;">
                <img src="${logoUrl}" alt="Alloro" width="28" height="28" style="display:inline-block;vertical-align:middle;border:0;outline:none;text-decoration:none;" />
              </div>
            </td>
            <td style="padding:0;vertical-align:middle;">
              <h1 style="margin:0;font-size:22px;font-family:${SERIF_FONT};font-weight:700;color:${headerTextColor};">New Entry From ${formName}</h1>
            </td>
          </tr>
        </table>
      </div>
      <div style="background:#f9fafb;padding:24px 32px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 16px 16px;">
        <table style="width:100%;border-collapse:collapse;font-size:15px;">
          ${emailTableHtml}
        </table>
      </div>
      ${filesNote}
      <p style="margin-top:16px;font-size:12px;color:#9ca3af;text-align:center;">Sent via ${formName} form</p>
    </div>`;
}

function normalizeHexColor(color: string | null | undefined): string | null {
  if (!color) return null;

  const match = color.trim().match(/^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);
  if (!match) return null;

  const hex = match[1];
  const normalized =
    hex.length === 3
      ? hex
          .split("")
          .map((char) => `${char}${char}`)
          .join("")
      : hex;

  return `#${normalized.toLowerCase()}`;
}

function getContrastTextColor(backgroundColor: string): string {
  const backgroundLuminance = getRelativeLuminance(backgroundColor);
  const lightContrast = getContrastRatio(backgroundLuminance, getRelativeLuminance(HEADER_TEXT_LIGHT));
  const darkContrast = getContrastRatio(backgroundLuminance, getRelativeLuminance(HEADER_TEXT_DARK));

  return lightContrast >= darkContrast ? HEADER_TEXT_LIGHT : HEADER_TEXT_DARK;
}

function getContrastRatio(luminanceA: number, luminanceB: number): number {
  const lighter = Math.max(luminanceA, luminanceB);
  const darker = Math.min(luminanceA, luminanceB);
  return (lighter + 0.05) / (darker + 0.05);
}

function getRelativeLuminance(hexColor: string): number {
  const hex = hexColor.replace("#", "");
  const red = parseInt(hex.slice(0, 2), 16);
  const green = parseInt(hex.slice(2, 4), 16);
  const blue = parseInt(hex.slice(4, 6), 16);
  const [r, g, b] = [red, green, blue].map(toLinearRgb);

  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function toLinearRgb(channel: number): number {
  const value = channel / 255;
  return value <= 0.03928
    ? value / 12.92
    : Math.pow((value + 0.055) / 1.055, 2.4);
}

function hasFiles(contents: FormContents): boolean {
  if (Array.isArray(contents)) {
    return contents.some((section) =>
      section.fields.some(([, value]) => typeof value === "object" && value !== null),
    );
  }
  return Object.values(contents).some((value) => typeof value === "object" && value !== null);
}

function buildSectionsHtml(sections: FormSection[]): string {
  return sections
    .map((section) => {
      const sectionHeader = `<tr><td colspan="2" style="padding:16px 0 8px 0;font-size:16px;font-family:${SERIF_FONT};font-weight:700;color:#007693;border-bottom:1px solid #e5e7eb;">${section.title}</td></tr>`;
      const fieldRows = section.fields
        .filter(([, value]) => typeof value === "string")
        .map(
          ([label, value]) =>
            `<tr>
              <td style="padding:6px 12px 6px 0;color:#6b7280;vertical-align:top;white-space:nowrap;width:40%;font-family:${SERIF_FONT};">${label}</td>
              <td style="padding:6px 0;color:#111827;font-weight:600;">${value}</td>
            </tr>`,
        )
        .join("");
      const fileFieldRows = section.fields
        .filter(([, value]) => typeof value === "object" && value !== null)
        .map(([, value]) => {
          const fv = value as FileValue;
          return `<tr>
            <td style="padding:6px 12px 6px 0;color:#6b7280;vertical-align:top;white-space:nowrap;font-family:${SERIF_FONT};">Attached File</td>
            <td style="padding:6px 0;color:#111827;font-weight:600;">${fv.name}</td>
          </tr>`;
        })
        .join("");
      return sectionHeader + fieldRows + fileFieldRows;
    })
    .join("");
}

function buildFlatHtml(contents: Record<string, string | FileValue>): string {
  const rows = Object.entries(contents)
    .filter(([, value]) => typeof value === "string")
    .map(
      ([label, value]) =>
        `<tr>
          <td style="padding:8px 12px 8px 0;color:#6b7280;vertical-align:top;white-space:nowrap;font-family:${SERIF_FONT};">${label}</td>
          <td style="padding:8px 0;color:#111827;font-weight:600;">${value}</td>
        </tr>`,
    )
    .join("");
  const fileRows = Object.entries(contents)
    .filter(([, value]) => typeof value === "object" && value !== null)
    .map(([, value]) => {
      const fv = value as FileValue;
      return `<tr>
        <td style="padding:8px 12px 8px 0;color:#6b7280;vertical-align:top;white-space:nowrap;font-family:${SERIF_FONT};">Attached File</td>
        <td style="padding:8px 0;color:#111827;font-weight:600;">${fv.name}</td>
      </tr>`;
    })
    .join("");
  return rows + fileRows;
}
