import { Routes, Route, Navigate } from "react-router-dom";
import { Layout } from "./components/Layout";
import { HomePage } from "./pages/HomePage";
import { ChangelogPage } from "./pages/ChangelogPage";
import { DocPageView } from "./pages/DocPageView";

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route path="/changelog" element={<ChangelogPage />} />
        <Route path="/docs/:slug" element={<DocPageView />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
