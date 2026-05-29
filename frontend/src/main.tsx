import * as Sentry from "@sentry/react";

Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN,
  sendDefaultPii: true,
});

import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { installSupportConsoleLogBuffer } from "./utils/supportConsoleLogs";

installSupportConsoleLogBuffer();

createRoot(document.getElementById("root")!).render(
  <Sentry.ErrorBoundary fallback={<p>Something went wrong.</p>}>
    <App />
  </Sentry.ErrorBoundary>,
);
