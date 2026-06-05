/**
 * Raw brand SVG logos for the four supported integrations, defined once and
 * shared by every consumer — the compact `ActiveIntegrationLogos` badge row and
 * the larger `IntegrationProviderList` sidebar. Each accepts `className` so the
 * caller owns sizing; the SVG geometry stays identical everywhere.
 */

type LogoProps = { className?: string };

export const HubSpotLogo = ({ className }: LogoProps) => (
  <svg viewBox="0 0 24 24" fill="#FF7A59" className={className} aria-hidden="true">
    <path d="M18.164 7.93V5.084a2.198 2.198 0 001.267-1.978v-.067A2.2 2.2 0 0017.238.845h-.067a2.2 2.2 0 00-2.193 2.193v.067a2.196 2.196 0 001.252 1.973l.013.006v2.852a6.22 6.22 0 00-2.969 1.31l.012-.01-7.828-6.095A2.497 2.497 0 104.3 4.656l-.012.006 7.697 5.991a6.176 6.176 0 00-1.038 3.446c0 1.343.425 2.588 1.147 3.607l-.013-.02-2.342 2.343a1.968 1.968 0 00-.58-.095h-.002a2.033 2.033 0 102.033 2.033 1.978 1.978 0 00-.1-.595l.005.014 2.317-2.317a6.247 6.247 0 104.782-11.134l-.036-.005zm-.964 9.378a3.206 3.206 0 113.215-3.207v.002a3.206 3.206 0 01-3.207 3.207z" />
  </svg>
);

export const RybbitLogo = ({ className }: LogoProps) => (
  <svg viewBox="0 0 263.33 173.53" fill="#22c55e" className={className} aria-hidden="true">
    <polygon points="181.28 171.2 227.21 123.96 261.15 171.2 181.28 171.2" />
    <path d="M261.15,89.05L206.64,2.33l-33.22,17.75-34.61-7.4c2.88,5.56,4.56,12.11,4.56,19.15,0,20.03-13.46,36.26-30.06,36.26-13.66,0-25.17-11-28.83-26.06l-39.92,71.46L2.18,94.19l22.66,77.01h55.81l22.28-54.01v54.01h64.66l-49.95-82.15h143.51Z" />
    <ellipse cx="105.94" cy="28.62" rx="12.9" ry="18.88" />
  </svg>
);

export const ClarityLogo = ({ className }: LogoProps) => (
  <svg viewBox="-1 -2 23 21" fill="none" className={className} aria-hidden="true">
    <path d="M10.0004 -1.00888L14.4827 6.67518L3.72505 9.7488L10.0004 -1.00888Z" fill="#41A5EE" />
    <path d="M3.72505 9.7488L20.758 17.4329L14.4827 6.67518L3.72505 9.7488Z" fill="#2B7CD3" />
    <path d="M20.758 17.4329H-0.757812L3.72505 9.7488L20.758 17.4329Z" fill="#185ABD" />
  </svg>
);

export const GoogleLogo = ({ className }: LogoProps) => (
  <svg viewBox="0 0 24 24" fill="#4285F4" className={className} aria-hidden="true">
    <path d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z" />
  </svg>
);
