# Cursor Position History Plugin

**Effortlessly navigate your notes with enhanced cursor memory and history tracking.**

This free & open-source plugin for [Obsidian](https://obsidian.md) provides two powerful functionalities to improve your workflow when working with large vaults, containing multiple notes, in Obsidian:

## Features

1. **Remember Cursor Position in Files**
	- The plugin remembers the exact cursor position in the previous file when you navigate to another file.
	- When you return to the same file, it automatically scrolls back to the position where you left off, saving you time and effort.

2. **Cursor History Navigation**
	- The plugin keeps a history of your cursor positions across files.
	- Use customizable shortcuts to:
		- **Go Back**: Jump to the previous cursor position in the history.
		- **Go Forward**: Return to the next cursor position in the history.
	- This feature is perfect for quickly navigating between different parts of your notes without losing context.

## Why Use This Plugin?
With this plugin, you'll never lose your place again when switching between notes, and you'll have complete control over your navigation history.

- Stay focused and avoid losing track of where you were working.
- Quickly navigate between related sections of your notes or across different files.
- Ideal for researchers, writers, or anyone who frequently switches between notes.

### How is this different from Obsidian's built-in "Navigate back / forward"?
Obsidian's core navigation only moves between **files**: going back re-opens the previous note, but not necessarily at the place where you were working in it.
This plugin works on the level of **cursor positions**:

- Going back takes you to the exact line where your cursor was.
- Jumping around within a single long file is part of the history as well.
- When you open a note, you land where you left off, regardless of how you opened it (file explorer, quick switcher, search, ...).
  Links which target a specific heading or block keep scrolling to their target.

## Hotkeys

The plugin adds two commands, which you can find in the command palette:

| Command                                                       | Action                                          |
|---------------------------------------------------------------|-------------------------------------------------|
| `Cursor Position History: Return to previous cursor position` | Go back to the previous position in the history |
| `Cursor Position History: Re-return to next cursor position`  | Go forward again (after having gone back)       |

**No hotkeys are assigned by default** (to avoid conflicts with your existing hotkeys). To assign them:

1. Open **Settings** → **Hotkeys**.
2. Search for "Cursor Position History".
3. Click the **+** next to each command and press the key combination you want to use.

A common choice is to mirror the "back / forward" hotkeys of your IDE or browser (e.g. `Alt + ←` / `Alt + →`).
If Obsidian reports a conflict, check whether the combination is already used by another command (e.g. Obsidian's own "Navigate back / forward").

The history is kept in memory only: it is cleared when Obsidian is restarted.
The last cursor position within each note (used to restore your place when re-opening a note), on the other hand, is saved to disk and survives restarts.

## Installation

### From Obsidian (recommended)

1. Open **Settings** → **Community plugins** and make sure **Restricted mode** is off.
2. Click **Browse** and search for "Cursor Position History".
3. Click **Install**, then **Enable**.

### Manually

1. Download `main.js`, `manifest.json`, and `styles.css` (if present) from the [Github Repository](https://github.com/fgubler/obsidian-cursor-position-history).
2. Create a folder named `cursor-position-history` inside your vault's `.obsidian/plugins/` directory and place the downloaded files there.
3. Reload Obsidian, then enable the plugin under **Settings** → **Community plugins**.

## Contributing

Bug reports, ideas and pull requests are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md) for how to report issues and set up a development environment.

## Acknowledgements

This plugin draws inspiration from the following Obsidian plugins, and I would like to thank their authors for their excellent work:

- [Navigate Cursor History](https://github.com/heycalmdown/navigate-cursor-history/) by heycalmdown
- [Remember Cursor Position](https://github.com/dy-sh/obsidian-remember-cursor-position/) by dy-sh
