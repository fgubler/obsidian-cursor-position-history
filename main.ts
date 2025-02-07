import {Editor, EditorRange, MarkdownView, Plugin, TAbstractFile} from 'obsidian';
import {SettingsTab} from "./SettingsTab";
import {serializeError} from "./LoggingUtil";
import {createFileIdentifier, INVALID_FILE_IDENTIFIER} from "./ObsidianUtil";
import {copySerializable, delay} from "./BaseUtil";

interface PluginSettings {
	databaseFileName: string;
	delayAfterFileOpeningMs: number;
	saveTimoutMs: number;
}

export const PLUGIN_NAME = "CursorPositionHistoryPlugin";

const MIN_SAVE_TIMEOUT_MS = 5000;
const CURSOR_POSITION_UPDATE_INTERVAL_MS = 200;

const DEFAULT_SETTINGS: PluginSettings = {
	databaseFileName: '.obsidian/plugins/obsidian-cursor-history/cursor-position-history.json',
	delayAfterFileOpeningMs: 100,
	saveTimoutMs: MIN_SAVE_TIMEOUT_MS,
};

interface CursorState {
	cursor?: EditorRange,
	scrollState?: ScrollState
}

interface ScrollState {
	top: number;
	left: number;
}

/**
 * the structure of the database-entries
 *  - string-keys which represent filePaths
 *  - the values represent the last cursor position in that file
 */
type DatabaseRepresentation = { [filePath: string]: CursorState; };

export default class CursorPositionHistory extends Plugin {
	settings: PluginSettings;
	database: { [file_path: string]: CursorState };
	lastSavedDatabase: { [file_path: string]: CursorState };
	lastEphemeralState: CursorState | undefined;
	lastLoadedFileName: string;
	loadedLeafIdList: string[] = [];
	loadingFile = false;

	async onload() {
		await this.loadSettings();
		await this.initializeDatabase();
		this.addSettingTab(new SettingsTab(this.app, this, MIN_SAVE_TIMEOUT_MS));

		await this.registerEvents();
		await this.registerTimeIntervals();

		await this.restoreEphemeralState();
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
			this.app.workspace.on('file-open', (_) => this.restoreEphemeralState())
		);

		this.registerEvent(
			this.app.workspace.on('quit', () => { this.writeDatabase(this.database) }),
		);


		this.registerEvent(
			this.app.vault.on('rename', (file, oldPath) => this.renameFile(file, oldPath)),
		);

