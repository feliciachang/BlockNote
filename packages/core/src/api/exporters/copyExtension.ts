import { Extension } from "@tiptap/core";
import { DOMSerializer, Node } from "prosemirror-model";
import { NodeSelection, Plugin } from "prosemirror-state";
import { __serializeForClipboard } from "prosemirror-view";

import { EditorView } from "prosemirror-view";
import type { BlockNoteEditor } from "../../editor/BlockNoteEditor";
import { BlockSchema, InlineContentSchema, StyleSchema } from "../../schema";
import { initializeESMDependencies } from "../../util/esmDependencies";
import { createExternalHTMLExporter } from "./html/externalHTMLExporter";
import { createInternalHTMLSerializer } from "./html/internalHTMLSerializer";
import { cleanHTMLToMarkdown } from "./markdown/markdownExporter";

async function selectedFragmentToHTML<
  BSchema extends BlockSchema,
  I extends InlineContentSchema,
  S extends StyleSchema
>(
  view: EditorView,
  editor: BlockNoteEditor<BSchema, I, S>
): Promise<{
  internalHTML: string;
  externalHTML: string;
  plainText: string;
}> {
  // let selectedFragment = view.state.doc.slice(
  //   view.state.selection.from,
  //   view.state.selection.to,
  //   false
  // ).content;
  // console.log(selectedFragment);
  //
  // const children = [];
  // for (let i = 0; i < selectedFragment.childCount; i++) {
  //   children.push(selectedFragment.child(i));
  // }
  // const isWithinBlockContent =
  //   children.find(
  //     (child) =>
  //       child.type.name === "blockContainer" ||
  //       child.type.name === "blockGroup" ||
  //       child.type.spec.group === "blockContent"
  //   ) === undefined;
  // if (!isWithinBlockContent) {
  //   selectedFragment = view.state.doc.slice(
  //     view.state.selection.from,
  //     view.state.selection.to,
  //     true
  //   ).content;
  // }
  const selectedFragment = view.state.selection.content().content;
  // console.log(selectedFragment);
  const s = __serializeForClipboard(view, selectedFragment);
  console.log(s);

  // 1. Why did we use the internal serializer to put HTML on the clipboard and not the defualt logic?
  // 2. Will we lose context from parent nodes if we e.g. only select block content?

  // const internalHTMLSerializer = createInternalHTMLSerializer(
  //   view.state.schema,
  //   editor
  // );
  // const internalHTML = internalHTMLSerializer.serializeProseMirrorFragment(
  //   selectedFragment,
  //   {}
  // );

  await initializeESMDependencies();
  const externalHTMLExporter = createExternalHTMLExporter(
    view.state.schema,
    editor
  );
  const externalHTML = externalHTMLExporter.exportProseMirrorFragment(
    selectedFragment,
    {}
  );

  const plainText = await cleanHTMLToMarkdown(externalHTML);

  return { internalHTML: s.dom.outerHTML, externalHTML, plainText };
}

const copyToClipboard = <
  BSchema extends BlockSchema,
  I extends InlineContentSchema,
  S extends StyleSchema
>(
  editor: BlockNoteEditor<BSchema, I, S>,
  view: EditorView,
  event: ClipboardEvent
) => {
  // Stops the default browser copy behaviour.
  event.preventDefault();
  event.clipboardData!.clearData();

  // Checks if a `blockContent` node is being copied and expands
  // the selection to the parent `blockContainer` node. This is
  // for the use-case in which only a block without content is
  // selected, e.g. an image block.
  if (
    "node" in view.state.selection &&
    (view.state.selection.node as Node).type.spec.group === "blockContent"
  ) {
    editor.dispatch(
      editor._tiptapEditor.state.tr.setSelection(
        new NodeSelection(view.state.doc.resolve(view.state.selection.from - 1))
      )
    );
  }

  (async () => {
    const { internalHTML, externalHTML, plainText } =
      await selectedFragmentToHTML(view, editor);

    // TODO: Writing to other MIME types not working in Safari for
    //  some reason.
    event.clipboardData!.setData("blocknote/html", internalHTML);
    event.clipboardData!.setData("text/html", externalHTML);
    event.clipboardData!.setData("text/plain", plainText);
  })();
};

export const createCopyToClipboardExtension = <
  BSchema extends BlockSchema,
  I extends InlineContentSchema,
  S extends StyleSchema
>(
  editor: BlockNoteEditor<BSchema, I, S>
) =>
  Extension.create<{ editor: BlockNoteEditor<BSchema, I, S> }, undefined>({
    name: "copyToClipboard",
    addProseMirrorPlugins() {
      return [
        new Plugin({
          props: {
            handleDOMEvents: {
              copy(view, event) {
                copyToClipboard(editor, view, event);
                // Prevent default PM handler to be called
                return true;
              },
              cut(view, event) {
                copyToClipboard(editor, view, event);
                view.dispatch(view.state.tr.deleteSelection());
                // Prevent default PM handler to be called
                return true;
              },
              // This is for the use-case in which only a block without content
              // is selected, e.g. an image block, and dragged (not using the
              // drag handle).
              dragstart(view, event) {
                // Checks if a `NodeSelection` is active.
                if (!("node" in view.state.selection)) {
                  return;
                }

                // Checks if a `blockContent` node is being dragged.
                if (
                  (view.state.selection.node as Node).type.spec.group !==
                  "blockContent"
                ) {
                  return;
                }

                // Expands the selection to the parent `blockContainer` node.
                editor.dispatch(
                  editor._tiptapEditor.state.tr.setSelection(
                    new NodeSelection(
                      view.state.doc.resolve(view.state.selection.from - 1)
                    )
                  )
                );

                // Stops the default browser drag start behaviour.
                event.preventDefault();
                event.dataTransfer!.clearData();

                (async () => {
                  const { internalHTML, externalHTML, plainText } =
                    await selectedFragmentToHTML(view, editor);

                  // TODO: Writing to other MIME types not working in Safari for
                  //  some reason.
                  event.dataTransfer!.setData("blocknote/html", internalHTML);
                  event.dataTransfer!.setData("text/html", externalHTML);
                  event.dataTransfer!.setData("text/plain", plainText);
                })();
                // Prevent default PM handler to be called
                return true;
              },
            },
          },
        }),
      ];
    },
  });
