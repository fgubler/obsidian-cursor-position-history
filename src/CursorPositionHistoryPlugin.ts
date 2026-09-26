import {Editor, MarkdownView, Plugin, TAbstractFile, Tasks} from "obsidian";
import {SettingsTab} from "./SettingsTab";
import {logRejection, serializeError} from "./utils/LoggingUtil";
import {copySerializable} from "./utils/BaseUtil";
import {createFileIdentifier, INVALID_FILE_IDENTIFIER} from "./utils/ObsidianUtil";
import {CursorState, DatabaseRepresentation} from "./models/DataTypes";
import {
	CURSOR_POSITION_UPDATE_INTERVAL_MS,
	DEFAULT_SETTINGS,
	MIN_SAVE_TIMEOUT_MS,
	PluginSettings,
	SettingsProvider
} from "./models/PluginSettings";
import {PLUGIN_NAME} from "./models/Constants";
import {EphemeralPositionHistoryService} from "./EphemeralPositionHistoryService";

export class CursorPositionHistoryPlugin extends Plugin implements SettingsProvider {
	settings: PluginSettings;

	database: DatabaseRepresentation;
	lastSavedDatabase: DatabaseRepresentation;

	loadedLeafIdList: string[] = [];
	historyService!: EphemeralPositionHistoryService;

	latestCursorState: CursorState | undefined;
	lastLoadedFileName: string;

	loadingFile = false;

	private saveTimeoutId: number | undefined;

	async onload() {
		this.historyService = new EphemeralPositionHistoryService(this);

		await this.loadSettings();
		await this.initializeDatabase();
		this.addSettingTab(new SettingsTab(this.app, this, MIN_SAVE_TIMEOUT_MS));

		await this.registerEvents();
		await this.registerTimeIntervals();
		await this.registerShortcutCommands();

		await this.restoreCursorState();
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

	private async registerTimeIntervals(): Promise<void> {
		this.registerInterval(
			window.setInterval(() => this.checkCursorStateChanged(), CURSOR_POSITION_UPDATE_INTERVAL_MS)
		);

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


	checkCursorStateChanged() {
		const activeFile = this.app.workspace.getActiveFile();
		const fileName = activeFile?.path;

		// wait until the file is loaded
		if (!fileName || !this.lastLoadedFileName || fileName != this.lastLoadedFileName || this.loadingFile) {
			return;
		}

		const state = this.getCursorState();

		if (!this.latestCursorState) {
			this.latestCursorState = state;
		}

		if (this.shouldSaveState(state)) {
			logRejection(this.saveCursorState(state), 'failed to save cursor state');
			this.latestCursorState = state;

			if (activeFile && state.cursor) {
				this.historyService.updateCurrentPosition({
					file: activeFile,
					line: state.cursor.to.line,
					positionInLine: state.cursor.to.ch,
					epochTimestampMs: Date.now()
				})
			}
		}
	}

	private shouldSaveState(state: CursorState): boolean {
		return !!(
			state.scrollState &&
			!isNaN(state.scrollState.top) &&
			!isNaN(state.scrollState.left) &&
			!this.isCursorStatesEquals(state, this.latestCursorState)
		);
	}

	isCursorStatesEquals(state1: CursorState | undefined, state2: CursorState | undefined): boolean {
		const cursor1 = state1?.cursor;
		const cursor2 = state2?.cursor;

		if (!cursor1) {
			return !cursor2;
		}
		if (!cursor2) {
			return !cursor1;
		}

		if (cursor1.from.ch != cursor2.from.ch) {
			return false;
		}
		if (cursor1.from.line != cursor2.from.line) {
			return false;
		}
		if (cursor1.to.ch != cursor2.to.ch) {
			return false;
		}
		if (cursor1.to.line != cursor2.to.line) {
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


	async saveCursorState(st: CursorState) {
		const fileName = this.app.workspace.getActiveFile()?.path;
		if (fileName && fileName == this.lastLoadedFileName) { //do not save if file changed or was not loaded
			this.database[fileName] = st;
		}
	}


	async restoreCursorState() {
		const fileName = this.app.workspace.getActiveFile()?.path;

		if (!fileName || this.loadingFile && this.lastLoadedFileName == fileName) { // already started loading
			return;
		}

		const openedByHistoryNavigation = this.historyService.consumeNavigationTarget(fileName);

		if (this.isActiveFileAlreadyLoaded()) {
			this.lastLoadedFileName = fileName; // also makes a pending restore for another file abort
			this.latestCursorState = this.getCursorState();
			this.loadingFile = false; // abort => not loading anymore
			return;
		}

		this.loadedLeafIdList = this.app.workspace.getLeavesOfType("markdown")
			.map(leaf => createFileIdentifier(leaf) ?? INVALID_FILE_IDENTIFIER)
			.filter(fileIdentifier => fileIdentifier !== INVALID_FILE_IDENTIFIER);

		this.loadingFile = true;

		if (this.lastLoadedFileName != fileName) {
			this.latestCursorState = {}
			this.lastLoadedFileName = fileName;

			let state: CursorState | undefined = undefined;

			if (fileName) {
				state = this.database[fileName];
				if (state && !openedByHistoryNavigation) {
					// wait until the file is ready
					await sleep(this.settings.delayAfterFileOpeningMs)
					if (this.wasSupersededBy(fileName)) {
						return; // another file was opened meanwhile
					}

					// Don't scroll when the file was opened by a link which already scrolls and highlights text
					// (because it e.g. targets a specific heading)
					const containsFlashingSpan = this.app.workspace.containerEl.querySelector('span.is-flashing');

					if (!containsFlashingSpan) {
						const delayMs = 10;
						await sleep(delayMs)
						if (this.wasSupersededBy(fileName)) {
							return;
						}
						this.setCursorState(state);
					}
				}
			}
			this.latestCursorState = state;
		}

		this.loadingFile = false;
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

	getCursorState(): CursorState {
		const state: CursorState = {};
		const editor = this.getEditor();

		if (editor) {
			state.scrollState = editor.getScrollInfo();
			const from = editor.getCursor("anchor");
			const to = editor.getCursor("head");
			if (from && to) {
				state.cursor = {
					from: {ch: from.ch, line: from.line},
					to: {ch: to.ch, line: to.line}
				}
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
