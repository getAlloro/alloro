import type { DocPage } from "../../types/docs";
import { ForgotPasswordReplica } from "../../components/replicas/ForgotPasswordReplica";

export const forgotPasswordPage: DocPage = {
  slug: "forgot-password",
  route: "/forgot-password",
  title: "Forgot Password",
  description:
    "The forgot password page lets you request a password reset link. Enter your account email and we'll send you instructions to create a new password.",
  category: "auth",
  replica: ForgotPasswordReplica,
  hotspots: [
    {
      id: "email-field",
      x: 35,
      y: 51,
      width: 24,
      height: 5,
      label: "Email Address",
      description: "Enter the email address associated with your Alloro account. We'll send a reset link to this address.",
      action: "Type",
      step: 1,
    },
    {
      id: "submit-btn",
      x: 35,
      y: 59,
      width: 24,
      height: 5,
      label: "Send Reset Link",
      description: "Click to send a password reset email. Check your inbox — the link expires after 30 minutes.",
      action: "Click",
      step: 2,
    },
    {
      id: "back-link",
      x: 43,
      y: 66,
      width: 10,
      height: 3,
      label: "Back to Sign In",
      description: "Remember your password? Click here to return to the sign-in page.",
      action: "Click",
      step: 3,
    },
  ],
  steps: [
    {
      number: 1,
      title: "Enter your email",
      description: "Type the email address tied to your Alloro account. If it exists, you'll receive a reset link.",
      hotspotId: "email-field",
    },
    {
      number: 2,
      title: "Click Send Reset Link",
      description: "Submit the form. A password reset email will be sent within a few seconds. Check spam if it doesn't arrive.",
      hotspotId: "submit-btn",
    },
    {
      number: 3,
      title: "Return to sign in",
      description: "If you remembered your password, click here to go back to the sign-in page without sending a reset.",
      hotspotId: "back-link",
    },
  ],
  changelog: [
    {
      version: "0.0.82",
      date: "May 2026",
      summary: "Initial documentation baseline for the forgot password page.",
    },
  ],
};
