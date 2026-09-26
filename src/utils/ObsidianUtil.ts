import {WorkspaceLeaf} from "obsidian";

export const INVALID_FILE_IDENTIFIER = '[INVALID_FILE_IDENTIFIER]';

/** the leafs have IDs but that is an internal, undocumented detail. */
interface LeafWithId {
	id?: unknown;
}

export function getLeafId(leaf: WorkspaceLeaf): string  {
	const id = (leaf as WorkspaceLeaf & LeafWithId).id;
	if (!id || typeof id !== 'string') {
		return '[NO_LEAF_ID]';
	}
	return id;
}

/**
 * Creates a unique identifier for a specific file within a specific leaf.
 * A leaf can e.g. be a tab of Obsidian. The same file could be open in multiple tabs.
 */
export function createFileIdentifier(leaf: WorkspaceLeaf | null): string | null {
	const correspondingFile = leaf?.getViewState().state?.file;

	if (!correspondingFile) {
		return null;
	}

	return getLeafId(leaf) + ':' + correspondingFile;
}
