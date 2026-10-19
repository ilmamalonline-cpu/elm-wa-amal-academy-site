import {
  chmod,
  mkdir,
  readFile,
  rename,
  unlink,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { createSeedWorld, apply, view } from "./model";
import type {
  AcademyAction,
  AcademyActor,
  AcademyView,
  AcademyWorld,
} from "./types";

const base = join(tmpdir(), "elm-wa-amal-academy-synthetic");
const locks = new Map<string, Promise<void>>();
function safe(key: string) {
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(key)) throw new Error("invalid_store_key");
  return key;
}
async function directory() {
  await mkdir(base, { recursive: true, mode: 0o700 });
  await chmod(base, 0o700);
}
async function load(key: string): Promise<AcademyWorld> {
  try {
    return JSON.parse(
      await readFile(join(base, `${safe(key)}.json`), "utf8"),
    ) as AcademyWorld;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    return createSeedWorld();
  }
}
async function save(key: string, world: AcademyWorld) {
  await directory();
  const file = join(base, `${safe(key)}.json`);
  const temporary = join(base, `.${safe(key)}.${randomUUID()}.tmp`);
  try {
    await writeFile(temporary, JSON.stringify(world), {
      mode: 0o600,
      flag: "wx",
    });
    await rename(temporary, file);
  } finally {
    await unlink(temporary).catch((error) => {
      if (error.code !== "ENOENT") throw error;
    });
  }
}
async function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  safe(key);
  const previous = locks.get(key) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const chain = previous.then(() => gate);
  locks.set(key, chain);
  await previous;
  try {
    return await fn();
  } finally {
    release();
    if (locks.get(key) === chain) locks.delete(key);
  }
}
export async function transaction<T>(
  key: string,
  fn: (world: AcademyWorld) => Promise<T> | T,
): Promise<T> {
  return withLock(key, async () => {
    const world = await load(key);
    const result = await fn(world);
    await save(key, world);
    return result;
  });
}
export async function readView(
  key: string,
  actor: AcademyActor | null,
): Promise<AcademyView> {
  if (!actor) return view(createSeedWorld(), null);
  return transaction(key, (world) => view(world, actor));
}
export async function mutate(
  key: string,
  actor: AcademyActor,
  command: AcademyAction,
) {
  return transaction(key, (world) => {
    apply(world, actor, command);
    return view(world, actor);
  });
}
export async function resetWorld(key: string) {
  return transaction(key, (world) => {
    Object.assign(world, createSeedWorld());
    return view(world, null);
  });
}
export function storePathForTests(key: string) {
  return join(base, `${safe(key)}.json`);
}
export async function setSessionRole(key: string, role: string | null) {
  await withLock(key, async () => {
    await directory();
    const file = join(base, `.${safe(key)}.role`);
    if (role === null) {
      await unlink(file).catch((error) => {
        if (error.code !== "ENOENT") throw error;
      });
      return;
    }
    if (!["admin", "teacher", "guardian", "student"].includes(role))
      throw new Error("invalid_role");
    const temporary = `${file}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, role, { mode: 0o600, flag: "wx" });
      await rename(temporary, file);
    } finally {
      await unlink(temporary).catch((error) => {
        if (error.code !== "ENOENT") throw error;
      });
    }
  });
}
export async function getSessionRole(key: string): Promise<string | null> {
  return withLock(key, async () => {
    try {
      return (await readFile(join(base, `.${safe(key)}.role`), "utf8")).trim();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      return null;
    }
  });
}
