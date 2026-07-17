import type { PmUser } from "../../types/pm";

export type CommentMentionPopupProps = {
  isOpen: boolean;
  users: PmUser[];
  selectedIndex: number;
  onSelect: (user: PmUser) => void;
  onHover: (index: number) => void;
};

export function CommentMentionPopup({
  isOpen,
  users,
  selectedIndex,
  onSelect,
  onHover,
}: CommentMentionPopupProps) {
  if (!isOpen || users.length === 0) return null;

  return (
    <div className="absolute left-3 z-40 mt-1 max-h-52 min-w-[240px] overflow-y-auto rounded-lg border border-pm-border bg-pm-bg-secondary shadow-lg">
      <ul className="py-1 text-sm">
        {users.map((user, index) => (
          <li key={user.id}>
            <button
              type="button"
              className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-pm-text-primary ${
                index === selectedIndex ? "bg-pm-bg-hover" : ""
              }`}
              onMouseDown={(event) => {
                event.preventDefault();
                onSelect(user);
              }}
              onMouseEnter={() => onHover(index)}
            >
              <span className="flex h-5 w-5 items-center justify-center rounded-full border border-pm-border bg-pm-bg-primary text-[10px] font-semibold text-pm-accent">
                {user.display_name.charAt(0).toUpperCase()}
              </span>
              <span className="flex-1 truncate">{user.display_name}</span>
              <span className="text-[10px] text-pm-text-muted">
                {user.email}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
