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
export const CURSOR_UPDATE_DEBOUNCE_MS = 150;
export const MAX_HISTORY_LENGTH = 500;
export const PLUGIN_FOLDER_NAME = 'cursor-position-history';

export const DEFAULT_SETTINGS: PluginSettings = {
	databaseFilePath: `plugins/${PLUGIN_FOLDER_NAME}/cursor-position-history.json`, // the base-path will be added during initialization
	delayAfterFileOpeningMs: 200,
	saveTimoutMs: MIN_SAVE_TIMEOUT_MS,
	maxHistoryLength: MAX_HISTORY_LENGTH
};
