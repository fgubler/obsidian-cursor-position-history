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
		let { containerEl } = this;

		containerEl.empty();

		containerEl.createEl('h2', { text: `${PLUGIN_NAME} - Settings` });

		new Setting(containerEl)
			.setName('Database file name')
			.setDesc('The plugin will use this file to store its data which needs to survive a restart of Obsidian.')
			.addText((text: TextComponent) =>
				text
					.setPlaceholder('Example: cursor-position-history.json')
					.setValue(this.settingsProvider.settings.databaseFileName)
					.onChange(async (value: string) => {
						this.settingsProvider.settings.databaseFileName = value;
						await this.settingsProvider.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName('Delay after opening a new note in milliseconds')
			.setDesc("A time-delay to avoid scrolling when opening a file through a link which already scrolls to a specific position. " +
				"If you are not using links to page sections, set the delay to zero (slider to the left). Slider values: 0-300 ms (default value: 200 ms).")
			.addSlider((text) =>
				text
					.setLimits(0, 300, 10)
					.setValue(this.settingsProvider.settings.delayAfterFileOpeningMs)
					.onChange(async (value) => {
						this.settingsProvider.settings.delayAfterFileOpeningMs = value;
						await this.settingsProvider.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName('Delay between saving the current cursor position')
			.setDesc("The current data is stored to the database file periodically (as well as when Obsidian is closed)."			)
			.addSlider((text) =>
				text
					.setLimits(this.minSaveTimeoutMs, this.minSaveTimeoutMs * 10, 10)
					.setValue(this.settingsProvider.settings.saveTimoutMs)
					.onChange(async (value) => {
						this.settingsProvider.settings.saveTimoutMs = value;
						await this.settingsProvider.saveSettings();
					})
			);
	}
}
