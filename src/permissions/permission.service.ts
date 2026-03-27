import {
	PERMISSION_ALIASES,
	PERMISSIONS,
	type PermissionKey
} from "@/permissions/permission.constants";
import prisma from "@/utils/prisma";

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
			expiresAt: Date.now() + ttlSeconds * 1000
		});
	}
}

let permissionCache: PermissionCacheProvider = new InMemoryPermissionCache();

export function setPermissionCacheProvider(cacheProvider: PermissionCacheProvider): void {
	permissionCache = cacheProvider;
}

function normalizePermission(permission: string): string {
	return permission.trim().toLowerCase();
}

function getPermissionLookupKeys(permission: string): string[] {
	const normalized = normalizePermission(permission);
	const canonicalEntries = Object.entries(PERMISSION_ALIASES) as Array<
		[PermissionKey, readonly string[]]
	>;

	const directCanonical = canonicalEntries.find(([canonical]) => canonical === normalized);
	if (directCanonical) {
		return [normalized, ...directCanonical[1]];
	}

	const aliasCanonical = canonicalEntries.find(([, aliases]) =>
		aliases.some((alias) => alias.toLowerCase() === normalized)
	);

	if (aliasCanonical) {
		return [aliasCanonical[0], ...aliasCanonical[1]];
	}

	return [normalized];
}

function getCacheKey(userId: string, permission: string, groupId?: string): string {
	return ["rbac", userId, groupId ?? "global", normalizePermission(permission)].join(":");
}

function hasRolePermission(permissionKeys: string[], rolePermissions: Array<{ permission: { key: string } }>): boolean {
	const allowedPermissionKeys = new Set(rolePermissions.map((rp) => rp.permission.key.toLowerCase()));
	return permissionKeys.some((key) => allowedPermissionKeys.has(key.toLowerCase()));
}

async function hasGlobalPermission(userId: string, permissionKeys: string[]): Promise<boolean> {
	const user = await prisma.user.findUnique({
		where: { id: userId },
		select: {
			globalRole: {
				select: {
					permissions: {
						include: {
							permission: {
								select: {
									key: true
								}
							}
						}
					}
				}
			}
		}
	});

	if (!user?.globalRole?.permissions?.length) {
		return false;
	}

	return hasRolePermission(permissionKeys, user.globalRole.permissions);
}

async function hasOrganizationPermission(): Promise<boolean> {
	// Reserved for department/organization-scoped assignment tables in future phases.
	return false;
}

async function hasGroupPermission(
	userId: string,
	groupId: string,
	permissionKeys: string[]
): Promise<boolean> {
	const member = await prisma.groupMember.findUnique({
		where: {
			groupId_userId: { groupId, userId }
		},
		select: {
			role: {
				select: {
					scope: true,
					permissions: {
						include: {
							permission: {
								select: {
									key: true
								}
							}
						}
					}
				}
			}
		}
	});

	if (!member?.role) {
		return false;
	}

	if (member.role.scope !== "GROUP") {
		return false;
	}

	return hasRolePermission(permissionKeys, member.role.permissions);
}

export type UserPermissionSnapshot = {
	userId: string;
	globalRoleId: string | null;
	globalPermissions: string[];
	groupPermissions: Record<string, string[]>;
};

export async function getUserPermissionSnapshot(userId: string): Promise<UserPermissionSnapshot> {
	const user = await prisma.user.findUnique({
		where: { id: userId },
		select: {
			globalRoleId: true,
			globalRole: {
				select: {
					permissions: {
						include: {
							permission: {
								select: { key: true }
							}
						}
					}
				}
			}
		}
	});

	const globalPermissions =
		user?.globalRole?.permissions?.map((rp) => rp.permission.key.toLowerCase()) ?? [];

	const membershipRoles = await prisma.groupMember.findMany({
		where: { userId },
		select: {
			groupId: true,
			role: {
				select: {
					scope: true,
					permissions: {
						include: {
							permission: {
								select: { key: true }
							}
						}
					}
				}
			}
		}
	});

	const groupPermissions: Record<string, string[]> = {};

	for (const member of membershipRoles) {
		if (!member.role || member.role.scope !== "GROUP") continue;

		const keys = member.role.permissions.map((rp) => rp.permission.key.toLowerCase());
		groupPermissions[member.groupId] = Array.from(new Set(keys));
	}

	return {
		userId,
		globalRoleId: user?.globalRoleId ?? null,
		globalPermissions: Array.from(new Set(globalPermissions)),
		groupPermissions
	};
}

export async function hasPermission(
	userId: string,
	permission: string,
	groupId?: string | null
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
		const hasGroupAccess = await hasGroupPermission(userId, groupId, permissionKeys);
		if (hasGroupAccess) {
			await permissionCache.set(cacheKey, true, CACHE_TTL_SECONDS);
			return true;
		}
	}

	await permissionCache.set(cacheKey, false, CACHE_TTL_SECONDS);
	return false;
}

export async function clearPermissionCacheForUser(_userId: string): Promise<void> {
	// Cache invalidation is intentionally no-op for in-memory cache in this phase.
	// A keyed invalidation strategy will be added once role assignment APIs are introduced.
	return Promise.resolve();
}

export const PERMISSION_CACHE_TTL_MS = CACHE_TTL_MS;
