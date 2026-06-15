export const previewWithScrollbar = (html: string) => {
  const scrollbarStyle = `<style>::-webkit-scrollbar{width:8px;height:8px}::-webkit-scrollbar-track{background:#f3f4f6;border-radius:4px}::-webkit-scrollbar-thumb{background:#d66853;border-radius:4px}::-webkit-scrollbar-thumb:hover{background:#c05a47}</style>`;
  if (html.includes("</head>")) {
    return html.replace("</head>", `${scrollbarStyle}</head>`);
  }
  return scrollbarStyle + html;
};

export const extractTitle = (html: string): string => {
  const match = html.match(/<title[^>]*>(.*?)<\/title>/is);
  return match ? match[1].trim() : "";
};

export const extractMetaDescription = (html: string): string => {
  const match = html.match(/<meta\s+name=["']description["']\s+content=["'](.*?)["'][^>]*>/is)
    || html.match(/<meta\s+content=["'](.*?)["']\s+name=["']description["'][^>]*>/is);
  return match ? match[1].trim() : "";
};

export const extractUrl = (html: string): string => {
  const canonical = html.match(/<link\s+rel=["']canonical["']\s+href=["'](.*?)["'][^>]*>/is);
  if (canonical) return canonical[1].trim();
  const ogUrl = html.match(/<meta\s+property=["']og:url["']\s+content=["'](.*?)["'][^>]*>/is);
  if (ogUrl) return ogUrl[1].trim();
  return "https://example.com";
};

export const extractFavicon = (html: string): string => {
  const match = html.match(/<link\s+[^>]*rel=["'](?:shortcut )?icon["'][^>]*href=["'](.*?)["'][^>]*>/is)
    || html.match(/<link\s+[^>]*href=["'](.*?)["'][^>]*rel=["'](?:shortcut )?icon["'][^>]*>/is);
  return match ? match[1].trim() : "";
};

export const formatDate = (dateString: string) => {
  return new Date(dateString).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};
