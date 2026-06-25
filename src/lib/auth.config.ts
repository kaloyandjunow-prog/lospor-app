import type { NextAuthConfig } from "next-auth"
import { isRevoked } from "@/lib/token-blocklist"

export const authConfig: NextAuthConfig = {
  pages: { signIn: "/login" },
  session: { strategy: "jwt", maxAge: 8 * 60 * 60 },
  trustHost: true,
  providers: [],
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user
      const isPublicPage =
        nextUrl.pathname.startsWith("/privacy") ||
        nextUrl.pathname.startsWith("/terms")
      const isLoginPage =
        nextUrl.pathname.startsWith("/login") ||
        nextUrl.pathname.startsWith("/register")

      if (!isLoggedIn && !isLoginPage && !isPublicPage) return false
      if (isLoggedIn && isLoginPage) return Response.redirect(new URL("/dashboard", nextUrl))
      return true
    },
    jwt({ token, user }) {
      if (token.jti && isRevoked(token.jti as string)) {
        return { ...token, id: undefined, role: undefined }
      }
      if (user) {
        token.jti             = user.jti ?? token.jti
        token.id              = user.id
        token.role            = user.role
        token.institutionId   = user.institutionId
        token.institutionName = user.institutionName
        token.firstName       = user.firstName
        token.lastName        = user.lastName
        token.title           = user.title
        token.lastLoginAt     = user.lastLoginAt ?? null
      }
      return token
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id              = token.id ?? ""
        session.user.role            = token.role ?? ""
        session.user.institutionId   = token.institutionId ?? ""
        session.user.institutionName = token.institutionName ?? ""
        session.user.firstName       = token.firstName ?? ""
        session.user.lastName        = token.lastName ?? ""
        session.user.title           = token.title ?? ""
        session.user.jti             = token.jti
        session.user.lastLoginAt     = token.lastLoginAt ?? null
      }
      return session
    },
  },
}
