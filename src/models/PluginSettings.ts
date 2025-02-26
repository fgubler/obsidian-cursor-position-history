export interface SettingsProvider {
	settings: PluginSettings;
	saveSettings(newSettings: PluginSettings): Promise<void>;
}

export interface PluginSettings {
	databaseFilePath: string;
	delayAfterFileOpeningMs: number;
	saveTimoutMs: number;
	maxHistoryLength: number;
}

export const MIN_SAVE_TIMEOUT_MS = 5000;
export const CURSOR_POSITION_UPDATE_INTERVAL_MS = 200;
export const MAX_HISTORY_LENGTH = 500;

export const DEFAULT_SETTINGS: PluginSettings = {
	databaseFilePath: 'plugins/cursor-position-history/cursor-position-history.json', // the base-path will be added during initialization
	delayAfterFileOpeningMs: 200,
	saveTimoutMs: MIN_SAVE_TIMEOUT_MS,
	maxHistoryLength: MAX_HISTORY_LENGTH
};
