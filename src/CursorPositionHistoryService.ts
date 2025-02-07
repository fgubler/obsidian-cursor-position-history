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

		await this.navigateToPosition(editor, activeLeaf, currentPosition, previousPosition);
	}

	/** the equivalent of "Redo" for the cursor position */
	async proceedToNextPosition(editor: Editor | null, activeLeaf: WorkspaceLeaf | null) {
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

		await this.navigateToPosition(editor, activeLeaf, currentPosition, nextPosition);
	}

	private async navigateToPosition(
		editor: Editor | null,
		activeLeaf: WorkspaceLeaf | null,
		fromPosition: HistoricCursorPosition | undefined,
		toPosition: HistoricCursorPosition
	): Promise<void> {
		if (fromPosition?.file != toPosition.file) {
			await activeLeaf?.openFile(toPosition.file)
		}

		const editorPosition: EditorPosition = { line: toPosition.line, ch: toPosition.positionInLine };
		editor?.setSelection(editorPosition)
		editor?.scrollIntoView({ from: editorPosition, to: editorPosition }, true);
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
