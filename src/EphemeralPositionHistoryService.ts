import {Editor, EditorPosition, TFile, WorkspaceLeaf} from "obsidian";
import {SettingsProvider} from "./models/PluginSettings";
import {serializeError} from "./utils/LoggingUtil";

const BIG_LINE_CHANGE_THRESHOLD = 20;
const NEXT_POSITIONS_CLEAR_TIME_THRESHOLD_S = 60;

export class EphemeralPositionHistoryService {
	previousPositions: HistoricCursorPosition[] = [];
	nextPositions: HistoricCursorPosition[] = [];
	currentPosition?: HistoricCursorPosition;

	constructor(private settingsProvider: SettingsProvider) {}

	/** update the current position based on the user's scrolling, writing, etc. */
	updateCurrentPosition(position: HistoricCursorPosition) {
		if (this.hasEnoughSpatialDifference(this.currentPosition, position)) {
			if (this.currentPosition) {
				this.previousPositions.push(this.currentPosition);
				this.previousPositions = this.enforceMaxHistoryLength(this.previousPositions);
			}

			if (this.shouldClearNextPositions(position)) {
				this.nextPositions = [];
			}

			this.currentPosition = position;
		} else if (this.currentPosition && this.currentPosition.epochTimestampMs < position.epochTimestampMs) {
			this.currentPosition.epochTimestampMs = position.epochTimestampMs;
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

		const previousPosition = this.currentPosition;
		this.currentPosition = nextPosition;

		if (previousPosition) {
			this.previousPositions.push(previousPosition);
			this.previousPositions = this.enforceMaxHistoryLength(this.previousPositions);
		}

		await this.navigateToPosition(editor, activeLeaf, previousPosition, nextPosition);
	}

	private async navigateToPosition(
		editor: Editor | null,
		activeLeaf: WorkspaceLeaf | null,
		fromPosition: HistoricCursorPosition | undefined,
		toPosition: HistoricCursorPosition
	): Promise<void> {
		if (fromPosition?.file !== toPosition.file) {
			await activeLeaf?.openFile(toPosition.file)
		}

		const editorPosition: EditorPosition = { line: toPosition.line, ch: toPosition.positionInLine };
		const scrollToCenter = await this.shouldScrollToCenter(editor, fromPosition, toPosition);

		editor?.setSelection(editorPosition)
		editor?.scrollIntoView({ from: editorPosition, to: editorPosition }, scrollToCenter);
	}

	/**
	 * Only scroll to the center if we move by "many" lines.
	 * Ideally, that means if the new position is currently visible on the screen.
	 * As a fallback, we just use a fixed number of lines as threshold.
	 */
	private async shouldScrollToCenter(
		editor: Editor | null,
		fromPosition: HistoricCursorPosition | undefined,
		toPosition: HistoricCursorPosition
	): Promise<boolean> {
		if (!editor) {
			return false; // cannot scroll anyway
		}
		if (!fromPosition || fromPosition?.file !== toPosition.file) {
			return true;
		}

		try {
			const codeMirror = (editor as any).cm; // CodeMirror is the underlying editor of Obsidian
			if (codeMirror && codeMirror.visibleRanges && (codeMirror.visibleRanges.length ?? 0) > 0) {
				const visibleRange: CodeMirrorPositionRange = codeMirror.visibleRanges[0];
				const toLinePositionRange: CodeMirrorPositionRange = codeMirror.state.doc.line(toPosition.line);
				const toPositionAbsolute = toLinePositionRange.from + toPosition.positionInLine;

				const toPositionVisibleOnScreen = toPositionAbsolute >= visibleRange.from &&
					toPositionAbsolute <= visibleRange.to;

				return !toPositionVisibleOnScreen;
			} else {
				const fromPositionLine = fromPosition?.line ?? 0;
				return Math.abs(fromPositionLine - toPosition.line) > BIG_LINE_CHANGE_THRESHOLD;
			}
		} catch (error) {
			console.warn(`Failed to determine whether to scroll to center: ${serializeError(error)}`);
			return false;
		}
	}


	/**
	 * Compares two positions and returns whether they are different enough to be stored.
	 * Ignores the position within a line: it changes too often and is hardly irrelevant.
	 */
	private hasEnoughSpatialDifference(previousPosition?: HistoricCursorPosition, newPosition?: HistoricCursorPosition): boolean {
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

	/**
	 * It is nice if you can navigate back, copy something and navigate forward again.
	 * But selecting the text to copy will create a new entry in the history.
	 * Therefore, we don't want to clear the forward-history immediately.
	 */
	private shouldClearNextPositions(newPosition: HistoricCursorPosition): boolean {
		if (this.nextPositions.length <= 0) {
			return false; // already empty: no point in clearing
		}
		const nextPositionTimestampMs = this.nextPositions[this.nextPositions.length - 1]?.epochTimestampMs ?? 0;
		const newTimestampMs = newPosition.epochTimestampMs;
		const timeDifferenceMs = newTimestampMs - nextPositionTimestampMs;

		return timeDifferenceMs > 1000 * NEXT_POSITIONS_CLEAR_TIME_THRESHOLD_S;
	}

	private enforceMaxHistoryLength(history: HistoricCursorPosition[]): HistoricCursorPosition[] {
		const maxHistoryLength = this.settingsProvider.settings.maxHistoryLength;
		return history.slice(-maxHistoryLength);
	}
}

interface HistoricCursorPosition {
	file: TFile;
	line: number;
	positionInLine: number;
	epochTimestampMs: number;
}

/**
 * Describes a range in the editor of CodeMirror based on characters in the file.
 * The numbers represent the absolute character position in the file (ignoring lines).
 */
interface CodeMirrorPositionRange {
	from: number;
	to: number;
}
