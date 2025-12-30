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
  closeMainWindow,
  Application,
} from "@raycast/api";
import { useEffect, useState } from "react";
import path from "node:path";

import { exec as _exec } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
const exec = promisify(_exec);

type Preferences = {
  projectsRoot?: string;
  traeApp?: Application;
};

type Project = {
  name: string;
  path: string;
  mtimeMs: number;
  gitBranch?: string;
};

function smartTruncatePath(fullPath: string): string {
  const home = process.env.HOME || "";
  let p = fullPath;

  // Replace home with ~
  if (home && p.startsWith(home)) {
    p = `~${p.slice(home.length)}`;
  }

  // Split path into parts
  const parts = p.split("/").filter((part) => part.length > 0);

  // If path is short enough, return as is
  if (parts.length <= 3) {
    return p;
  }

  // Keep last 2 directories before the project name
  // Example: ~/A/B/C/D/E/project -> ~/D/E/project
  const lastParts = parts.slice(-3); // Last 3 parts (2 dirs + project name)
  return `~/${lastParts.join("/")}`;
}

function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 1) + "…";
}

async function getGitBranch(projectPath: string): Promise<string | undefined> {
  try {
    const { stdout } = await exec(`cd "${projectPath}" && git branch --show-current 2>/dev/null`);
    const branch = stdout.trim();
    return branch || undefined;
  } catch {
    return undefined;
  }
}

async function getTraeRecentPaths(): Promise<string[]> {
  try {
    const storagePath = path.join(
      process.env.HOME || "",
      "Library/Application Support/Trae/User/globalStorage/storage.json",
    );
    const content = await fs.readFile(storagePath, "utf-8");
    const data = JSON.parse(content);

    const folders = data?.backupWorkspaces?.folders || [];
    const paths: string[] = [];

    for (const folder of folders) {
      if (folder.folderUri && folder.folderUri.startsWith("file://")) {
        // Decode URI and remove file:// prefix
        const decodedPath = decodeURIComponent(folder.folderUri.replace("file://", ""));
        paths.push(decodedPath);
      }
    }

    return paths;
  } catch {
    // If reading storage.json fails, return empty array
    return [];
  }
}

async function openWithTrae(projectPath: string) {
  const prefs = getPreferenceValues<Preferences>();
  const traeAppPath = prefs.traeApp?.path || "/Applications/Trae.app";

  await exec(`open -a "${traeAppPath}" "${projectPath}"`);

  const recent = (await LocalStorage.getItem<string>("trae_recent_projects")) || "[]";
  let parsed: Project[] = [];
  try {
    parsed = JSON.parse(recent);
  } catch {
    parsed = [];
  }
  const existing = parsed.filter((p) => p.path !== projectPath);
  const gitBranch = await getGitBranch(projectPath);
  existing.unshift({ name: path.basename(projectPath), path: projectPath, mtimeMs: Date.now(), gitBranch });
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
    let traePaths: string[] = [];
    try {
      traePaths = await getTraeRecentPaths();
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

    // Fetch git branches for all projects
    const projectsWithBranches = await Promise.all(
      sorted.map(async (project) => ({
        ...project,
        gitBranch: await getGitBranch(project.path),
      })),
    );

    setItems(projectsWithBranches);
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
    }, 500);
    return () => clearInterval(id);
  }, []);

  return (
    <List isLoading={loading} searchBarPlaceholder="Search projects…">
      {items.map((p: Project) => (
        <List.Item
          key={p.path}
          title={path.basename(p.path)}
          subtitle={smartTruncatePath(p.path)}
          icon={Icon.Folder}
          accessories={[
            ...(p.gitBranch
              ? [
                  {
                    tag: { value: truncateText(p.gitBranch, 20), color: Color.Green },
                    tooltip: `Git Branch: ${p.gitBranch}`,
                  },
                ]
              : []),
            { date: new Date(p.mtimeMs), icon: { source: Icon.Clock, tintColor: Color.SecondaryText } },
          ]}
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
