import {Editor, EditorRange, MarkdownView, Plugin, TAbstractFile, Tasks, TFile} from "obsidian";
import {ViewPlugin} from "@codemirror/view";
import {SettingsTab} from "./SettingsTab";
import {logRejection, serializeError} from "./utils/LoggingUtil";
import {copySerializable} from "./utils/BaseUtil";
import {createFileIdentifier, INVALID_FILE_IDENTIFIER} from "./utils/ObsidianUtil";
import {CursorState, DatabaseRepresentation} from "./models/DataTypes";
import {
	DEFAULT_SETTINGS,
	MIN_SAVE_TIMEOUT_MS,
	PluginSettings,
	SettingsProvider
} from "./models/PluginSettings";
import {PLUGIN_NAME} from "./models/Constants";
import {EphemeralPositionHistoryService} from "./EphemeralPositionHistoryService";
import {CursorObserver, CursorUpdateHandler} from "./CursorObserver";

export class CursorPositionHistoryPlugin extends Plugin implements SettingsProvider, CursorUpdateHandler {
	settings: PluginSettings;

	database: DatabaseRepresentation;
	lastSavedDatabase: DatabaseRepresentation;

	loadedLeafIdList: string[] = [];
	historyService!: EphemeralPositionHistoryService;

	lastLoadedFileName: string;

	loadingFile = false;

	private saveTimeoutId: number | undefined;

	async onload() {
		this.historyService = new EphemeralPositionHistoryService(this);

		await this.loadSettings();
		await this.initializeDatabase();
		this.addSettingTab(new SettingsTab(this.app, this, MIN_SAVE_TIMEOUT_MS));

		await this.registerEvents();
		this.registerCursorObserver();
		await this.registerTimeIntervals();
		await this.registerShortcutCommands();

		// during startup, the workspace (and the editors) are not ready yet when the plugin is loaded
		this.app.workspace.onLayoutReady(() =>
			logRejection(this.restoreCursorState(), 'failed to restore cursor state on startup'));
	}

	private async initializeDatabase(): Promise<void> {
		try {
			this.database = await this.readDatabase();
		} catch (e) {
			console.error(`${PLUGIN_NAME} can't read database: ` + serializeError(e));
			this.database = {};
			this.lastSavedDatabase = {};
		}
		this.lastSavedDatabase = copySerializable(this.database);
	}

	private async registerEvents(): Promise<void> {
		this.registerEvent(
			this.app.workspace.on('file-open', () =>
				logRejection(this.restoreCursorState(), 'failed to restore cursor state'))
		);

		this.registerEvent(
			this.app.workspace.on('quit', (tasks: Tasks) => {
				const write = this.writeDatabase(this.database);
				tasks.addPromise(write);
				logRejection(write, 'failed to write database on quit');
			}),
		);


		this.registerEvent(
			this.app.vault.on('rename', (file, oldPath) => this.renameFile(file, oldPath)),
		);

		this.registerEvent(
			this.app.vault.on('delete', (file) => this.deleteFile(file)),
		);
	}

	private registerCursorObserver(): void {
		this.registerEditorExtension(ViewPlugin.define(view => new CursorObserver(view, this)));
	}

	private async registerTimeIntervals(): Promise<void> {
		this.scheduleNextSave();
		this.register(() => window.clearTimeout(this.saveTimeoutId));
	}

	/** Re-arms the save timer on every tick so changes to `saveTimoutMs` take effect immediately. */
	private scheduleNextSave(): void {
		window.clearTimeout(this.saveTimeoutId);
		this.saveTimeoutId = window.setTimeout(() => {
			logRejection(this.writeDatabase(this.database), 'failed to write database');
			this.scheduleNextSave();
		}, this.settings.saveTimoutMs);
	}

	private async registerShortcutCommands(): Promise<void> {
		this.addCommand({
			id: 'previous-cursor-position',
			name: 'Return to previous cursor position',
			editorCallback: async (editor: Editor, _: MarkdownView) => {
				const activeLeaf = this.app.workspace.getMostRecentLeaf();
				await this.historyService.returnToPreviousPosition(editor, activeLeaf);
			}
		});
		this.addCommand({
			id: 'cursor-position-forward',
			name: 'Re-return to next cursor position',
			editorCallback: async (editor: Editor, _: MarkdownView) => {
				const activeLeaf = this.app.workspace.getMostRecentLeaf();
				await this.historyService.proceedToNextPosition(editor, activeLeaf);
			}
		});
	}

