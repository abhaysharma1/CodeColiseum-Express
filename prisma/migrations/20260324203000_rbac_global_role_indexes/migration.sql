ALTER TABLE "user"
ADD COLUMN IF NOT EXISTS "globalRoleId" TEXT;

CREATE INDEX IF NOT EXISTS "user_globalRoleId_idx" ON "user"("globalRoleId");
CREATE INDEX IF NOT EXISTS "GroupMember_roleId_idx" ON "GroupMember"("roleId");
CREATE INDEX IF NOT EXISTS "Role_scope_idx" ON "Role"("scope");
CREATE INDEX IF NOT EXISTS "RolePermission_permissionId_idx" ON "RolePermission"("permissionId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'user_globalRoleId_fkey'
  ) THEN
    ALTER TABLE "user"
    ADD CONSTRAINT "user_globalRoleId_fkey"
    FOREIGN KEY ("globalRoleId") REFERENCES "Role"("id")
    ON DELETE SET NULL
    ON UPDATE CASCADE;
  END IF;
END
$$;