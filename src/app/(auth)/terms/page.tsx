import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export const metadata = { title: "Terms of Service — LOSPOR" }

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 to-blue-50 dark:from-[#111] dark:to-[#1a1a2e] p-4 py-12">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="text-center">
          <Link href="/login">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.webp" alt="LOSPOR" className="h-16 w-auto mx-auto hover:opacity-80 transition-opacity" />
          </Link>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Terms of Service</CardTitle>
            <p className="text-xs text-slate-400 mt-1">Effective date: 1 May 2026 · Version 1.0</p>
          </CardHeader>
          <CardContent className="prose prose-sm dark:prose-invert max-w-none text-slate-700 dark:text-slate-300 space-y-4 text-sm leading-relaxed">

            <section>
              <h3 className="font-semibold text-slate-800 dark:text-slate-100 mb-1">1. What LOSPOR is for</h3>
              <p>LOSPOR is a personal anaesthetic case log for anaesthesiologists. It is designed for recording anonymised perioperative cases for the purposes of learning, professional development, portfolio building, and clinical audit.</p>
            </section>

            <section>
              <h3 className="font-semibold text-slate-800 dark:text-slate-100 mb-1">2. What you must not enter</h3>
              <p>By using LOSPOR you agree that you will <strong>not</strong> enter any of the following into any field:</p>
              <ul className="list-disc pl-4 space-y-1">
                <li>Patient names (first name, last name, or any combination)</li>
                <li>National identification numbers (e.g. Bulgarian EGN, NHS number, passport number)</li>
                <li>Hospital record numbers or file references</li>
                <li>Dates of birth</li>
                <li>Contact information (phone numbers, email addresses, home addresses)</li>
                <li>Any other information that could directly or indirectly identify a patient</li>
              </ul>
              <p className="text-amber-700 dark:text-amber-400 text-xs font-medium">LOSPOR is not a clinical record system. Your hospital&apos;s medical records system remains the authoritative source for patient data.</p>
            </section>

            <section>
              <h3 className="font-semibold text-slate-800 dark:text-slate-100 mb-1">3. Your account</h3>
              <p>Accounts are for individual use only. You are responsible for keeping your credentials secure. Accounts are subject to approval by a LOSPOR administrator before use.</p>
            </section>

            <section>
              <h3 className="font-semibold text-slate-800 dark:text-slate-100 mb-1">4. Medical disclaimer</h3>
              <p>LOSPOR is intended for perioperative documentation, research, and workflow support purposes only. It is <strong>not intended</strong> to replace clinical judgment, provide autonomous clinical decision-making, or serve as a certified medical device. The AI advisor feature is a supplementary educational tool — it does not constitute medical advice and must not be used as the sole basis for clinical decisions.</p>
            </section>

            <section>
              <h3 className="font-semibold text-slate-800 dark:text-slate-100 mb-1">5. Liability</h3>
              <p>LOSPOR is provided &quot;as is&quot; without warranty of any kind. The operator accepts no liability for clinical decisions made using or based on LOSPOR. You use the service at your own professional risk.</p>
            </section>

            <section>
              <h3 className="font-semibold text-slate-800 dark:text-slate-100 mb-1">6. Open source</h3>
              <p>LOSPOR is published under the <strong>AGPL-3.0</strong> licence. If you self-host a modified version, you must publish the source code of your modifications under the same licence. See the <a href="https://github.com/kaloyandjunow-prog/lospor-app/blob/main/LICENSE" className="text-blue-600 hover:underline" target="_blank" rel="noopener noreferrer">LICENSE file</a> for details.</p>
            </section>

            <section>
              <h3 className="font-semibold text-slate-800 dark:text-slate-100 mb-1">7. Changes</h3>
              <p>These terms may be updated. Continued use after a new version is posted constitutes acceptance. The current version and effective date are shown at the top of this page.</p>
            </section>

            <section>
              <h3 className="font-semibold text-slate-800 dark:text-slate-100 mb-1">8. Contact</h3>
              <p><a href="mailto:kaloyandjunow@gmail.com" className="text-blue-600 hover:underline">kaloyandjunow@gmail.com</a></p>
            </section>

          </CardContent>
        </Card>

        <p className="text-center text-xs text-slate-400 dark:text-slate-600">
          <Link href="/privacy" className="hover:underline">Privacy Policy</Link>
          {" · "}
          <Link href="/login" className="hover:underline">Back to login</Link>
        </p>
      </div>
    </div>
  )
}
