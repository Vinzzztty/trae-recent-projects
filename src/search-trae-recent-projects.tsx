import {
  Action,
  ActionPanel,
  Color,
  Icon,
  List,
  LocalStorage,
  getPreferenceValues,
  showToast,
  Toast,
  open,
  closeMainWindow,
} from "@raycast/api";
import { runAppleScript } from "@raycast/utils";
import { useEffect, useState } from "react";
import path from "node:path";

import { exec as _exec } from "node:child_process";
import { promisify } from "node:util";
const exec = promisify(_exec);

type Preferences = {
  projectsRoot?: string;
  traeAppName?: string;
  traeBundleId?: string;
};

type Project = {
  name: string;
  path: string;
  mtimeMs: number;
};

function toTildePath(p: string) {
  const home = process.env.HOME || "";
  if (home && p.startsWith(home)) return `~${p.slice(home.length)}`;
  return p;
}

async function getTraeRecentPaths(appName: string, bundleId?: string): Promise<string[]> {
  const useBundleId = !!bundleId && bundleId.toLowerCase() !== "undefined" && bundleId.toLowerCase() !== "null";
  const tellLine = useBundleId ? `tell application id "${bundleId}"` : `tell application "${appName}"`;
  const script = `
    try
      set pList to {}
      ${tellLine}
        set docs to (get recent documents)
      end tell
      repeat with d in docs
        try
          set end of pList to POSIX path of (path of d)
        end try
      end repeat
      set text item delimiters to ","
      return pList as text
    on error
      return ""
    end try
  `;
  const out = await runAppleScript(script);
  return out
    .split(",")
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

async function openWithTrae(projectPath: string) {
  const prefs = getPreferenceValues<Preferences>();
  const appName = prefs.traeAppName?.trim() || "Trae";
  const bundleId = prefs.traeBundleId?.trim();
  if (bundleId) {
    await exec(`open -b ${bundleId} "${projectPath}"`);
  } else {
    await open(projectPath, appName);
  }
  const recent = (await LocalStorage.getItem<string>("trae_recent_projects")) || "[]";
  let parsed: Project[] = [];
  try {
    parsed = JSON.parse(recent);
  } catch {
    parsed = [];
  }
  const existing = parsed.filter((p) => p.path !== projectPath);
  existing.unshift({ name: path.basename(projectPath), path: projectPath, mtimeMs: Date.now() });
  await LocalStorage.setItem("trae_recent_projects", JSON.stringify(existing.slice(0, 100)));
}

async function refreshItems(setItems: (items: Project[]) => void) {
  try {
    const recent = (await LocalStorage.getItem<string>("trae_recent_projects")) || "[]";
    let recentList: Project[] = [];
    try {
      recentList = JSON.parse(recent);
    } catch {
      recentList = [];
    }
    const prefs = getPreferenceValues<{ traeAppName?: string; traeBundleId?: string }>();
    let traePaths: string[] = [];
    try {
      traePaths = await getTraeRecentPaths(prefs.traeAppName?.trim() || "Trae", prefs.traeBundleId?.trim());
    } catch {
      traePaths = [];
    }
    const traeRecentProjects: Project[] = traePaths.map((pth) => ({
      name: path.basename(pth),
      path: pth,
      mtimeMs: Date.now(),
    }));
    const merged = [...recentList, ...traeRecentProjects].reduce<Project[]>((acc, p) => {
      if (!acc.find((x) => x.path === p.path)) acc.push(p);
      return acc;
    }, []);
    const sorted = merged.sort((a, b) => b.mtimeMs - a.mtimeMs);
    setItems(sorted);
  } catch {
    // silent
  }
}

export default function Command() {
  const [items, setItems] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const recent = (await LocalStorage.getItem<string>("trae_recent_projects")) || "[]";
        let recentList: Project[] = [];
        try {
          recentList = JSON.parse(recent);
        } catch {
          recentList = [];
        }
        const sortedInitial = recentList.sort((a, b) => b.mtimeMs - a.mtimeMs);
        setItems(sortedInitial);
        await refreshItems(setItems);
      } catch (error) {
        await showToast({
          style: Toast.Style.Failure,
          title: "Failed to load projects",
          message: error instanceof Error ? error.message : String(error),
        });
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);
  useEffect(() => {
    const id = setInterval(() => {
      refreshItems(setItems);
    }, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <List isLoading={loading} searchBarPlaceholder="Search projects…">
      {items.map((p: Project) => (
        <List.Item
          key={p.path}
          title={path.basename(p.path)}
          subtitle={toTildePath(p.path)}
          icon={Icon.Folder}
          accessories={[{ date: new Date(p.mtimeMs), icon: { source: Icon.Clock, tintColor: Color.SecondaryText } }]}
          actions={
            <ActionPanel>
              <Action
                title="Open with Trae"
                onAction={async () => {
                  const toast = await showToast({ style: Toast.Style.Animated, title: "Opening with Trae…" });
                  try {
                    await openWithTrae(p.path);
                    toast.style = Toast.Style.Success;
                    toast.title = "Opened in Trae";
                    await closeMainWindow();
                  } catch (error) {
                    toast.style = Toast.Style.Failure;
                    toast.title = "Failed to open";
                    toast.message = error instanceof Error ? error.message : String(error);
                  }
                }}
              />
              <Action.Open title="Reveal in Finder" target={p.path} />
              <Action.CopyToClipboard title="Copy Path" content={p.path} />
            </ActionPanel>
          }
        />
      ))}
      {items.length === 0 && !loading && (
        <List.EmptyView
          title="No projects found"
          description="Set your Projects Root in preferences or start opening projects with Trae."
          icon="extension-icon.png"
        />
      )}
    </List>
  );
}