	renameFile(file: TAbstractFile, oldPath: string) {
		const newName = file.path;
		const oldName = oldPath;
		this.database[newName] = this.database[oldName];
		delete this.database[oldName];
	}


	deleteFile(file: TAbstractFile) {
		const fileName = file.path;
		delete this.database[fileName];
	}


	handleCursorUpdate(file: TFile, editor: Editor, hasFocus: boolean): void {
		if (this.isRestoring(file.path)) {
			return; // the position is being restored: don't record intermediate states
		}

		const state = this.getCursorState(editor);
		if (!this.isValidState(state)) {
			return;
		}

		const previousState = this.database[file.path];
		if (this.isCursorStatesEquals(state, previousState)) {
			return;
		}
		this.database[file.path] = state;

		// Only user navigation belongs into the history: not scrolling (the cursor stays), not changes in a
		// background pane, and not the first state of a file (it becomes part of the history once the cursor moves).
		const cursorMoved = !!previousState && !this.isCursorRangesEquals(state.cursor, previousState.cursor);
		if (hasFocus && cursorMoved && state.cursor) {
			this.historyService.updateCurrentPosition({
				file: file,
				line: state.cursor.to.line,
				positionInLine: state.cursor.to.ch,
				epochTimestampMs: Date.now()
			});
		}
	}

	/** @return true while restoreCursorState() is running for the given file (updates of other files are unaffected). */
	private isRestoring(fileName: string): boolean {
		return this.loadingFile && this.lastLoadedFileName === fileName;
	}

	private isValidState(state: CursorState): boolean {
		return !!(
			state.scrollState &&
			!isNaN(state.scrollState.top) &&
			!isNaN(state.scrollState.left)
		);
	}

	isCursorStatesEquals(state1: CursorState | undefined, state2: CursorState | undefined): boolean {
		if (!this.isCursorRangesEquals(state1?.cursor, state2?.cursor)) {
			return false;
		}

		const scrollState1 = state1?.scrollState;
		const scrollState2 = state2?.scrollState;

		if (scrollState1 && !scrollState2) {
			return false;
		}
		if (!scrollState1 && scrollState2) {
			return false;
		}
		if (scrollState1 && scrollState2 && (scrollState1.left != scrollState2.left || scrollState1.top != scrollState2.top)) {
			return false;
		}

		return true;
	}

	isCursorRangesEquals(cursor1: EditorRange | undefined, cursor2: EditorRange | undefined): boolean {
		if (!cursor1 || !cursor2) {
			return !cursor1 && !cursor2;
		}

		return cursor1.from.ch == cursor2.from.ch &&
			cursor1.from.line == cursor2.from.line &&
			cursor1.to.ch == cursor2.to.ch &&
			cursor1.to.line == cursor2.to.line;
	}


	async restoreCursorState() {
		const fileName = this.app.workspace.getActiveFile()?.path;

		if (!fileName || this.loadingFile && this.lastLoadedFileName == fileName) { // already started loading
			return;
		}

		const openedByHistoryNavigation = this.historyService.consumeNavigationTarget(fileName);

		if (this.isActiveFileAlreadyLoaded()) {
			this.lastLoadedFileName = fileName; // also makes a pending restore for another file abort
			this.loadingFile = false; // abort => not loading anymore
			return;
		}

		this.loadedLeafIdList = this.app.workspace.getLeavesOfType("markdown")
			.map(leaf => createFileIdentifier(leaf) ?? INVALID_FILE_IDENTIFIER)
			.filter(fileIdentifier => fileIdentifier !== INVALID_FILE_IDENTIFIER);

		this.loadingFile = true;

		if (this.lastLoadedFileName != fileName) {
			this.lastLoadedFileName = fileName;

			const state = this.database[fileName];
			let positionedByLink = false;

			if (state && !openedByHistoryNavigation) {
				// wait until the file is ready
				await sleep(this.settings.delayAfterFileOpeningMs)
				if (this.wasSupersededBy(fileName)) {
					return; // another file was opened meanwhile
				}

				// Don't scroll when the file was opened by a link which already scrolls and highlights text
				// (because it e.g. targets a specific heading)
				positionedByLink = !!this.app.workspace.containerEl.querySelector('span.is-flashing');

				if (!positionedByLink) {
					const delayMs = 10;
					await sleep(delayMs)
					if (this.wasSupersededBy(fileName)) {
						return;
					}
					this.setCursorState(state);
				}
			}

			this.loadingFile = false;

			if (positionedByLink) {
				// The link placed the cursor while the restore was pending, and updates were ignored meanwhile:
				// record the position now, it won't be reported again unless the cursor moves.
				this.recordCurrentState(fileName);
			}
		}

		this.loadingFile = false;
	}

