import {
	LEGACY_ROLE_FALLBACK_PERMISSIONS,
	PERMISSION_ALIASES,
	PERMISSIONS,
	type PermissionKey
} from "@/permissions/permission.constants";
import prisma from "@/utils/prisma";

const CACHE_TTL_SECONDS = 30;
const CACHE_TTL_MS = CACHE_TTL_SECONDS * 1000;

function isLegacyFallbackEnabled(): boolean {
	const flag = process.env.RBAC_ENABLE_LEGACY_FALLBACK;

	if (flag === undefined || flag === "") {
		return true;
	}

	return flag.toLowerCase() === "true";
}

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

async function hasGlobalPermission(userId: string, permissionKeys: string[]): Promise<{
	allowed: boolean;
	legacyRole: "TEACHER" | "STUDENT" | "ADMIN" | null;
}> {
	const user = await prisma.user.findUnique({
		where: { id: userId },
		select: {
			role: true,
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

	const legacyRole =
		user?.role === "TEACHER" || user?.role === "STUDENT" || user?.role === "ADMIN"
			? user.role
			: null;

	if (!user?.globalRole?.permissions?.length) {
		return { allowed: false, legacyRole };
	}

	return {
		allowed: hasRolePermission(permissionKeys, user.globalRole.permissions),
		legacyRole
	};
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

function hasLegacyFallbackPermission(
	legacyRole: "TEACHER" | "STUDENT" | "ADMIN" | null,
	canonicalPermission: string
): boolean {
	if (!isLegacyFallbackEnabled()) {
		return false;
	}

	if (!legacyRole) {
		return false;
	}

	const fallbackSet = LEGACY_ROLE_FALLBACK_PERMISSIONS[legacyRole];
	return fallbackSet.has(canonicalPermission as PermissionKey);
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
	const canonicalPermission = permissionKeys[0];

	const { allowed: hasGlobalAccess, legacyRole } = await hasGlobalPermission(userId, permissionKeys);

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

	const hasLegacyPermission = hasLegacyFallbackPermission(legacyRole, canonicalPermission);
	await permissionCache.set(cacheKey, hasLegacyPermission, CACHE_TTL_SECONDS);

	return hasLegacyPermission;
}

export async function clearPermissionCacheForUser(_userId: string): Promise<void> {
	// Cache invalidation is intentionally no-op for in-memory cache in this phase.
	// A keyed invalidation strategy will be added once role assignment APIs are introduced.
	return Promise.resolve();
}

export const PERMISSION_CACHE_TTL_MS = CACHE_TTL_MS;
