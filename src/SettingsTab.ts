import {App, PluginSettingTab, Setting, TextComponent} from "obsidian";
import {CursorPositionHistoryPlugin} from "./CursorPositionHistoryPlugin";
import {PLUGIN_NAME} from "./models/Constants";
import {SettingsProvider} from "./models/PluginSettings";

export class SettingsTab extends PluginSettingTab {
	private settingsProvider: SettingsProvider;

	constructor(app: App, plugin: CursorPositionHistoryPlugin, private minSaveTimeoutMs: number) {
		super(app, plugin);
		this.settingsProvider = plugin;
	}

	display(): void {
		const { containerEl } = this;
		const settings = this.settingsProvider.settings;

		containerEl.empty();

		containerEl.createEl('h2', { text: `${PLUGIN_NAME} - Settings` });

		containerEl.createEl("p", {
			text: "This plugin has two functionalities - both related to the position of the cursor within the editor.",
		});

		const listOfFeaturesEl = containerEl.createEl("ol");
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

		new Setting(containerEl)
			.setName('Database file name')
			.setDesc('The plugin will use this file to store its data which needs to survive a restart of Obsidian.')
			.addText((text: TextComponent) =>
				text
					.setPlaceholder('Example: cursor-position-history.json')
					.setValue(settings.databaseFileName)
					.onChange(async (value: string) => {
						settings.databaseFileName = value;
						await this.settingsProvider.saveSettings(settings);
					})
			);

		new Setting(containerEl)
			.setName('Delay after opening a new note in milliseconds')
			.setDesc("A time-delay to avoid scrolling when opening a file through a link which already scrolls to a specific position. " +
				"If you are not using links to page sections, set the delay to zero (slider to the left). Slider values: 0-300 ms (default value: 200 ms).")
			.addSlider((text) =>
				text
					.setLimits(0, 300, 10)
					.setValue(settings.delayAfterFileOpeningMs)
					.onChange(async (value) => {
						settings.delayAfterFileOpeningMs = value;
						await this.settingsProvider.saveSettings(settings);
					})
			);

		new Setting(containerEl)
			.setName('Delay between saving the current cursor position')
			.setDesc("The current data is stored to the database file periodically (as well as when Obsidian is closed).")
			.addSlider((text) =>
				text
					.setLimits(this.minSaveTimeoutMs, this.minSaveTimeoutMs * 10, 10)
					.setValue(settings.saveTimoutMs)
					.onChange(async (value) => {
						settings.saveTimoutMs = value;
						await this.settingsProvider.saveSettings(settings);
					})
			);

		new Setting(containerEl)
			.setName('Maximum history length')
			.setDesc(`The history of the last N cursor positions is saved (until restarting Obsidian) to allow the user to go back and forth with short-cuts.`)
			.addSlider((text) =>
				text
					.setLimits(100, 2000, 100)
					.setValue(settings.maxHistoryLength)
					.onChange(async (value) => {
						settings.maxHistoryLength = value;
						await this.settingsProvider.saveSettings(settings);
					})
			);
	}
}