	/** Records the current state of the active editor, if it shows the given file. */
	private recordCurrentState(fileName: string): void {
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (view?.file?.path === fileName) {
			this.handleCursorUpdate(view.file, view.editor, view.editor.hasFocus());
		}
	}

	/** @return true if a newer restoreCursorState() call for a different file started while this one was waiting. */
	private wasSupersededBy(fileName: string): boolean {
		return this.lastLoadedFileName !== fileName;
	}

	private isActiveFileAlreadyLoaded(): boolean {
		const activeLeaf = this.app.workspace.getMostRecentLeaf();
		const fileIdentifier = createFileIdentifier(activeLeaf);
		return this.loadedLeafIdList.includes(fileIdentifier ?? INVALID_FILE_IDENTIFIER);
	}

	async readDatabase(): Promise<{ [filePath: string]: CursorState; }> {
		let database: { [filePath: string]: CursorState; } = {}

		if (await this.app.vault.adapter.exists(this.settings.databaseFilePath)) {
			const data = await this.app.vault.adapter.read(this.settings.databaseFilePath);
			database = JSON.parse(data) as DatabaseRepresentation;
		}

		return database;
	}

	async writeDatabase(database: DatabaseRepresentation) {
		//create folder for database file if not exist
		const newParentFolder = this.settings.databaseFilePath.substring(0, this.settings.databaseFilePath.lastIndexOf("/"));
		const parentFolderExists = await this.app.vault.adapter.exists(newParentFolder);
		if (!parentFolderExists) {
			await this.app.vault.adapter.mkdir(newParentFolder);
		}

		const databaseChanged = JSON.stringify(this.database) !== JSON.stringify(this.lastSavedDatabase);
		if (databaseChanged) {
			// pretty-printed: line-based diffs keep the file readable in version control
			const serializedDatabase = JSON.stringify(database, null, 2);
			await this.app.vault.adapter.write(this.settings.databaseFilePath, serializedDatabase);
			this.lastSavedDatabase = copySerializable(database);
		}
	}

	getCursorState(editor: Editor): CursorState {
		const state: CursorState = {};

		state.scrollState = editor.getScrollInfo();
		const from = editor.getCursor("anchor");
		const to = editor.getCursor("head");
		if (from && to) {
			state.cursor = {
				from: {ch: from.ch, line: from.line},
				to: {ch: to.ch, line: to.line}
			}
		}

		return state;
	}

	setCursorState(state: CursorState) {
		const editor = this.getEditor();
		if (editor) {
			if (state.cursor) {
				editor.setSelection(state.cursor.from, state.cursor.to);
				editor.scrollIntoView(state.cursor, true)
			} else {
				editor.scrollTo(state.scrollState?.left, state.scrollState?.top);
			}
		}
	}

	private getEditor(): Editor | undefined {
		return this.app.workspace.getActiveViewOfType(MarkdownView)?.editor;
	}

	async loadSettings() {
		const defaultSettings = copySerializable(DEFAULT_SETTINGS);
		defaultSettings.databaseFilePath = this.app.vault.configDir + "/" + defaultSettings.databaseFilePath;

		const settings: PluginSettings = {
			...defaultSettings,
			...(await this.loadData() as Partial<PluginSettings> | null)
		}
		if (settings?.saveTimoutMs < MIN_SAVE_TIMEOUT_MS) {
			settings.saveTimoutMs = MIN_SAVE_TIMEOUT_MS;
		}
		this.settings = settings;
	}

	async saveSettings(newSettings: PluginSettings): Promise<void> {
		const saveTimeoutChanged = this.settings.saveTimoutMs !== newSettings.saveTimoutMs;
		this.settings = {...newSettings};
		await this.saveData(newSettings);
		if (saveTimeoutChanged) {
			this.scheduleNextSave();
		}
	}

}
