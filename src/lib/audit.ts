import { prisma } from "@/lib/prisma"

export function logAudit(userId: string, action: string, entityId: string, detail?: object) {
  prisma.auditLog.create({ data: { userId, action, entityId, detail } }).catch(console.error)
}
