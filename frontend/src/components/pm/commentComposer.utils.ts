import type { PmUser } from "../../types/pm";
import type { MentionPopupState } from "./commentComposer.types";

export const EMPTY_MENTION_POPUP: MentionPopupState = {
  isOpen: false,
  query: "",
  triggerAt: -1,
  selectedIndex: 0,
};

export function findMentionQuery(
  value: string,
  caret: number,
): { query: string; triggerAt: number } | null {
  for (let index = caret - 1; index >= 0; index -= 1) {
    const character = value[index];
    if (character === "@") {
      const previous = index === 0 ? " " : value[index - 1];
      const query = value.slice(index + 1, caret);
      return (index === 0 || /\s|[,.;:!?()[\]{}]/.test(previous)) &&
        !/\s/.test(query)
        ? { query, triggerAt: index }
        : null;
    }
    if (/\s/.test(character)) return null;
  }
  return null;
}

export function filterMentionUsers(
  users: PmUser[],
  query: string,
  isOpen: boolean,
): PmUser[] {
  if (!isOpen) return [];
  const normalized = query.toLowerCase();
  return users
    .filter((user) => user.display_name.toLowerCase().includes(normalized))
    .slice(0, 8);
}

export function pruneMentionIds(
  body: string,
  mentionIds: number[],
  users: PmUser[],
): number[] {
  return mentionIds.filter((id) => {
    const user = users.find((candidate) => candidate.id === id);
    return Boolean(user && body.includes(`@${user.display_name}`));
  });
}

export function removeMentionFromBody(
  body: string,
  displayName: string,
): string {
  const escaped = displayName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return body.replace(new RegExp(`@${escaped}\\s?`, "g"), "").trimStart();
}
