import type { Section } from "../api/templates";
import type { CodeSnippet } from "../api/codeSnippets";

/**
 * Unwrap sections whether stored as Section[] or { sections: Section[] }.
 * N8N writes directly to the DB with the wrapped format; our API writes the bare array.
 */
export function normalizeSections(raw: unknown): Section[] {
  if (Array.isArray(raw)) return raw;
  if (
    raw &&
    typeof raw === "object" &&
    "sections" in raw &&
    Array.isArray((raw as { sections: unknown }).sections)
  ) {
    return (raw as { sections: Section[] }).sections;
  }
  return [];
}

/**
 * Build the inline form-handler script for a given project.
 * Mirrors the backend buildFormScript() — kept here because the frontend
 * cannot import from signalsai-backend.
 */
function buildFormScript(projectId: string): string {
  const apiBase = "https://app.getalloro.com";
  return `<script data-alloro-form-handler>
(function(){
  'use strict';
  var _ts=Date.now();
  var _jsc=_ts;for(var i=0;i<1000;i++){_jsc=((_jsc*1103515245+12345)&0x7fffffff);}
  document.addEventListener('DOMContentLoaded',function(){
    var API='${apiBase}';
    var PID='${projectId}';
    var forms=document.querySelectorAll('form:not([data-alloro-ignore])');
    forms.forEach(function(form){
      form.addEventListener('submit',function(e){
        e.preventDefault();
        var formName=form.getAttribute('data-form-name')||form.getAttribute('name')||'Contact Form';
        var formType=form.getAttribute('data-form-type')||'contact';
        var contents={};
        var inputs=form.querySelectorAll('input,select,textarea');
        inputs.forEach(function(el){
          if(el.tabIndex===-1||el.type==='submit'||el.type==='hidden'||el.type==='button')return;
          var label=el.getAttribute('data-label')||el.getAttribute('name')||el.getAttribute('placeholder')||'';
          if(!label)return;
          if(el.type==='checkbox'){
            if(el.checked){
              contents[label]=contents[label]?contents[label]+', '+el.value:el.value;
            }
          }else if(el.type==='radio'){
            if(el.checked){
              contents[label]=el.value;
            }
          }else if(el.tagName==='SELECT'){
            var opt=el.options[el.selectedIndex];
            if(opt&&opt.value){
              contents[label]=opt.textContent.trim();
            }
          }else{
            var v=el.value.trim();
            if(v)contents[label]=v;
          }
        });
        var btn=form.querySelector('button[type="submit"],input[type="submit"]');
        var origText=btn?btn.textContent:'';
        if(btn){btn.disabled=true;btn.textContent='Sending...';}
        fetch(API+'/api/websites/form-submission',{
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify({projectId:PID,formName:formName,formType:formType,contents:contents,_hp:'',_ts:_ts,_jsc:_jsc})
        })
        .then(function(r){if(!r.ok)throw new Error('fail');return r.json();})
        .then(function(){
          window.location.href=formType==='newsletter'?'/newsletter-success':'/success';
        })
        .catch(function(){
          if(btn){btn.textContent='Error — Try Again';btn.style.backgroundColor='#dc2626';}
          setTimeout(function(){if(btn){btn.disabled=false;btn.textContent=origText;btn.style.backgroundColor='';}},3000);
        });
      });
    });
  });
})();
</script>`;
}

/**
 * Inject code snippets into HTML at specified locations
 */
function injectCodeSnippets(
  html: string,
  snippets: CodeSnippet[],
  currentPageId?: string
): string {
  // 1. Filter enabled snippets
  const enabled = snippets.filter((s) => s.is_enabled);

  // 2. Filter by page targeting
  const targeted = enabled.filter((s) => {
    if (s.page_ids.length === 0) return true; // All pages
    if (!currentPageId) return true; // Preview mode, show all
    return s.page_ids.includes(currentPageId);
  });

  // 3. Group by location and sort by order_index
  const byLocation = {
    head_start: targeted
      .filter((s) => s.location === "head_start")
      .sort((a, b) => a.order_index - b.order_index),
    head_end: targeted
      .filter((s) => s.location === "head_end")
      .sort((a, b) => a.order_index - b.order_index),
    body_start: targeted
      .filter((s) => s.location === "body_start")
      .sort((a, b) => a.order_index - b.order_index),
    body_end: targeted
      .filter((s) => s.location === "body_end")
      .sort((a, b) => a.order_index - b.order_index),
  };

  // 4. Inject at each location
  let result = html;

  if (byLocation.head_start.length > 0) {
    const code = byLocation.head_start.map((s) => s.code).join("\n");
    result = result.replace(/<head>/i, `<head>\n${code}`);
  }

  if (byLocation.head_end.length > 0) {
    const code = byLocation.head_end.map((s) => s.code).join("\n");
    result = result.replace(/<\/head>/i, `${code}\n</head>`);
  }

  if (byLocation.body_start.length > 0) {
    const code = byLocation.body_start.map((s) => s.code).join("\n");
    result = result.replace(/<body([^>]*)>/i, `<body$1>\n${code}`);
  }

  if (byLocation.body_end.length > 0) {
    const code = byLocation.body_end.map((s) => s.code).join("\n");
    result = result.replace(/<\/body>/i, `${code}\n</body>`);
  }

  return result;
}

