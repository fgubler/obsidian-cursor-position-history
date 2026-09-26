import {debounce, Debouncer, Editor, editorInfoField, MarkdownView, TFile} from "obsidian";
import {EditorView, PluginValue, ViewUpdate} from "@codemirror/view";
import {CURSOR_UPDATE_DEBOUNCE_MS} from "./models/PluginSettings";

export interface CursorUpdateHandler {
	handleCursorUpdate(file: TFile, editor: Editor, hasFocus: boolean): void;
}

/**
 * CodeMirror view plugin: one instance per editor (tab, split pane, popout window, ...).
 * Notifies the handler when the selection, the document or the scroll position of *this* editor changed.
 * Nothing happens while the editor is idle, and bursts (typing, scrolling) are debounced per editor,
 * so a busy background pane cannot swallow the pending update of the focused pane.
 */
export class CursorObserver implements PluginValue {
	private readonly notify: Debouncer<[], void>;
	private readonly onScroll = () => this.notify();

	constructor(private readonly view: EditorView, private readonly handler: CursorUpdateHandler) {
		this.notify = debounce(() => this.emitCurrentState(), CURSOR_UPDATE_DEBOUNCE_MS, true);

		// scrolling does not create a CodeMirror transaction, so it needs a DOM listener
		view.scrollDOM.addEventListener('scroll', this.onScroll, {passive: true});
	}

	update(update: ViewUpdate): void {
		// docChanged covers edits which move the cursor without setting the selection (e.g. sync inserting lines above it)
		if (update.selectionSet || update.docChanged) {
			this.notify();
		}
	}

	destroy(): void {
		this.notify.cancel();
		this.view.scrollDOM.removeEventListener('scroll', this.onScroll);
	}

	/** Reads the current state of this view: the file and editor it belongs to, not whatever pane is active. */
	private emitCurrentState(): void {
		const info = this.view.state.field(editorInfoField, false);

		// Only markdown views are tracked (same as before): other editors, e.g. cards in a canvas, have no restorable position.
		if (!(info instanceof MarkdownView)) {
			return;
		}

		const file = info.file;
		if (file) {
			this.handler.handleCursorUpdate(file, info.editor, this.view.hasFocus);
		}
	}
}
