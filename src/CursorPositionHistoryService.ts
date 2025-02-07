import {Editor, EditorPosition, TFile, WorkspaceLeaf} from "obsidian";

const MAX_HISTORY_LENGTH = 100;

export class CursorPositionHistoryService {
	previousPositions: HistoricCursorPosition[] = [];
	nextPositions: HistoricCursorPosition[] = [];
	currentPosition?: HistoricCursorPosition;

	/** update the current position based on the user's scrolling */
	updateCurrentPosition(position: HistoricCursorPosition) {
		if (this.hasEnoughDifference(this.currentPosition, position)) {
			if (this.currentPosition) {
				this.previousPositions.push(this.currentPosition);
				this.previousPositions = this.enforceMaxHistoryLength(this.previousPositions);
			}

			this.currentPosition = position;
			this.nextPositions = [];
		}
	}

	/** the equivalent of "Undo" for the cursor-position */
	async returnToPreviousPosition(editor: Editor | null, activeLeaf: WorkspaceLeaf | null) {
		const previousPosition = this.previousPositions.pop();

		if (!previousPosition) {
			return;
		}

		const currentPosition = this.currentPosition;
		this.currentPosition = previousPosition;

		if (currentPosition) {
			this.nextPositions.push(currentPosition);
			this.nextPositions = this.enforceMaxHistoryLength(this.nextPositions);
		}

		if (currentPosition?.file != previousPosition.file) {
			await activeLeaf?.openFile(previousPosition.file)
		}

		const editorPosition: EditorPosition = { line: previousPosition.line, ch: previousPosition.positionInLine };
		editor?.setSelection(editorPosition)
		editor?.scrollIntoView({ from: editorPosition, to: editorPosition }, false);
	}

	/** the equivalent of "Redo" for the cursor position */
	async proceedToNextPosition(editor: Editor | null, activeLeaf?: WorkspaceLeaf | null) {
		const nextPosition = this.nextPositions.pop();

		if (!nextPosition) {
			return;
		}

		const currentPosition = this.currentPosition;
		this.currentPosition = nextPosition;

		if (currentPosition) {
			this.previousPositions.push(currentPosition);
			this.previousPositions = this.enforceMaxHistoryLength(this.previousPositions);
		}

		if (currentPosition?.file != nextPosition.file) {
			await activeLeaf?.openFile(nextPosition.file)
		}

		const editorPosition: EditorPosition = { line: nextPosition.line, ch: nextPosition.positionInLine };
		editor?.setSelection(editorPosition)
		editor?.scrollIntoView({ from: editorPosition, to: editorPosition }, false);
	}

	/**
	 * Compares two positions and returns whether they are different enough to be stored.
	 * Ignores the position within a line: it changes too often and is hardly irrelevant.
	 */
	private hasEnoughDifference(previousPosition?: HistoricCursorPosition, newPosition?: HistoricCursorPosition): boolean {
		if (!previousPosition) {
			return !!newPosition;
		}
		if (!newPosition) {
			return !!previousPosition;
		}

		if (previousPosition === newPosition) {
			return false;
		}

		if (previousPosition.file.path !== newPosition.file.path) {
			return true;
		}

		return previousPosition.line !== newPosition.line;
	}

	private enforceMaxHistoryLength(history: HistoricCursorPosition[]): HistoricCursorPosition[] {
		return history.slice(-MAX_HISTORY_LENGTH);
	}
}

interface HistoricCursorPosition {
	file: TFile;
	line: number;
	positionInLine: number;
}
