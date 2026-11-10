/**
 * STORY-45: Featra's own Allow for this chat rule for Write and Edit decides on the real path (sent back by the user,
 * 2026-11-09). Real links in real temp folders, through the real approval desk and its real path resolver. Folder
 * links are junctions on Windows, which need no privileges; a file link needs them there, so that case is skipped
 * when the system refuses to make one.
 */
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isRecord, type ChatEvent } from "@featra/work-format";
import { createApprovalDesk } from "../src/approval-desk.ts";
import { tempFolder } from "./temp-folder.ts";

let outside: Awaited<ReturnType<typeof tempFolder>>;
let project: Awaited<ReturnType<typeof tempFolder>>;
let told: ChatEvent[];
let desk: ReturnType<typeof createApprovalDesk>;
let seq = 0;

/** A folder link: a junction on Windows (no privileges needed), a symlink elsewhere. */
const linkFolder = (target: string, path: string) => symlinkSync(target, path, "junction");

/** Whether this system lets a test make a file symlink (Windows needs Developer Mode or admin rights for one). */
function canLinkFiles(): boolean {
  const dir = mkdtempSync(join(tmpdir(), "featra-link-"));
  try {
    symlinkSync(join(dir, "target"), join(dir, "link"), "file");
    return true;
  } catch (error) {
    if (isRecord(error) && error.code === "EPERM") return false;
    throw error;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Asks the desk about a Write or Edit in the project; the event it tells the chat. */
function ask(name: "Write" | "Edit", file: string, cwd = project.dir) {
  const id = `t${++seq}`;
  void desk.approve(
    { chat: "c1", cwd, id, name, input: { file_path: file, content: "x" }, forChat: true },
    new AbortController().signal,
  );
  return told.findLast((e) => "id" in e && e.id === id);
}

beforeEach(async () => {
  outside = await tempFolder();
  project = await tempFolder();
  told = [];
  desk = createApprovalDesk((_chat, e) => told.push(e));
  writeFileSync(join(outside.dir, "secret.txt"), "x");
  mkdirSync(join(project.dir, "src"));
  mkdirSync(join(project.dir, ".git"));
  linkFolder(outside.dir, join(project.dir, "out"));
  linkFolder(join(project.dir, "src"), join(project.dir, "lib"));
  linkFolder(join(project.dir, ".git"), join(project.dir, "g"));
});

afterEach(async () => {
  desk.forget("c1");
  await project.dispose();
  await outside.dispose();
});

describe("a link inside the working folder that points outside it is not covered", () => {
  it("asks about a write through a folder link to outside, even after Allow for this chat on the folder", () => {
    expect(ask("Write", join(project.dir, "a.txt"))).toMatchObject({ type: "approval", forChat: true });
    desk.answer("c1", `t${seq}`, { choice: "allow-chat" });
    expect(ask("Write", join(project.dir, "src", "b.txt"))).toMatchObject({ type: "tool-allowed", scope: "chat" });

    expect(ask("Write", join(project.dir, "out", "new.txt"))).toMatchObject({ type: "approval", forChat: false });
    expect(ask("Write", join(project.dir, "out", "secret.txt"))).toMatchObject({ type: "approval", forChat: false });
    expect(ask("Write", join(project.dir, "out", "deeper", "new.txt"))).toMatchObject({
      type: "approval",
      forChat: false,
    });
    expect(ask("Write", "out/new.txt")).toMatchObject({ type: "approval", forChat: false });
  });

  // Skipped where this system needs privileges to make a file symlink (Windows without Developer Mode).
  it.skipIf(!canLinkFiles())("asks about an edit through a file link to outside", () => {
    const link = join(project.dir, "secret.txt");
    symlinkSync(join(outside.dir, "secret.txt"), link, "file");
    expect(ask("Edit", link)).toMatchObject({ type: "approval", forChat: false });
  });

  it("asks about a write through a link into .git", () => {
    expect(ask("Write", join(project.dir, "g", "config"))).toMatchObject({ type: "approval", forChat: false });
  });

  it("asks about a write through a link whose target is gone, since the write would recreate it", () => {
    const gone = join(outside.dir, "gone");
    mkdirSync(gone);
    linkFolder(gone, join(project.dir, "dangling"));
    rmSync(gone, { recursive: true });
    expect(ask("Write", join(project.dir, "dangling", "new.txt"))).toMatchObject({ type: "approval", forChat: false });
  });

  it("asks about a path with .. in it, which may climb out of a link differently than it reads", () => {
    expect(ask("Write", `${project.dir}/out/../a.txt`)).toMatchObject({ type: "approval", forChat: false });
  });
});

describe("a link that stays inside the working folder is still covered", () => {
  it("covers a write through a link to a folder in the project, and a new file under it", () => {
    expect(ask("Write", join(project.dir, "lib", "a.ts"))).toMatchObject({ type: "approval", forChat: true });
    expect(ask("Write", join(project.dir, "lib", "new", "deeper.ts"))).toMatchObject({
      type: "approval",
      forChat: true,
      covers: "Writes in this folder",
    });
  });

  it("covers a file in the project when the working folder is itself reached through a link", () => {
    const via = join(outside.dir, "project-link");
    linkFolder(project.dir, via);
    expect(ask("Edit", join(project.dir, "src", "a.ts"), via)).toMatchObject({ type: "approval", forChat: true });
    expect(ask("Edit", join(via, "src", "a.ts"), via)).toMatchObject({ type: "approval", forChat: true });
  });
});
