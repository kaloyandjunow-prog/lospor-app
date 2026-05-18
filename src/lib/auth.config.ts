import type { NextAuthConfig } from "next-auth"

export const authConfig: NextAuthConfig = {
  pages: { signIn: "/login" },
  session: { strategy: "jwt" },
  trustHost: true,
  providers: [],
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user
      const isAuthPage =
        nextUrl.pathname.startsWith("/login") ||
        nextUrl.pathname.startsWith("/register")

      if (!isLoggedIn && !isAuthPage) return false
      if (isLoggedIn && isAuthPage) return Response.redirect(new URL("/dashboard", nextUrl))
      return true
    },
    jwt({ token, user }) {
      if (user) {
        token.id            = user.id
        token.role          = (user as any).role
        token.institutionId = (user as any).institutionId
        token.institutionName = (user as any).institutionName
        token.firstName     = (user as any).firstName
        token.lastName      = (user as any).lastName
        token.title         = (user as any).title
      }
      return token
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id              = token.id as string
        session.user.role            = token.role as string
        session.user.institutionId   = token.institutionId as string
        session.user.institutionName = token.institutionName as string
        session.user.firstName       = token.firstName as string
        session.user.lastName        = token.lastName as string
        session.user.title           = token.title as string
      }
      return session
    },
  },
}
