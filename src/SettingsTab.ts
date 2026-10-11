import {App, PluginSettingTab, SettingDefinitionItem} from "obsidian";
import {CursorPositionHistoryPlugin} from "./CursorPositionHistoryPlugin";
import {MAX_HISTORY_LENGTH, PluginSettings, SettingsProvider} from "./models/PluginSettings";

export class SettingsTab extends PluginSettingTab {
	private settingsProvider: SettingsProvider;

	constructor(app: App, plugin: CursorPositionHistoryPlugin, private minSaveTimeoutMs: number) {
		super(app, plugin);
		this.settingsProvider = plugin;
	}

	getSettingDefinitions(): SettingDefinitionItem<keyof PluginSettings>[] {
		const maxSaveTimeoutMs = this.minSaveTimeoutMs * 10;
		return [
			{
				name: 'Plugin description',
				desc: createFragment((fragment) => this.renderDescription(fragment)),
				searchable: false,
			},
			{
				name: 'Database file path',
				desc: 'The plugin will use this file to store its data which needs to survive a restart of Obsidian.',
				control: {type: 'text', key: 'databaseFilePath', placeholder: 'Example: cursor-position-history.json'},
			},
			{
				name: 'Delay after opening a new note in milliseconds',
				desc: "A time-delay to avoid scrolling when opening a file through a link which already scrolls to a specific position. " +
					"If you are not using links to page sections, set the delay to zero (slider to the left). Slider values: 0-300 ms (default value: 200 ms).",
				control: {type: 'slider', key: 'delayAfterFileOpeningMs', min: 0, max: 300, step: 10},
			},
			{
				name: 'Delay between saving the current cursor position',
				desc: `The current data is stored to the database file periodically (as well as when Obsidian is closed). Slider values: ${this.minSaveTimeoutMs / 1000}-${maxSaveTimeoutMs / 1000}s (default value: ${this.minSaveTimeoutMs / 1000}s).`,
				control: {type: 'slider', key: 'saveTimoutMs', min: this.minSaveTimeoutMs, max: maxSaveTimeoutMs, step: 10},
			},
			{
				name: 'Maximum history length',
				desc: `The history of the last N cursor positions is saved (until restarting Obsidian) to allow the user to go back and forth with short-cuts. Slider values: 100-2000 (default value: ${MAX_HISTORY_LENGTH}).`,
				control: {type: 'slider', key: 'maxHistoryLength', min: 100, max: 2000, step: 100},
			},
		];
	}

	getControlValue(key: string): unknown {
		return this.settingsProvider.settings[key as keyof PluginSettings];
	}

	async setControlValue(key: string, value: unknown): Promise<void> {
		const settings = {...this.settingsProvider.settings, [key]: value};
		await this.settingsProvider.saveSettings(settings);
	}

	private renderDescription(parent: Node): void {
		parent.createEl("p", {
			text: "This plugin has two functionalities - both related to the position of the cursor within the editor.",
		});

		const listOfFeaturesEl = parent.createEl("ol");
		listOfFeaturesEl.createEl("li", {
			text: "It remembers the previous cursor position whenever you switch between documents. When you return to a previously opened document, it automatically scrolls to the position where you left it.",
		});
		listOfFeaturesEl.createEl("li", {
			text: "It keeps a history of the last few hundred cursor positions (across files), allowing you to move backward and forward using shortcuts.",
		});

		const listOfShortcutsEl = listOfFeaturesEl.lastChild?.createEl("ul");
		listOfShortcutsEl?.createEl("li", {
			text: "Shortcut 1: \"Return to previous cursor position\" goes backward in the history.",
		});
		listOfShortcutsEl?.createEl("li", {
			text: "Shortcut 2: \"Re-return to next cursor position\" goes forward in the history.",
		});
	}
}
