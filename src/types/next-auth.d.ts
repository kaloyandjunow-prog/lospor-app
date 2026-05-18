import type { DefaultSession } from "next-auth"

declare module "next-auth" {
  interface Session {
    user: {
      id: string
      role: string
      institutionId: string
      institutionName: string
      firstName: string
      lastName: string
      title: string
    } & DefaultSession["user"]
  }
}