		this.registerEvent(
			this.app.vault.on('delete', (file) => this.deleteFile(file)),
		);
	}

	private async registerTimeIntervals(): Promise<void> {
		// TODO try registering for an event to be informed about cursor position changes
		this.registerInterval(
			window.setInterval(() => this.checkEphemeralStateChanged(), CURSOR_POSITION_UPDATE_INTERVAL_MS)
		);

		this.registerInterval(
			window.setInterval(() => this.writeDatabase(this.database), this.settings.saveTimoutMs)
		);
	}

	renameFile(file: TAbstractFile, oldPath: string) {
		let newName = file.path;
		let oldName = oldPath;
		this.database[newName] = this.database[oldName];
		delete this.database[oldName];
	}


	deleteFile(file: TAbstractFile) {
		let fileName = file.path;
		delete this.database[fileName];
	}


	checkEphemeralStateChanged() {
		let fileName = this.app.workspace.getActiveFile()?.path;

		// wait until the file is loaded
		if (!fileName || !this.lastLoadedFileName || fileName != this.lastLoadedFileName || this.loadingFile) {
			return;
		}

		let state = this.getEphemeralState();

		if (!this.lastEphemeralState) {
			this.lastEphemeralState = state;
		}

		if (this.shouldSaveState(state)) {
			this.saveEphemeralState(state).then();
			this.lastEphemeralState = state;
		}
	}

	private shouldSaveState(state: CursorState): boolean {
		return !!(
			state.scrollState &&
			!isNaN(state.scrollState.top) &&
			!isNaN(state.scrollState.left) &&
			!this.isEphemeralStatesEquals(state, this.lastEphemeralState)
		);
	}

	isEphemeralStatesEquals(state1: CursorState | undefined, state2: CursorState | undefined): boolean {
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


	async saveEphemeralState(st: CursorState) {
		let fileName = this.app.workspace.getActiveFile()?.path;
		if (fileName && fileName == this.lastLoadedFileName) { //do not save if file changed or was not loaded
			this.database[fileName] = st;
		}
	}


	async restoreEphemeralState() {
		let fileName = this.app.workspace.getActiveFile()?.path;

		if (!fileName || this.loadingFile && this.lastLoadedFileName == fileName) { // already started loading
			return;
		}

		if (this.isActiveFileAlreadyLoaded()) {
			return;
		}

		this.loadedLeafIdList = this.app.workspace.getLeavesOfType("markdown")
			.map(leaf => createFileIdentifier(leaf) ?? INVALID_FILE_IDENTIFIER)
			.filter(fileIdentifier => fileIdentifier !== INVALID_FILE_IDENTIFIER);

		this.loadingFile = true;

		if (this.lastLoadedFileName != fileName) {
			this.lastEphemeralState = {}
			this.lastLoadedFileName = fileName;

			let state: CursorState | undefined = undefined;

			if (fileName) {
				state = this.database[fileName];
				if (state) {
					// wait until the file is ready
					await delay(this.settings.delayAfterFileOpeningMs)

					// Don't scroll when the file was opened by a link which already scrolls and highlights text
					// (because it e.g. targets a specific heading)
					let containsFlashingSpan = this.app.workspace.containerEl.querySelector('span.is-flashing');

					if (!containsFlashingSpan) {
						await delay(10)
						this.setEphemeralState(state);
					}
				}
			}
			this.lastEphemeralState = state;
		}

		this.loadingFile = false;
	}

	private isActiveFileAlreadyLoaded(): boolean {
		const activeLeaf = this.app.workspace.getMostRecentLeaf();
		const fileIdentifier = createFileIdentifier(activeLeaf);
		return this.loadedLeafIdList.includes(fileIdentifier ?? INVALID_FILE_IDENTIFIER);
	}

	async readDatabase(): Promise<{ [filePath: string]: CursorState; }> {
		let database: { [filePath: string]: CursorState; } = {}

		if (await this.app.vault.adapter.exists(this.settings.databaseFileName)) {
			let data = await this.app.vault.adapter.read(this.settings.databaseFileName);
			database = JSON.parse(data);
		}

		return database;
	}

	async writeDatabase(database: DatabaseRepresentation) {
		//create folder for database file if not exist
		const newParentFolder = this.settings.databaseFileName.substring(0, this.settings.databaseFileName.lastIndexOf("/"));
		const parentFolderExists = await this.app.vault.adapter.exists(newParentFolder);
		if (!parentFolderExists) {
			await this.app.vault.adapter.mkdir(newParentFolder);
		}

		const databaseChanged = JSON.stringify(this.database) !== JSON.stringify(this.lastSavedDatabase);
		if (databaseChanged) {
			await this.app.vault.adapter.write(this.settings.databaseFileName, JSON.stringify(database));
			this.lastSavedDatabase = copySerializable(database);
		}
	}

	getEphemeralState(): CursorState {
		const state: CursorState = {};
		let editor = this.getEditor();

		if (editor) {
			state.scrollState = editor.getScrollInfo();
			let from = editor.getCursor("anchor");
			let to = editor.getCursor("head");
			if (from && to) {
				state.cursor = {
					from: { ch: from.ch, line: from.line },
					to: { ch: to.ch, line: to.line }
				}
			}
		}

		return state;
	}

	setEphemeralState(state: CursorState) {
		let editor = this.getEditor();
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
		let settings: PluginSettings = {
			...DEFAULT_SETTINGS,
			...(await this.loadData())
		}
		if (settings?.saveTimoutMs < MIN_SAVE_TIMEOUT_MS) {
			settings.saveTimoutMs = MIN_SAVE_TIMEOUT_MS;
		}
		this.settings = settings;
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}



