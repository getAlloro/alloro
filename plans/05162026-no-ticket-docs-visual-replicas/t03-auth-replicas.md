# T3: Auth Page Replicas — Sign In, Sign Up, Forgot Password

## Why
Three auth pages need visual replicas: sign in, sign up, and forgot password. These are the simplest pages — no sidebar, just centered card forms.

## What
Create 3 replica components using `AuthLayout` with hardcoded form fields and `HotspotZone` wrappers.

## Context

**Reference screenshots:** `docs/public/screenshots/0.0.82/signin/full.png`, `signup/full.png`, `forgot-password/full.png`
**Uses:** `AuthLayout` from T2, `HotspotZone` from T1

**ReplicaProps interface** (from T1):
```typescript
interface ReplicaProps {
  hotspots: Hotspot[];
  activeHotspotId: string | null;
  onHotspotClick: (hotspot: Hotspot) => void;
}
```

## Constraints
- Form fields are visual only — no state, no onChange handlers
- Use placeholder text in inputs
- Wrap each interactive section in `<HotspotZone>` using the hotspot IDs from the page configs

## Files to create

### `docs/src/components/replicas/SignInReplica.tsx`
**Hotspot IDs:** `email-field`, `password-field`, `submit-btn`, `forgot-link`, `signup-link`
**Layout:**
- AuthLayout wrapper
- "Welcome to Alloro" heading
- "Growth you can see. Sign in to get started." subtitle
- Email Address label + input (placeholder: "Enter your work email")
- Password label + input (placeholder: "Enter your password") + eye icon
- "Sign In" button — full-width, orange, with lock icon
- "Forgot your password?" link
- "Don't have an account? Sign up" link
- Terms footer: "By signing in, you agree to our Terms of Service."

### `docs/src/components/replicas/SignUpReplica.tsx`
**Hotspot IDs:** `email-field`, `password-field`, `confirm-password-field`, `submit-btn`, `signin-link`
**Layout:**
- AuthLayout wrapper
- "Create your Alloro account" heading
- "Get started with growth you can see." subtitle
- Email Address label + input
- Password label + input (hint: "Min 8 chars, 1 uppercase, 1 number")
- Confirm Password label + input
- "Create Account" button — full-width, orange
- "Already have an account? Sign in" link
- Terms footer

### `docs/src/components/replicas/ForgotPasswordReplica.tsx`
**Hotspot IDs:** `email-field`, `submit-btn`, `back-link`
**Layout:**
- AuthLayout wrapper
- "Forgot your password?" heading
- "Enter your email and we'll send you a reset link." subtitle
- Email Address label + input
- "Reset Password" button — full-width, orange
- "Back to sign in" link

## Verify
- All 3 render inside `DesktopViewport` without errors
- HotspotZones highlight on hover/active

## Depends on
T1 (HotspotZone), T2 (AuthLayout)