/**
 * Inject a `data-alloro-section` attribute on the root element of a section's HTML.
 * This gives extractSectionsFromDom a reliable way to find each section in the
 * live iframe DOM, regardless of whether the template uses alloro-tpl-* classes.
 */
function tagSectionRoot(sectionName: string, html: string): string {
  // Match the first opening HTML tag (e.g., <section ...>, <div ...>)
  return html.replace(/^(\s*<\w+)/, `$1 data-alloro-section="${sectionName}"`);
}

const SHORTCODE_LABELS: Record<string, string> = {
  post_block: "Post Block",
  review_block: "Reviews",
  menu: "Navigation Menu",
};

function prettyShortcodeLabel(type: string, raw: string): string {
  const base = SHORTCODE_LABELS[type] || type;
  if (type === "post_block") {
    const m = raw.match(/items=['"]([a-z_-]+)['"]/i);
    if (m) {
      const word = m[1].replace(/[-_]/g, " ");
      return `${word.charAt(0).toUpperCase()}${word.slice(1)} Block`;
    }
  }
  return base;
}

/**
 * Replace `{{ post_block … }}` / `{{ review_block … }}` / `{{ menu … }}` and
 * `[post_block …]` / `[review_block …]` tokens with a styled preview
 * placeholder. This is purely cosmetic — the canonical source keeps the
 * shortcode; the backend resolver expands it when the site is published.
 *
 * A shortcode-only section becomes wrapped in a `<div>` which then receives
 * `data-alloro-section` from tagSectionRoot, so regenerate overlays and
 * section-extract logic continue to work.
 */
function renderShortcodePlaceholders(html: string): string {
  const placeholder = (type: string, raw: string): string => {
    const label = prettyShortcodeLabel(type, raw);
    const guidance =
      type === "menu"
        ? "This menu's design can't be edited here — manage its links from the Menus tab."
        : type === "review_block"
          ? "This block's design can't be edited here — your reviews flow in automatically."
          : "This block's design can't be edited here — add or update its content from the Posts tab.";
    // Brace/bracket entities are LOAD-BEARING, not cosmetic: the assembled
    // page string is sent to the server-side shortcode resolver
    // (resolve-preview), whose regexes match raw {{ … }} / [ … ] tokens
    // anywhere in the string. Un-armored token copies inside the pill get
    // resolved IN PLACE — injecting a full rendered block into the attribute
    // (breaking its quoting and leaking markup as text) and a duplicate
    // block into the pill body. Entities render identically but are
    // invisible to those regexes. getAttribute() decodes them transparently
    // for the save-path extractor (restoreShortcodeTokens).
    const escapedRaw = raw
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\{/g, "&#123;")
      .replace(/\}/g, "&#125;")
      .replace(/\[/g, "&#91;")
      .replace(/\]/g, "&#93;");
    // Attribute-safe encoding: adds `"` escape on top of the text encoding
    // so the pill wrapper can carry the original token in
    // data-alloro-shortcode-original. The save-path extractor
    // (restoreShortcodeTokens) reads this attribute to unwrap the pill back
    // to its raw token before persisting — without it, the pill leaks into
    // the DB and renders on the public site.
    const escapedRawAttr = escapedRaw.replace(/"/g, "&quot;");
    return (
      `<div data-alloro-shortcode="${type}" ` +
      `data-alloro-shortcode-original="${escapedRawAttr}" ` +
      `style="background:#f3f4f6;border:1px dashed #d1d5db;border-radius:12px;` +
      `padding:48px 24px;margin:24px auto;max-width:90%;text-align:center;` +
      `font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;` +
      `color:#6b7280;">` +
      `<div style="font-weight:600;color:#374151;margin-bottom:8px;` +
      `text-transform:uppercase;letter-spacing:0.08em;font-size:12px;` +
      `font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;">` +
      `${label}</div>` +
      `<div style="font-size:13px;color:#4b5563;margin-bottom:10px;` +
      `font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;">` +
      `${guidance}</div>` +
      `<div style="font-size:11px;opacity:0.55;">${escapedRaw}</div>` +
      `</div>`
    );
  };

  let out = html.replace(
    /\{\{\s*(post_block|review_block|menu)\b[^}]*\}\}/gi,
    (match, type) => placeholder(String(type).toLowerCase(), match),
  );
  out = out.replace(
    /\[(post_block|review_block)\b[^\]]*\]/gi,
    (match, type) => placeholder(String(type).toLowerCase(), match),
  );
  return out;
}

