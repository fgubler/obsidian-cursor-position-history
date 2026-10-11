# Contributing

Thank you for your interest in improving the Cursor Position History plugin!
Bug reports, feature ideas and pull requests are all welcome.

## Reporting Bugs & Requesting Features

Please open an [issue on GitHub](https://github.com/fgubler/obsidian-cursor-position-history/issues).

For bugs, it helps a lot if you include:

- your Obsidian version, the plugin version and your platform (Windows / macOS / Linux / Android / iOS)
- the steps to reproduce the problem, what you expected to happen and what actually happened
- any error messages from the developer console (`Ctrl + Shift + I` / `Cmd + Option + I`), which are prefixed with `CursorPositionHistoryPlugin`
- whether the problem persists with other community plugins disabled

## Development Setup

Requirements: [Node.js](https://nodejs.org) (a current LTS version) and npm.

1. Fork and clone the repository. For the easiest testing, clone it directly into the plugins folder of a **test vault** (not your main vault):
   ```bash
   cd <test-vault>/.obsidian/plugins
   git clone https://github.com/<your-username>/obsidian-cursor-position-history.git cursor-position-history
   cd cursor-position-history
   ```
2. Install the dependencies:
   ```bash
   npm ci
   ```
3. Start the build in watch mode (re-builds `main.js` on every change):
   ```bash
   npm run dev
   ```
4. In Obsidian, enable the plugin under **Settings** → **Community plugins**.
   After a change, reload the plugin (disable & enable it) or reload Obsidian (command palette: "Reload app without saving").
   The community plugin [Hot-Reload](https://github.com/pjeby/hot-reload) can do this automatically.

## Before Opening a Pull Request

Please make sure that the following commands succeed:

```bash
npm run lint    # ESLint
npm run build   # type-check & production build
```

Also:

- Keep pull requests focused: one bug fix or feature per pull request.
- Follow the existing code style (tabs for indentation, see `.editorconfig`).
- Test your change manually in Obsidian, ideally including the case of multiple tabs / split panes, and mention in the pull request how you tested it.
- Stick to the public [Obsidian API](https://docs.obsidian.md/Reference/TypeScript+API) where possible, and follow the [plugin guidelines](https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines).
  If you really need an internal API, isolate it in a small, type-guarded helper (see `src/utils/ObsidianUtil.ts`).
- Do not add runtime dependencies unless there is a very good reason.
- Do not update `manifest.json`, `versions.json` or the version in `package.json`: releases are handled by the maintainer.

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE) of this project.
