import {
  PERMISSION_ALIASES,
  type PermissionKey,
} from "@/permissions/permission.constants";
import {
  findGlobalRolePermissions,
  findGroupMemberRole,
  findMembershipRoles,
  findUserWithRolePermissions,
  type RoleWithPermissions,
} from "./permission.repository";

const CACHE_TTL_SECONDS = 30;
const CACHE_TTL_MS = CACHE_TTL_SECONDS * 1000;

type CacheEntry = {
  value: boolean;
  expiresAt: number;
};

export interface PermissionCacheProvider {
  get(key: string): Promise<boolean | null>;
  set(key: string, value: boolean, ttlSeconds: number): Promise<void>;
}

class InMemoryPermissionCache implements PermissionCacheProvider {
  private cache = new Map<string, CacheEntry>();

  async get(key: string): Promise<boolean | null> {
    const entry = this.cache.get(key);

    if (!entry) {
      return null;
    }

    if (entry.expiresAt <= Date.now()) {
      this.cache.delete(key);
      return null;
    }

    return entry.value;
  }

  async set(key: string, value: boolean, ttlSeconds: number): Promise<void> {
    this.cache.set(key, {
      value,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
  }
}

let permissionCache: PermissionCacheProvider = new InMemoryPermissionCache();

export function setPermissionCacheProvider(
  cacheProvider: PermissionCacheProvider,
): void {
  permissionCache = cacheProvider;
}

function normalizePermission(permission: string): string {
  return permission.trim().toLowerCase();
}

export function getPermissionLookupKeys(permission: string): string[] {
  const normalized = normalizePermission(permission);
  const canonicalEntries = Object.entries(PERMISSION_ALIASES) as Array<
    [PermissionKey, readonly string[]]
  >;

  const directCanonical = canonicalEntries.find(
    ([canonical]) => canonical === normalized,
  );
  if (directCanonical) {
    return [normalized, ...directCanonical[1]];
  }

  const aliasCanonical = canonicalEntries.find(([, aliases]) =>
    aliases.some((alias) => alias.toLowerCase() === normalized),
  );

  if (aliasCanonical) {
    return [aliasCanonical[0], ...aliasCanonical[1]];
  }

  return [normalized];
}

function getCacheKey(
  userId: string,
  permission: string,
  groupId?: string,
): string {
  return ["rbac", userId, groupId ?? "global", normalizePermission(permission)].join(
    ":",
  );
}

function hasRolePermission(
  permissionKeys: string[],
  role: RoleWithPermissions | null,
): boolean {
  if (!role?.permissions?.length) {
    return false;
  }

  const allowedPermissionKeys = new Set(
    role.permissions.map((rp) => rp.permission.key.toLowerCase()),
  );

  return permissionKeys.some((key) => allowedPermissionKeys.has(key.toLowerCase()));
}

async function hasGlobalPermission(
  userId: string,
  permissionKeys: string[],
): Promise<boolean> {
  const role = await findGlobalRolePermissions(userId);
  return hasRolePermission(permissionKeys, role);
}

async function hasOrganizationPermission(): Promise<boolean> {
  // Reserved for department/organization-scoped assignment tables.
  return false;
}

export async function hasGroupPermission(
  userId: string,
  groupId: string,
  permissionKeys: string[],
): Promise<boolean> {
  const role = await findGroupMemberRole(userId, groupId);

  if (!role || role.scope !== "GROUP") {
    return false;
  }

  return hasRolePermission(permissionKeys, role);
}

export type UserPermissionSnapshot = {
  userId: string;
  globalRoleId: string | null;
  globalPermissions: string[];
  groupPermissions: Record<string, string[]>;
};

export async function getUserPermissionSnapshot(
  userId: string,
): Promise<UserPermissionSnapshot> {
  const user = await findUserWithRolePermissions(userId);

  const globalPermissions =
    user?.globalRole?.permissions?.map((rp) =>
      rp.permission.key.toLowerCase(),
    ) ?? [];

  const membershipRoles = await findMembershipRoles(userId);

  const groupPermissions: Record<string, string[]> = {};

  for (const member of membershipRoles) {
    if (!member.role || member.role.scope !== "GROUP") continue;

    const keys = member.role.permissions.map((rp) =>
      rp.permission.key.toLowerCase(),
    );
    groupPermissions[member.groupId] = Array.from(new Set(keys));
  }

  return {
    userId,
    globalRoleId: user?.globalRoleId ?? null,
    globalPermissions: Array.from(new Set(globalPermissions)),
    groupPermissions,
  };
}

export async function hasPermission(
  userId: string,
  permission: string,
  groupId?: string | null,
): Promise<boolean> {
  const cacheKey = getCacheKey(userId, permission, groupId ?? undefined);
  const cachedValue = await permissionCache.get(cacheKey);

  if (cachedValue !== null) {
    return cachedValue;
  }

  const permissionKeys = getPermissionLookupKeys(permission);

  const hasGlobalAccess = await hasGlobalPermission(userId, permissionKeys);

  if (hasGlobalAccess) {
    await permissionCache.set(cacheKey, true, CACHE_TTL_SECONDS);
    return true;
  }

  const hasOrganizationAccess = await hasOrganizationPermission();
  if (hasOrganizationAccess) {
    await permissionCache.set(cacheKey, true, CACHE_TTL_SECONDS);
    return true;
  }

  if (groupId) {
    const hasGroupAccess = await hasGroupPermission(
      userId,
      groupId,
      permissionKeys,
    );
    if (hasGroupAccess) {
      await permissionCache.set(cacheKey, true, CACHE_TTL_SECONDS);
      return true;
    }
  }

  await permissionCache.set(cacheKey, false, CACHE_TTL_SECONDS);
  return false;
}

export async function clearPermissionCacheForUser(
  _userId: string,
): Promise<void> {
  // Keyed invalidation arrives with the role-assignment APIs.
  return Promise.resolve();
}

export const PERMISSION_CACHE_TTL_MS = CACHE_TTL_MS;
