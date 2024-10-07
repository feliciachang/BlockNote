import { Extension } from "@tiptap/core";
import { Fragment, Node } from "prosemirror-model";
import { NodeSelection, Plugin } from "prosemirror-state";
import { CellSelection } from "prosemirror-tables";
import * as pmView from "prosemirror-view";

import { EditorView } from "prosemirror-view";
import type { BlockNoteEditor } from "../../../editor/BlockNoteEditor";
import { BlockSchema, InlineContentSchema, StyleSchema } from "../../../schema";
import { initializeESMDependencies } from "../../../util/esmDependencies";
import { createExternalHTMLExporter } from "../../exporters/html/externalHTMLExporter";
import { cleanHTMLToMarkdown } from "../../exporters/markdown/markdownExporter";
import {
  contentNodeToInlineContent,
  contentNodeToTableContent,
  nodeToBlock,
} from "../../nodeConversions/nodeConversions";

async function fragmentToExternalHTML<
  BSchema extends BlockSchema,
  I extends InlineContentSchema,
  S extends StyleSchema
>(
  view: pmView.EditorView,
  selectedFragment: Fragment,
  editor: BlockNoteEditor<BSchema, I, S>
) {
  let isWithinBlockContent = false;
  const isWithinTable = view.state.selection instanceof CellSelection;

  if (!isWithinTable) {
    // Checks whether block ancestry should be included when creating external
    // HTML. If the selection is within a block content node, the block ancestry
    // is excluded as we only care about the inline content.
    const fragmentWithoutParents = view.state.doc.slice(
      view.state.selection.from,
      view.state.selection.to,
      false
    ).content;

    const children = [];
    for (let i = 0; i < fragmentWithoutParents.childCount; i++) {
      children.push(fragmentWithoutParents.child(i));
    }

    isWithinBlockContent =
      children.find(
        (child) =>
          child.type.name === "blockContainer" ||
          child.type.name === "blockGroup" ||
          child.type.spec.group === "blockContent"
      ) === undefined;
    if (isWithinBlockContent) {
      selectedFragment = fragmentWithoutParents;
    }
  }

  let externalHTML: string;

  await initializeESMDependencies();
  const externalHTMLExporter = createExternalHTMLExporter(
    view.state.schema,
    editor
  );

  if (isWithinTable) {
    if (selectedFragment.firstChild?.type.name === "table") {
      // contentNodeToTableContent expects the fragment of the content of a table, not the table node itself
      // but cellselection.content() returns the table node itself if all cells and columns are selected
      selectedFragment = selectedFragment.firstChild.content;
    }

    // first convert selection to blocknote-style table content, and then
    // pass this to the exporter
    const ic = contentNodeToTableContent(
      selectedFragment as any,
      editor.schema.inlineContentSchema,
      editor.schema.styleSchema
    );

    externalHTML = externalHTMLExporter.exportInlineContent(ic as any, {
      simplifyBlocks: false,
    });
  } else if (isWithinBlockContent) {
    // first convert selection to blocknote-style inline content, and then
    // pass this to the exporter
    const ic = contentNodeToInlineContent(
      selectedFragment as any,
      editor.schema.inlineContentSchema,
      editor.schema.styleSchema
    );
    externalHTML = externalHTMLExporter.exportInlineContent(ic, {
      simplifyBlocks: false,
    });
  } else {
    // first convert selection to blocknote-style blocks, and then
    // pass these to the exporter
    const blocks: any[] = [];
    selectedFragment.descendants((node) => {
      if (node.type.name === "blockContainer") {
        if (node.firstChild?.type.name === "blockGroup") {
          // selection started within a block group
          // in this case the fragment starts with:
          // <blockContainer>
          //   <blockGroup>
          //     <blockContainer ... />
          //     <blockContainer ... />
          //   </blockGroup>
          // </blockContainer>
          //
          // instead of:
          // <blockContainer>
          //   <blockContent ... />
          //   <blockGroup>
          //     <blockContainer ... />
          //     <blockContainer ... />
          //   </blockGroup>
          // </blockContainer>
          //
          // so we don't need to serialize this block, just descend into the children of the blockGroup
          return true;
        }
        blocks.push(
          nodeToBlock(
            node,
            editor.schema.blockSchema,
            editor.schema.inlineContentSchema,
            editor.schema.styleSchema
          )
        );
        // don't descend into children, as they're already included in the block returned by nodeToBlock
        return false;
      }
      return true;
    });
    externalHTML = externalHTMLExporter.exportBlocks(blocks, {
      simplifyBlocks: true,
    });
  }
  return externalHTML;
}

export async function selectedFragmentToHTML<
  BSchema extends BlockSchema,
  I extends InlineContentSchema,
  S extends StyleSchema
>(
  view: EditorView,
  editor: BlockNoteEditor<BSchema, I, S>
): Promise<{
  clipboardHTML: string;
  externalHTML: string;
  markdown: string;
}> {
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

  // Uses default ProseMirror clipboard serialization.
  const clipboardHTML: string = (pmView as any).__serializeForClipboard(
    view,
    view.state.selection.content()
  ).dom.innerHTML;

  const selectedFragment = view.state.selection.content().content;

  const externalHTML = await fragmentToExternalHTML<BSchema, I, S>(
    view,
    selectedFragment,
    editor
  );

  const markdown = cleanHTMLToMarkdown(externalHTML);

  return { clipboardHTML, externalHTML, markdown };
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

  (async () => {
    const { clipboardHTML, externalHTML, markdown } =
      await selectedFragmentToHTML(view, editor);

    // TODO: Writing to other MIME types not working in Safari for
    //  some reason.
    event.clipboardData!.setData("blocknote/html", clipboardHTML);
    event.clipboardData!.setData("text/html", externalHTML);
    event.clipboardData!.setData("text/plain", markdown);
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
                  const { clipboardHTML, externalHTML, markdown } =
                    await selectedFragmentToHTML(view, editor);

                  // TODO: Writing to other MIME types not working in Safari for
                  //  some reason.
                  event.dataTransfer!.setData("blocknote/html", clipboardHTML);
                  event.dataTransfer!.setData("text/html", externalHTML);
                  event.dataTransfer!.setData("text/plain", markdown);
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
