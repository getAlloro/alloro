import type { SelectedInfo } from "../../hooks/useIframeSelector";
import type { DirectEditorOperation } from "../../utils/editorDirectOperations";
import type { MediaApi } from "./MediaBrowser";

type InlineEditorPopoverProps = {
  selectedInfo: SelectedInfo | null;
  mediaApi?: MediaApi;
  isEditing: boolean;
  isCanvasTextEditing?: boolean;
  onStartCanvasTextEdit?: () => boolean;
  onApplyDirectEdit: (operation: DirectEditorOperation) => void;
};

export default function InlineEditorPopover(props: InlineEditorPopoverProps) {
  void props;
  return null;
}
