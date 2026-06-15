/**
 * Menu Resolver
 *
 * Resolves {{ menu ... }} shortcodes into nav trees, optionally rendered
 * through a menu template. Extracted verbatim from
 * shortcodeResolver.service.ts as part of a behavior-preserving
 * decomposition — DB access stays in models, rendering output is
 * byte-identical.
 */

import { MenuModel, MenuItemModel } from "../../../../models/website-builder/MenuModel";
import { MenuTemplateModel } from "../../../../models/website-builder/MenuTemplateModel";
import {
  escapeHtml,
  MENU_RE,
  parseAttrs,
  type MenuShortcode,
} from "../../user-website-utils/shortcode-parsing";
import { wrapResolved } from "./shared";

interface MenuItemNode {
  id: string;
  label: string;
  url: string;
  target: string;
  children: MenuItemNode[];
}

export async function resolveMenus(
  html: string,
  projectId: string,
  templateId: string | null
): Promise<string> {
  if (!html.includes("menu")) return html;

  const shortcodes: MenuShortcode[] = [];
  let match: RegExpExecArray | null;
  const re = new RegExp(MENU_RE.source, "g");
  while ((match = re.exec(html)) !== null) {
    const attrs = parseAttrs(match[1]);
    if (!attrs.id) continue;
    shortcodes.push({ raw: match[0], id: attrs.id, template: attrs.template });
  }

  if (shortcodes.length === 0) return html;

  for (const sc of shortcodes) {
    const menu = await MenuModel.findByProjectAndSlug(projectId, sc.id);

    if (!menu) {
      html = html.replace(
        sc.raw,
        wrapResolved(sc.raw, `<nav data-menu="${escapeHtml(sc.id)}"></nav>`)
      );
      continue;
    }

    const items = await MenuItemModel.findItemsForMenuTree(menu.id);

    if (items.length === 0) {
      html = html.replace(
        sc.raw,
        wrapResolved(sc.raw, `<nav data-menu="${escapeHtml(sc.id)}"></nav>`)
      );
      continue;
    }

    const tree = buildMenuTree(items);

    let menuTemplateHtml: string | null = null;
    if (sc.template && templateId) {
      const mt = await MenuTemplateModel.findByTemplateAndSlug(
        templateId,
        sc.template
      );
      if (mt) {
        const sections =
          typeof mt.sections === "string"
            ? JSON.parse(mt.sections)
            : mt.sections;
        menuTemplateHtml = Array.isArray(sections)
          ? sections.map((s: any) => s.content || "").join("\n")
          : "";
      }
    }

    let rendered: string;
    if (menuTemplateHtml) {
      rendered = renderMenuWithTemplate(tree, menuTemplateHtml);
    } else {
      rendered = renderMenuHtml(tree, true);
    }

    const navWrapped = `<nav data-menu="${escapeHtml(sc.id)}">${rendered}</nav>`;
    html = html.replace(sc.raw, wrapResolved(sc.raw, navWrapped));
  }

  return html;
}

function buildMenuTree(items: any[]): MenuItemNode[] {
  const map = new Map<string, MenuItemNode>();
  const roots: MenuItemNode[] = [];

  for (const item of items) {
    map.set(item.id, {
      id: item.id,
      label: item.label,
      url: item.url,
      target: item.target || "_self",
      children: [],
    });
  }

  for (const item of items) {
    const node = map.get(item.id)!;
    if (item.parent_id && map.has(item.parent_id)) {
      map.get(item.parent_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}

function renderMenuWithTemplate(
  tree: MenuItemNode[],
  templateHtml: string
): string {
  const startMarker = "{{start_menu_loop}}";
  const endMarker = "{{end_menu_loop}}";
  const startIdx = templateHtml.indexOf(startMarker);
  const endIdx = templateHtml.indexOf(endMarker);

  if (startIdx === -1 || endIdx === -1) return templateHtml;

  const before = templateHtml.slice(0, startIdx);
  const itemTemplate = templateHtml.slice(
    startIdx + startMarker.length,
    endIdx
  );
  const after = templateHtml.slice(endIdx + endMarker.length);

  const rendered = tree
    .map((node) => renderMenuItemFromTemplate(node, itemTemplate))
    .join("\n");

  return before + rendered + after;
}

function renderMenuItemFromTemplate(
  node: MenuItemNode,
  template: string
): string {
  let html = template;
  html = html.replace(/\{\{menu_item\.label\}\}/g, escapeHtml(node.label));
  html = html.replace(/\{\{menu_item\.url\}\}/g, escapeHtml(node.url));
  html = html.replace(/\{\{menu_item\.target\}\}/g, escapeHtml(node.target));

  if (node.children.length > 0) {
    const childrenHtml =
      '<ul class="nav-submenu">' +
      node.children
        .map((c) => renderMenuItemFromTemplate(c, template))
        .join("\n") +
      "</ul>";
    html = html.replace(/\{\{menu_item\.children\}\}/g, childrenHtml);
  } else {
    html = html.replace(/\{\{menu_item\.children\}\}/g, "");
  }

  return html;
}

function renderMenuHtml(nodes: MenuItemNode[], isRoot: boolean): string {
  const cls = isRoot ? 'class="alloro-menu"' : 'class="alloro-submenu"';
  const items = nodes
    .map((node) => {
      const hasSub = node.children.length > 0;
      const liClass = hasSub ? ' class="has-submenu"' : "";
      const target =
        node.target && node.target !== "_self"
          ? ` target="${escapeHtml(node.target)}"`
          : "";
      const children = hasSub ? renderMenuHtml(node.children, false) : "";
      return `<li${liClass}><a href="${escapeHtml(node.url)}"${target}>${escapeHtml(node.label)}</a>${children}</li>`;
    })
    .join("");
  return `<ul ${cls}>${items}</ul>`;
}
