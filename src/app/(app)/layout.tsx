import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import Link from "next/link"
import { LayoutDashboard, FilePlus, LogOut, Shield } from "lucide-react"
import { handleSignOut } from "@/app/actions"
import { getTranslations, getLocale } from "next-intl/server"
import { SettingsMenu } from "@/components/SettingsMenu"
import { OngoingCasesButton } from "@/components/OngoingCasesButton"
import { TourManager } from "@/components/TourManager"
import { TourButton } from "@/components/TourButton"
import { OnboardingGate } from "@/components/OnboardingGate"
import { prisma } from "@/lib/prisma"

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session) redirect("/login")

  const userId = session.user?.id
  const user = userId ? await prisma.user.findUnique({ where: { id: userId }, select: { acceptedTermsAt: true } }) : null
  const needsOnboarding = !user?.acceptedTermsAt

  const t      = await getTranslations()
  const locale = await getLocale()

  return (
    <TourManager>
    <div className="min-h-screen flex flex-col bg-[#f0f0ef] dark:bg-[#111111]">
      <header className="no-print bg-white dark:bg-[#1c1c1c] border-b border-slate-200 dark:border-[#2e2e2e] sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 h-40 flex items-center justify-between">
          <Link href="/dashboard" className="flex items-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.webp" alt="LOSPOR" className="h-36 w-auto" />
          </Link>

          <nav className="hidden md:flex items-center gap-1">
            <Link href="/dashboard"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#2a2a2a] transition-colors">
              <LayoutDashboard className="h-4 w-4" />
              {t("nav.dashboard")}
            </Link>
            <span data-tour="nav-ongoing"><OngoingCasesButton /></span>
            {(session.user as any).role === "ADMIN" && (
              <Link href="/admin"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors">
                <Shield className="h-4 w-4" />
                {t("nav.admin")}
              </Link>
            )}
            <Link href="/cases/new" data-tour="nav-new-case"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#2a2a2a] transition-colors">
              <FilePlus className="h-4 w-4" />
              {t("nav.newCase")}
            </Link>
          </nav>

          <div className="flex items-center gap-3">
            <TourButton />
            <span data-tour="settings-menu">
              <SettingsMenu userName={session.user?.name} institutionName={session.user?.institutionName} currentLocale={locale} role={(session.user as any).role} lastLoginAt={(session.user as any).lastLoginAt} />
            </span>
            <form action={handleSignOut}>
              <button type="submit" title={t("nav.signOut")}
                className="p-2 rounded-lg text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#2a2a2a] transition-colors">
                <LogOut className="h-4 w-4" />
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-8">
        <OnboardingGate needsOnboarding={needsOnboarding}>
          {children}
        </OnboardingGate>
      </main>

      <footer className="no-print border-t border-slate-200 dark:border-[#2e2e2e] bg-white dark:bg-[#1c1c1c] py-4 text-center text-xs text-slate-400 dark:text-slate-500">
        {t("common.gdprFooter")}
        {" · "}
        <a href="/terms" className="hover:text-slate-600 dark:hover:text-slate-300 underline underline-offset-2 transition-colors">{t("nav.footerTerms")}</a>
        {" · "}
        <a href="/privacy" className="hover:text-slate-600 dark:hover:text-slate-300 underline underline-offset-2 transition-colors">{t("nav.footerPrivacy")}</a>
        {" · "}
        <a href="https://docs.lospor.org" target="_blank" rel="noopener noreferrer"
          className="hover:text-slate-600 dark:hover:text-slate-300 underline underline-offset-2 transition-colors">
          {t("nav.footerDocs")}
        </a>
        {" · "}
        <a href="https://github.com/kaloyandjunow-prog/lospor-app" target="_blank" rel="noopener noreferrer"
          className="hover:text-slate-600 dark:hover:text-slate-300 underline underline-offset-2 transition-colors">
          Open source
        </a>
        {" · "}
        <a href="https://github.com/kaloyandjunow-prog/lospor-app/blob/main/LICENSE" target="_blank" rel="noopener noreferrer"
          className="hover:text-slate-600 dark:hover:text-slate-300 underline underline-offset-2 transition-colors">
          AGPL-3.0
        </a>
        <span className="block mt-1 text-[10px] text-slate-300 dark:text-slate-600">
          {t("nav.footerDisclaimer")}
          {" "}
          {t("nav.footerCopyright")}
        </span>
      </footer>
    </div>
    </TourManager>
  )
}

