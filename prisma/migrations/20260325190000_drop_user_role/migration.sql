-- Safety check: ensure all users already have RBAC global roles before dropping legacy role.
DO $$
DECLARE
  missing_global_roles INTEGER;
BEGIN
  SELECT COUNT(*) INTO missing_global_roles
  FROM "user"
  WHERE "globalRoleId" IS NULL;

  IF missing_global_roles > 0 THEN
    RAISE EXCEPTION
      'Cannot drop user.role because % users have NULL globalRoleId. Backfill globalRoleId before applying this migration.',
      missing_global_roles;
  END IF;
END $$;

ALTER TABLE "user" DROP COLUMN "role";

DROP TYPE IF EXISTS "UserRole";
