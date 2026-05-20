import { useParams, Navigate } from "react-router-dom";
import { DocPageTemplate } from "../components/DocPageTemplate";
import { getPageBySlug } from "../data/pages";
import { getDocPageData } from "../data/pageLoader";

export function DocPageView() {
  const { slug } = useParams<{ slug: string }>();

  if (!slug || !getPageBySlug(slug)) {
    return <Navigate to="/" replace />;
  }

  const pageData = getDocPageData(slug);

  if (!pageData) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <h2 className="font-display text-2xl text-alloro-navy mb-2">Coming Soon</h2>
          <p className="text-sm text-alloro-slate">
            Documentation for this page is being prepared.
          </p>
        </div>
      </div>
    );
  }

  return <DocPageTemplate page={pageData} />;
}
