import type { DocPage } from "../../types/docs";
import { WebsiteEditorReplica } from "../../components/replicas/WebsiteEditorReplica";

export const websitePage: DocPage = {
  slug: "website",
  route: "/dfy/website",
  title: "Website",
  description:
    "The Website page provides a live preview of your Alloro-managed practice website. Toggle between desktop and mobile views to see how your site looks across devices, and open it in a new tab for a full browser view.",
  category: "features",
  replica: WebsiteEditorReplica,
  hotspots: [
    /* ── Stepped (appear in guided walkthrough) ─────────── */
    {
      id: "view-tabs",
      x: 20,
      y: 0,
      width: 30,
      height: 4,
      label: "View Tabs",
      description:
        "Switch between Editor, Submissions, Posts, and Menus. Each tab opens a different management view for your website.",
      step: 1,
    },
    {
      id: "preview-frame",
      x: 4,
      y: 4,
      width: 60,
      height: 92,
      label: "Website Preview",
      description:
        "A live rendering of your practice website. Scroll to review all sections. Click any element to select it for editing via the AI sidebar.",
      step: 2,
    },
    {
      id: "editor-sidebar",
      x: 65,
      y: 4,
      width: 30,
      height: 92,
      label: "AI Editor",
      description:
        "Chat with the AI assistant to make content edits, or review the change history. Click any element in the preview to start editing.",
      step: 3,
    },
    {
      id: "toolbar-actions",
      x: 60,
      y: 0,
      width: 35,
      height: 4,
      label: "Publish & Domain",
      description:
        "Save and publish changes, connect a custom domain, or open the live site in a new tab. Usage stats show your edit and storage limits.",
      step: 4,
    },
    /* ── Submissions tab ──────────────────────────────────── */
    {
      id: "submissions-forms",
      x: 0,
      y: 4,
      width: 25,
      height: 92,
      label: "Form Types",
      description:
        "All detected forms on your website. Each form collects different types of patient inquiries. Click a form to view its submissions.",
      step: 5,
    },
    {
      id: "submissions-list",
      x: 25,
      y: 4,
      width: 70,
      height: 92,
      label: "Submissions",
      description:
        "Individual form entries from patients. New submissions appear with an unread indicator. Flagged entries may be spam.",
      step: 6,
    },
    /* ── Posts tab ────────────────────────────────────────── */
    {
      id: "posts-types",
      x: 0,
      y: 4,
      width: 22,
      height: 92,
      label: "Post Types",
      description:
        "Content categories for your website blog and dynamic pages. Each type (Blog, Services, Team) has its own collection of posts.",
      step: 7,
    },
    {
      id: "posts-list",
      x: 22,
      y: 4,
      width: 73,
      height: 92,
      label: "Post Management",
      description:
        "Create, edit, and publish blog posts and dynamic content. Each post has an SEO score to help you rank higher in search results.",
      step: 8,
    },
    /* ── Menus tab ────────────────────────────────────────── */
    {
      id: "menus-list",
      x: 0,
      y: 4,
      width: 22,
      height: 92,
      label: "Menu Groups",
      description:
        "Navigation menus used across your website. Main Navigation controls the header menu, Footer Links the bottom section.",
      step: 9,
    },
    {
      id: "menus-items",
      x: 22,
      y: 4,
      width: 73,
      height: 92,
      label: "Menu Items",
      description:
        "Individual links in the selected menu. Drag to reorder, or nest items under a parent to create dropdown menus.",
      step: 10,
    },
  ],
  steps: [
    /* ── Editor tab ──────────────────────────────────────── */
    {
      number: 1,
      title: "Navigate views & toggle device",
      description:
        "Use the tabs to switch between Editor, Submissions, Posts, and Menus. Toggle Desktop/Mobile to check how your site looks on phones.",
      hotspotId: "view-tabs",
    },
    {
      number: 2,
      title: "Review the live preview",
      description:
        "Scroll through the preview to check your site content. Click any element to select it for editing via the AI sidebar.",
      hotspotId: "preview-frame",
    },
    {
      number: 3,
      title: "Edit with AI assistant",
      description:
        "Once you select an element, chat with the AI assistant to update text, images, or styling. Review past changes in the History tab.",
      hotspotId: "editor-sidebar",
    },
    {
      number: 4,
      title: "Publish and manage",
      description:
        "Save changes and publish them live, connect a custom domain for your practice, or open the site in a new tab for a full browser view.",
      hotspotId: "toolbar-actions",
    },
    /* ── Submissions tab ─────────────────────────────────── */
    {
      number: 5,
      title: "Browse form types",
      description:
        "The sidebar lists every form detected on your website. Click a form to view its submissions. Custom forms show an orange badge.",
      hotspotId: "submissions-forms",
    },
    {
      number: 6,
      title: "Review submissions",
      description:
        "Each entry shows sender name, preview text, and status. New submissions have an orange indicator. Flagged entries may be spam.",
      hotspotId: "submissions-list",
    },
    /* ── Posts tab ────────────────────────────────────────── */
    {
      number: 7,
      title: "Choose a post type",
      description:
        "Post types organize your content into categories like Blog Posts, Services, and Team Members. Click a type to see its posts.",
      hotspotId: "posts-types",
    },
    {
      number: 8,
      title: "Manage posts",
      description:
        "Create, edit, and publish posts. Each post shows its SEO score, categories, and tags. Filter by status, category, or tag.",
      hotspotId: "posts-list",
    },
    /* ── Menus tab ────────────────────────────────────────── */
    {
      number: 9,
      title: "Select a menu",
      description:
        "Your website can have multiple navigation menus. Main Navigation controls the header links, Footer Links the bottom section.",
      hotspotId: "menus-list",
    },
    {
      number: 10,
      title: "Organize menu items",
      description:
        "Drag items to reorder them. Nest items under a parent to create dropdown menus. Use the shortcode to embed a menu in templates.",
      hotspotId: "menus-items",
    },
  ],
  changelog: [
    {
      version: "0.0.82",
      date: "May 2026",
      summary:
        "Initial documentation baseline for the Website preview page.",
    },
  ],
};
