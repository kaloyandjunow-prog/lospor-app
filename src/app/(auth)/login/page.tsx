"use client"

import { useState, useEffect } from "react"
import { signIn } from "next-auth/react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import { useTranslations } from "next-intl"
import { useLocale } from "next-intl"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { LanguageSwitcher } from "@/components/LanguageSwitcher"
import { Sun, Moon } from "lucide-react"

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})
type FormData = z.infer<typeof schema>

export default function LoginPage() {
  const router  = useRouter()
  const t       = useTranslations()
  const locale  = useLocale()
  const [loading, setLoading] = useState(false)
  const [dark, setDark]       = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem("theme")
    const isDark = stored === "dark" || (!stored && window.matchMedia("(prefers-color-scheme: dark)").matches)
    setDark(isDark)
    document.documentElement.classList.toggle("dark", isDark)
  }, [])

  function toggleTheme() {
    const next = !dark
    setDark(next)
    document.documentElement.classList.toggle("dark", next)
    localStorage.setItem("theme", next ? "dark" : "light")
  }

  const { register, handleSubmit } = useForm<FormData>({
    resolver: zodResolver(schema) as any,
  })

  async function onSubmit(data: FormData) {
    setLoading(true)
    const result = await signIn("credentials", { email: data.email, password: data.password, redirect: false })
    setLoading(false)
    if (result?.error) { toast.error(t("auth.invalidCredentials")); return }
    router.push("/dashboard")
  }

  return (
    <div className="relative min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-100 to-blue-50 dark:from-[#111] dark:to-[#1a1a2e] p-4 overflow-hidden">
      {/* Watermark */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo.png" alt="" aria-hidden="true"
        className="pointer-events-none select-none absolute inset-0 m-auto w-[85vw] opacity-[0.05] dark:opacity-[0.04] grayscale" />
      <div className="relative w-full max-w-md space-y-6">
        <div className="flex flex-col items-center text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="LOSPOR" className="h-20 w-auto" />
          <p className="text-sm text-slate-500 mt-1">{t("common.appFullName")}</p>
          <div className="mt-3 flex items-center gap-2">
            <LanguageSwitcher currentLocale={locale} />
            <button type="button" onClick={toggleTheme}
              className="p-2 rounded-lg border border-slate-200 dark:border-[#3a3a3a] bg-white dark:bg-[#1c1c1c] text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-[#2a2a2a] transition-colors">
              {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{t("auth.signIn")}</CardTitle>
            <CardDescription>{t("auth.signInDesc")}</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div className="space-y-1">
                <Label>{t("auth.email")}</Label>
                <Input type="email" placeholder="you@hospital.bg" {...register("email")} />
              </div>
              <div className="space-y-1">
                <Label>{t("auth.password")}</Label>
                <Input type="password" {...register("password")} />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? t("auth.signingIn") : t("auth.signIn")}
              </Button>
            </form>

            <p className="text-center text-xs text-slate-400 mt-3 italic">
              {t("auth.forgotPassword")}
            </p>

            <p className="text-center text-sm text-slate-500 mt-3">
              {t("auth.noAccount")}{" "}
              <Link href="/register" className="text-blue-600 hover:underline font-medium">
                {t("auth.register")}
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
