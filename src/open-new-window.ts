import { getPreferenceValues, showToast, Toast, closeMainWindow } from "@raycast/api";
import { runAppleScript } from "@raycast/utils";
import { exec as _exec } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(_exec);

type Preferences = {
  traeAppName?: string;
  traeBundleId?: string;
};

export default async function Command() {
  const prefs = getPreferenceValues<Preferences>();
  const appName = prefs.traeAppName?.trim() || "Trae";
  const bundleId = prefs.traeBundleId?.trim();
  const toast = await showToast({ style: Toast.Style.Animated, title: "Opening Trae…" });
  try {
    const scriptKeystroke = `tell application "${appName}" to activate
tell application "System Events" to keystroke "n" using {command down, shift down}`;
    try {
      await runAppleScript(scriptKeystroke);
    } catch {
      const scriptMenu = `tell application "${appName}" to activate
tell application "System Events"
  tell application process "${appName}"
    set frontmost to true
    try
      click menu item "New Window" of menu "File" of menu bar 1
    on error
      click menu item "New" of menu "File" of menu bar 1
    end try
  end tell
end tell`;
      try {
        await runAppleScript(scriptMenu);
      } catch {
        if (bundleId) {
          await exec(`open -n -b ${bundleId} --args --new-window`);
        } else {
          await exec(`open -n -a "${appName}" --args --new-window`);
        }
      }
    }
    try {
      const scriptCloseWorkspaceMenu = `tell application "${appName}" to activate
tell application "System Events"
  tell application process "${appName}"
    set frontmost to true
    try
      click menu item "Close Workspace" of menu "File" of menu bar 1
    on error
      click menu item "Close Folder" of menu "File" of menu bar 1
    end try
  end tell
end tell`;
      try {
        await runAppleScript(scriptCloseWorkspaceMenu);
      } catch {
        const scriptCloseWindow = `tell application "${appName}" to activate
tell application "System Events"
  keystroke "w" using {command down}
end tell`;
        await runAppleScript(scriptCloseWindow);
        const scriptReopenNew = `tell application "${appName}" to activate
tell application "System Events" to keystroke "n" using {command down, shift down}`;
        await runAppleScript(scriptReopenNew);
      }
    } catch {
      // ignore
    }
    toast.style = Toast.Style.Success;
    toast.title = "New window opened";
    await closeMainWindow();
  } catch (error) {
    toast.style = Toast.Style.Failure;
    toast.title = "Failed to open new window";
    toast.message =
      error instanceof Error
        ? error.message
        : "Try enabling Accessibility permission for Raycast, or set Trae Bundle ID in preferences.";
  }
}
