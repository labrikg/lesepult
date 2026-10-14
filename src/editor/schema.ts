import { BlockNoteSchema, createCodeBlockSpec, defaultBlockSpecs } from "@blocknote/core";
import { codeBlockOptions } from "@blocknote/code-block";
import { createLatexBlock } from "./LatexBlock";

// Media blocks (image, video, audio, file) are left out until files are stored in the
// app's data folder; PDF snips will bring images back as their own block.
const { image: _image, video: _video, audio: _audio, file: _file, ...textBlocks } = defaultBlockSpecs;

export const schema = BlockNoteSchema.create({
  blockSpecs: {
    ...textBlocks,
    codeBlock: createCodeBlockSpec({ ...codeBlockOptions, defaultLanguage: "text" }),
    latex: createLatexBlock(),
  },
});

export type NoteEditor = typeof schema.BlockNoteEditor;
export type NoteBlock = typeof schema.Block;
export type NotePartialBlock = typeof schema.PartialBlock;