/**
 * Assemble a full HTML page from template parts.
 *
 * wrapper.replace('{{slot}}', header + sections + footer)
 *
 * @param sectionFilter – optional list of section names to include (omit for all)
 * @param codeSnippets – optional code snippets to inject
 * @param currentPageId – optional page ID for snippet targeting
 * @param projectId – optional project ID; when provided, the form-handler script is injected
 */
export function renderPage(
  wrapper: string,
  header: string,
  footer: string,
  sections: Section[],
  sectionFilter?: string[],
  codeSnippets?: CodeSnippet[],
  currentPageId?: string,
  projectId?: string
): string {
  const sectionsToRender = sectionFilter
    ? sections.filter((s) => sectionFilter.includes(s.name))
    : sections;

  // Inject a data-alloro-section marker on each section's root element
  // so extractSectionsFromDom can reliably find them after DOM mutation.
  // Shortcode tokens are first replaced with styled placeholders so that
  // sections consisting only of `{{ post_block … }}` still have an HTML
  // root for tagSectionRoot and the regenerate overlay.
  const mainContent = sectionsToRender
    .map((s) =>
      tagSectionRoot(s.name, renderShortcodePlaceholders(s.content)),
    )
    .join("\n");
  const pageContent = [header, mainContent, footer].join("\n");
  let finalHtml = wrapper.replace("{{slot}}", pageContent);

  // Inject code snippets
  if (codeSnippets && codeSnippets.length > 0) {
    finalHtml = injectCodeSnippets(finalHtml, codeSnippets, currentPageId);
  }

  // Inject form-handler script when a projectId is provided
  // Skip if the deployment pipeline already baked it into the wrapper
  if (projectId && !finalHtml.includes('data-alloro-form-handler')) {
    const formScript = buildFormScript(projectId);
    finalHtml = finalHtml.replace(/<\/body>/i, `${formScript}\n</body>`);
  }

  return finalHtml;
}

/**
 * Parse a JS expression that returns a Section[].
 * Supports backtick template literals for content values.
 * Falls back to JSON.parse for strict JSON input.
 */
export function parseSectionsJs(input: string): Section[] {
  try {
    return JSON.parse(input);
  } catch {
    // Fall back to JS eval for backtick template literal syntax
    try {
      // eslint-disable-next-line no-new-func
      const result = new Function(`"use strict"; return (${input});`)();
      if (!Array.isArray(result)) throw new Error("Sections must be an array");
      return result as Section[];
    } catch (evalErr) {
      // Try to extract a useful line number from the SyntaxError.
      // new Function() wraps input with a prefix (`"use strict"; return (`)
      // which adds 1 line, so subtract 1 from any reported line number.
      if (evalErr instanceof SyntaxError) {
        // V8 includes line/col in the stack, e.g. "<anonymous>:5:12"
        const stackMatch = evalErr.stack?.match(/<anonymous>:(\d+):(\d+)/);
        if (stackMatch) {
          const line = Math.max(1, parseInt(stackMatch[1], 10) - 1);
          const col = parseInt(stackMatch[2], 10);
          throw new Error(`Line ${line}, col ${col}: ${evalErr.message}`);
        }
      }
      throw evalErr;
    }
  }
}

/**
 * Serialize sections to JS format with backtick content values.
 * This is the inverse of parseSectionsJs — produces human-friendly
 * editor content where HTML doesn't need quote escaping.
 */
export function serializeSectionsJs(sections: Section[]): string {
  if (sections.length === 0) return "[]";

  const entries = sections.map((s) => {
    const escaped = s.content
      .replace(/\\/g, "\\\\")
      .replace(/`/g, "\\`")
      .replace(/\$\{/g, "\\${");
    return `  {\n    "name": "${s.name}",\n    "content": \`${escaped}\`\n  }`;
  });
  return `[\n${entries.join(",\n")}\n]`;
}
