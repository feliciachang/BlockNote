import {
  Editor,
  isNodeSelection,
  isTextSelection,
  posToDOMRect,
} from "@tiptap/core";
import { EditorState, Plugin, PluginKey } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import {
  BaseUiElementCallbacks,
  BaseUiElementState,
  BlockNoteEditor,
  BlockSchema,
} from "../..";

export type FormattingToolbarCallbacks = BaseUiElementCallbacks;

export type FormattingToolbarState = BaseUiElementState & {
  positionChangeSource: "scroll" | "other";
};

export class FormattingToolbarView<BSchema extends BlockSchema> {
  public editor: BlockNoteEditor<BSchema>;
  private ttEditor: Editor;

  private formattingToolbarState?: FormattingToolbarState;
  public updateFormattingToolbar: () => void;

  public preventHide = false;
  public preventShow = false;
  public prevWasEditable: boolean | null = null;

  public shouldShow: (props: {
    view: EditorView;
    state: EditorState;
    from: number;
    to: number;
  }) => boolean = ({ view, state, from, to }) => {
    const { doc, selection } = state;
    const { empty } = selection;

    // Sometime check for `empty` is not enough.
    // Doubleclick an empty paragraph returns a node size of 2.
    // So we check also for an empty text size.
    const isEmptyTextBlock =
      !doc.textBetween(from, to).length && isTextSelection(state.selection);

    return !(!view.hasFocus() || empty || isEmptyTextBlock);
  };

  constructor(
    editor: BlockNoteEditor<BSchema>,
    tipTapEditor: Editor,
    updateFormattingToolbar: (
      formattingToolbarState: FormattingToolbarState
    ) => void
  ) {
    this.editor = editor;
    this.ttEditor = tipTapEditor;

    this.updateFormattingToolbar = () => {
      if (!this.formattingToolbarState) {
        throw new Error(
          "Attempting to update uninitialized formatting toolbar"
        );
      }

      updateFormattingToolbar(this.formattingToolbarState);
    };

    this.ttEditor.view.dom.addEventListener(
      "mousedown",
      this.viewMousedownHandler
    );
    this.ttEditor.view.dom.addEventListener("mouseup", this.viewMouseupHandler);
    this.ttEditor.view.dom.addEventListener("dragstart", this.dragstartHandler);

    this.ttEditor.on("focus", this.focusHandler);
    this.ttEditor.on("blur", this.blurHandler);

    document.addEventListener("scroll", this.scrollHandler);
  }

  viewMousedownHandler = () => {
    this.preventShow = true;
  };

  viewMouseupHandler = () => {
    this.preventShow = false;
    setTimeout(() => this.update(this.ttEditor.view));
  };

  // For dragging the whole editor.
  dragstartHandler = () => {
    if (this.formattingToolbarState?.show) {
      this.formattingToolbarState.show = false;
      this.formattingToolbarState.positionChangeSource = "other";
      this.updateFormattingToolbar();
    }
  };

  focusHandler = () => {
    // we use `setTimeout` to make sure `selection` is already updated
    setTimeout(() => this.update(this.ttEditor.view));
  };

  blurHandler = ({ event }: { event: FocusEvent }) => {
    if (this.preventHide) {
      this.preventHide = false;

      return;
    }

    const editorWrapper = this.ttEditor.view.dom.parentElement!;

    // Checks if the focus is moving to an element outside the editor. If it is,
    // the toolbar is hidden.
    if (
      // An element is clicked.
      event &&
      event.relatedTarget &&
      // Element is inside the editor.
      (editorWrapper === (event.relatedTarget as Node) ||
        editorWrapper.contains(event.relatedTarget as Node))
    ) {
      return;
    }

    if (this.formattingToolbarState?.show) {
      this.formattingToolbarState.show = false;
      this.formattingToolbarState.positionChangeSource = "other";
      this.updateFormattingToolbar();
    }
  };

  scrollHandler = () => {
    if (this.formattingToolbarState?.show) {
      this.formattingToolbarState.referencePos = this.getSelectionBoundingBox();
      this.formattingToolbarState.positionChangeSource = "scroll";
      this.updateFormattingToolbar();
    }
  };

  update(view: EditorView, oldState?: EditorState) {
    const { state, composing } = view;
    const { doc, selection } = state;
    const isSame =
      oldState && oldState.doc.eq(doc) && oldState.selection.eq(selection);

    if (
      (this.prevWasEditable === null ||
        this.prevWasEditable === this.editor.isEditable) &&
      (composing || isSame)
    ) {
      return;
    }

    this.prevWasEditable = this.editor.isEditable;

    // support for CellSelections
    const { ranges } = selection;
    const from = Math.min(...ranges.map((range) => range.$from.pos));
    const to = Math.max(...ranges.map((range) => range.$to.pos));

    const shouldShow = this.shouldShow?.({
      view,
      state,
      from,
      to,
    });

    // Checks if menu should be shown/updated.
    if (
      this.editor.isEditable &&
      !this.preventShow &&
      (shouldShow || this.preventHide)
    ) {
      this.formattingToolbarState = {
        show: true,
        referencePos: this.getSelectionBoundingBox(),
        positionChangeSource: "other",
      };

      this.updateFormattingToolbar();

      return;
    }

    // Checks if menu should be hidden.
    if (
      this.formattingToolbarState?.show &&
      !this.preventHide &&
      (!shouldShow || this.preventShow || !this.editor.isEditable)
    ) {
      this.formattingToolbarState.show = false;
      this.formattingToolbarState.positionChangeSource = "other";
      this.updateFormattingToolbar();

      return;
    }
  }

  destroy() {
    this.ttEditor.view.dom.removeEventListener(
      "mousedown",
      this.viewMousedownHandler
    );
    this.ttEditor.view.dom.removeEventListener(
      "mouseup",
      this.viewMouseupHandler
    );
    this.ttEditor.view.dom.removeEventListener(
      "dragstart",
      this.dragstartHandler
    );

    this.ttEditor.off("focus", this.focusHandler);
    this.ttEditor.off("blur", this.blurHandler);

    document.removeEventListener("scroll", this.scrollHandler);
  }

  getSelectionBoundingBox() {
    const { state } = this.ttEditor.view;
    const { selection } = state;

    // support for CellSelections
    const { ranges } = selection;
    const from = Math.min(...ranges.map((range) => range.$from.pos));
    const to = Math.max(...ranges.map((range) => range.$to.pos));

    if (isNodeSelection(selection)) {
      const node = this.ttEditor.view.nodeDOM(from) as HTMLElement;

      if (node) {
        return node.getBoundingClientRect();
      }
    }

    return posToDOMRect(this.ttEditor.view, from, to);
  }
}

export const formattingToolbarPluginKey = new PluginKey(
  "FormattingToolbarPlugin"
);
export const setupFormattingToolbar = <BSchema extends BlockSchema>(
  editor: BlockNoteEditor<BSchema>,
  tiptapEditor: Editor,
  updateFormattingToolbar: (
    formattingToolbarState: FormattingToolbarState
  ) => void
): {
  plugin: Plugin;
  callbacks: Omit<FormattingToolbarCallbacks, "destroy">;
} => {
  let formattingToolbarView: FormattingToolbarView<BSchema>;

  return {
    plugin: new Plugin({
      key: formattingToolbarPluginKey,
      view: () => {
        formattingToolbarView = new FormattingToolbarView(
          editor,
          tiptapEditor,
          updateFormattingToolbar
        );
        return formattingToolbarView;
      },
    }),
    callbacks: {},
  };
};
