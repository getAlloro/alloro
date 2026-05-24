/**
 * Section 2 Reader
 *
 * Fetches the current Section 2 customer bullet text for each customer in
 * the roster. Used by the pipeline orchestrator to provide priorBullets to
 * the aggregator (which appends new event lines to existing bullets rather
 * than overwriting them).
 *
 * Reads directly via Notion API; does not use substrateWriter (which is
 * write-only).
 */

import axios from "axios";
import { SECTION_2_CUSTOMER_BLOCKS } from "./constants";

const NOTION_API_BASE = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";

function notionHeaders(): Record<string, string> {
  const token = process.env.NOTION_TOKEN;
  if (!token) throw new Error("NOTION_TOKEN env var not set");
  return {
    Authorization: `Bearer ${token}`,
    "Notion-Version": NOTION_VERSION,
  };
}

async function readBlockText(blockId: string): Promise<string> {
  const response = await axios.get(`${NOTION_API_BASE}/blocks/${blockId}`, {
    headers: notionHeaders(),
  });
  const block = response.data;
  if (block.type !== "bulleted_list_item") return "";
  return (block.bulleted_list_item.rich_text || [])
    .map((t: any) => t.plain_text || "")
    .join("");
}

/**
 * Fetch the current Section 2 bullet text for every customer in the
 * roster. Returns a map of canonical_name -> bullet text. Customers whose
 * block read fails are omitted from the map (caller treats as empty prior).
 */
export async function fetchSection2PriorBullets(): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  for (const [customerName, blockId] of Object.entries(SECTION_2_CUSTOMER_BLOCKS)) {
    try {
      const text = await readBlockText(blockId);
      result.set(customerName, text);
    } catch (err) {
      console.warn(
        `[SECTION_2_READ_FAIL] customer ${customerName} block ${blockId}: ${(err as Error).message}`,
      );
    }
  }
  return result;
}
