import { apply, createSeedWorld, DOMAIN_ERRORS, view } from "./model";
import type { AcademyAction, AcademyActor, AcademyWorld, Role } from "./types";

/** Synthetic UI sandbox, NOT authentication or a security boundary.
 * No fetch, cookies, credentials, cloud state or real identities belong here.
 * sessionStorage is isolated by origin/tab and disappears when the tab closes.
 */
export const PREVIEW_KEY = "elm-wa-amal:browser-synthetic:v1";
const MAX_BYTES = 1_000_000;
const roles: readonly Role[] = ["guardian", "student", "teacher", "admin"];
interface Snapshot { version: 1; world: AcademyWorld; role: Role | null }
function actor(role: Role): AcademyActor {
  return {
    role,
    userId: role === "student" ? "adult-1" : `${role}-1`,
    ...(role === "student" ? { studentId: "adult-1" } : {}),
  };
}
function fresh(): Snapshot {
  return { version: 1, world: createSeedWorld(), role: null };
}
function read(storage: Pick<Storage, "getItem">): Snapshot {
  const text = storage.getItem(PREVIEW_KEY);
  if (!text) return fresh();
  if (text.length > MAX_BYTES) throw new Error("local_storage_unavailable");
  const data = JSON.parse(text) as Snapshot;
  if (!data || data.version !== 1 || (data.role !== null && !roles.includes(data.role)) || !data.world)
    throw new Error("local_storage_unavailable");
  const keys = Object.keys(createSeedWorld()) as (keyof AcademyWorld)[];
  if (Object.keys(data.world).sort().join() !== [...keys].sort().join() ||
      keys.some((key) => !Array.isArray(data.world[key]) || data.world[key].length > 1000 ||
        data.world[key].some((item) => !item || typeof item !== "object" || Array.isArray(item))))
    throw new Error("local_storage_unavailable");
  return data;
}
/** Synchronous read/validate/project/save: failed commands or quota errors never
 * partially persist. Tabs do not synchronize; there are no shared bookings.
 */
export function browserPreviewRequest(
  storage: Pick<Storage, "getItem" | "setItem" | "removeItem">,
  command?: AcademyAction,
): Response {
  try {
    const snapshot = command?.action === "reset" ? fresh() : read(storage);
    if (command) {
      if (command.action === "enter") {
        if (Object.keys(command).sort().join() !== "action,role" || !roles.includes(command.role))
          throw new Error("invalid_action_shape");
        snapshot.role = command.role;
      } else if (command.action === "logout" || command.action === "reset") {
        if (Object.keys(command).join() !== "action") throw new Error("invalid_action_shape");
        snapshot.role = null;
      } else {
        if (!snapshot.role) throw new Error("not_authenticated");
        apply(snapshot.world, actor(snapshot.role), command);
      }
    }
    const projection = view(snapshot.world, snapshot.role ? actor(snapshot.role) : null);
    if (command?.action === "reset") storage.removeItem(PREVIEW_KEY);
    else {
      const serialized = JSON.stringify(snapshot);
      if (serialized.length > MAX_BYTES) throw new Error("demo_capacity_reached");
      storage.setItem(PREVIEW_KEY, serialized);
    }
    return Response.json({ view: projection }, { headers: { Date: new Date().toUTCString() } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "local_storage_unavailable";
    // Only domain errors are UI-safe; never surface browser/storage internals.
    const safe = ["invalid_action_shape", "not_authenticated", "demo_capacity_reached"];
    return Response.json({ error: safe.includes(message) || DOMAIN_ERRORS.has(message) ? message : "local_storage_unavailable" }, { status: 400 });
  }
}
