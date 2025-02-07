import {WorkspaceLeaf} from "obsidian";

export const INVALID_FILE_IDENTIFIER = '[INVALID_FILE_IDENTIFIER]';

/** the leafs have IDs but that is an internal detail. */
export function getLeafId(leaf: WorkspaceLeaf): string | null {
	const id = (leaf as any).id;
	if (!id || typeof id !== 'string') {
		return null;
	}
	return id as string;
}

export function createFileIdentifier(leaf: WorkspaceLeaf | null): string | null {
	const correspondingFile = leaf?.getViewState().state?.file;

	if (!correspondingFile) {
		return null;
	}

	return getLeafId(leaf) + ':' + correspondingFile;
}
