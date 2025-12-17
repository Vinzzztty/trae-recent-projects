# Trae

Control Trae directly from Raycast

[![raycast-cross-extension-badge]][raycast-cross-extension-link]

![Trae screenshot](metadata/preview.jpeg)

## What is this extension

- Search Trae Recent Projects
- Use `Open with Trae` command
- Use `Open New Window` command

## API

This extension follows [Raycast Cross-Extension Conventions][raycast-cross-extension-link].

You can use `crossLaunchCommand` to launch its commands from other extensions.

### Launch Example

```js
import { LaunchType, open } from "@raycast/api";
import { crossLaunchCommand } from "raycast-cross-extension";

await crossLaunchCommand({
  name: "search-trae-recent-projects",
  extensionName: "trae",
  ownerOrAuthorName: "vinzzztty",
  type: LaunchType.UserInitiated,
}).catch(() => {
  // Open the store page if the extension is not installed
  open("raycast://extensions/vinzzztty/trae");
});
```

## Development

```bash
# Install dependencies
npm i

# Start local development server
npm run dev

# Lint and fix
npm run fix-lint

# Build the extension
npm run build
```

[raycast-cross-extension-badge]: https://shields.io/badge/Raycast-Cross--Extension-eee?labelColor=FF6363&logo=raycast&logoColor=fff&style=flat-square
[raycast-cross-extension-link]: https://github.com/LitoMore/raycast-cross-extension-conventions
