export interface SettingsProvider {
	settings: PluginSettings;
	saveSettings(newSettings: PluginSettings): Promise<void>;
}

export interface PluginSettings {
	databaseFileName: string;
	delayAfterFileOpeningMs: number;
	saveTimoutMs: number;
	maxHistoryLength: number;
}

export const MIN_SAVE_TIMEOUT_MS = 5000;
export const CURSOR_POSITION_UPDATE_INTERVAL_MS = 200;

export const DEFAULT_SETTINGS: PluginSettings = {
	databaseFileName: '.obsidian/plugins/obsidian-cursor-position-history/cursor-position-history.json',
	delayAfterFileOpeningMs: 200,
	saveTimoutMs: MIN_SAVE_TIMEOUT_MS,
	maxHistoryLength: 500
};
