import type { Metadata } from "next"
import { Roboto, Geist_Mono } from "next/font/google"
import "./globals.css"
import { Toaster } from "@/components/ui/sonner"
import { NextIntlClientProvider } from "next-intl"
import { getLocale, getMessages } from "next-intl/server"
import { cookies } from "next/headers"

const roboto = Roboto({ variable: "--font-sans", subsets: ["latin", "cyrillic"], weight: ["300","400","500","700"] })
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] })

export const metadata: Metadata = {
  title: "LOSPOR — Large Open Source Perioperative Register",
  description: "Perioperative data collection and research platform",
  icons: { icon: "/logo.webp", apple: "/logo.webp" },
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale    = await getLocale()
  const messages  = await getMessages()
  const jar       = await cookies()
  const themeCookie = jar.get("theme")?.value
  const isDark      = themeCookie !== "light" // default to dark when no cookie set

  return (
    <html lang={locale} className={`${roboto.variable} ${geistMono.variable} h-full antialiased${isDark ? " dark" : ""}`} suppressHydrationWarning>
      <body className="min-h-full flex flex-col">
        <NextIntlClientProvider messages={messages}>
          {children}
          <Toaster richColors position="top-right" />
        </NextIntlClientProvider>
      </body>
    </html>
  )
}

