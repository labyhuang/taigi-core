import type { PrismaClient } from '../generated/prisma/index.js'

export async function getUserPermissions(
  prisma: PrismaClient,
  userId: string,
): Promise<string[]> {
  const userRoles = await prisma.userRole.findMany({
    where: { userId },
    include: {
      role: {
        include: {
          permissions: {
            include: { permission: true },
          },
        },
      },
    },
  })

  const permissionSet = new Set<string>()
  for (const ur of userRoles) {
    for (const rp of ur.role.permissions) {
      permissionSet.add(rp.permission.action)
    }
  }

  return [...permissionSet]
}
