import prisma from "./prisma"

export async function hasPermission(
  userId: string,
  groupId: string,
  permissionKey: string
) {
  const member = await prisma.groupMember.findUnique({
    where: {
      groupId_userId: { groupId, userId }
    },
    include: {
      role: {
        include: {
          permissions: {
            include: {
              permission: true
            }
          }
        }
      }
    }
  })

  if (!member || !member.role) return false

  return member.role.permissions.some(
    (rp) => rp.permission.key === permissionKey
  )
}
