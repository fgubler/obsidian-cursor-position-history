import {EditorRange} from "obsidian";

export interface CursorState {
	cursor?: EditorRange,
	scrollState?: ScrollState
}

export interface ScrollState {
	top: number;
	left: number;
}

/**
 * the structure of the database-entries
 *  - string-keys which represent filePaths
 *  - the values represent the last cursor position in that file
 */
export type DatabaseRepresentation = { [filePath: string]: CursorState; };
