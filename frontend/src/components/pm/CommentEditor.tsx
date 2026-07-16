import { CommentComposer } from "./CommentComposer";
import type { CommentComposerProps } from "./commentComposer.types";

export function CommentEditor(props: CommentComposerProps) {
  return (
    <CommentComposer
      {...props}
      allowImages={false}
      autoFocus
      submitLabel="Save"
    />
  );
}
