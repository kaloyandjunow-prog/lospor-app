import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export const metadata = { title: "Privacy Policy — LOSPOR" }

export default function PrivacyPage() {
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
            <CardTitle>Privacy Policy</CardTitle>
            <p className="text-xs text-slate-400 mt-1">Effective date: 1 May 2026 · Version 1.0</p>
          </CardHeader>
          <CardContent className="prose prose-sm dark:prose-invert max-w-none text-slate-700 dark:text-slate-300 space-y-4 text-sm leading-relaxed">

            <section>
              <h3 className="font-semibold text-slate-800 dark:text-slate-100 mb-1">1. Who we are</h3>
              <p>LOSPOR is an independent tool operated by Kaloyan Dzhunov (contact: <a href="mailto:kaloyandjunow@gmail.com" className="text-blue-600 hover:underline">kaloyandjunow@gmail.com</a>).</p>
              <p>Each user is the <strong>sole data controller</strong> for the clinical records they enter. Kaloyan Dzhunov operates the infrastructure that stores that data. By using LOSPOR, you acknowledge that you are responsible for ensuring your use complies with applicable data protection law.</p>
            </section>

            <section>
              <h3 className="font-semibold text-slate-800 dark:text-slate-100 mb-1">2. What we process</h3>
              <ul className="list-disc pl-4 space-y-1">
                <li><strong>Account data:</strong> name, email address, title, institution, registration date, last login time, role, and terms acceptance records.</li>
                <li><strong>Case data:</strong> structured perioperative fields (demographics, diagnoses, procedures, anaesthesia technique, vitals, scores). No patient names, national ID numbers, dates of birth, or hospital record numbers are stored — these fields are prevented by design and server-side validation.</li>
                <li><strong>Audit log:</strong> records of case creation, update, deletion, AI advisor use, and account events. Retained for 12 months.</li>
                <li><strong>Session tokens:</strong> short-lived JWT tokens stored in a secure HTTP-only cookie. Revoked on logout.</li>
              </ul>
            </section>

            <section>
              <h3 className="font-semibold text-slate-800 dark:text-slate-100 mb-1">3. Legal basis</h3>
              <ul className="list-disc pl-4 space-y-1">
                <li><strong>Account data:</strong> legitimate interest in providing the service; explicit consent recorded at registration.</li>
                <li><strong>Case data:</strong> legitimate interest (personal learning log); you are the data controller of your own case records.</li>
              </ul>
            </section>

            <section>
              <h3 className="font-semibold text-slate-800 dark:text-slate-100 mb-1">4. Sub-processors</h3>
              <p>We use the following sub-processors, all with GDPR-compliant DPAs:</p>
              <ul className="list-disc pl-4 space-y-1">
                <li><strong>Supabase (EU region):</strong> PostgreSQL database hosting.</li>
                <li><strong>Vercel (EU region):</strong> application hosting and edge functions.</li>
                <li><strong>Mistral AI (EU — La Plateforme):</strong> AI pre-operative advisor inference. Only structured clinical fields are forwarded; free-text notes are never sent. AI advice is opt-in per case.</li>
              </ul>
            </section>

            <section>
              <h3 className="font-semibold text-slate-800 dark:text-slate-100 mb-1">5. Data retention</h3>
              <ul className="list-disc pl-4 space-y-1">
                <li>Case data: retained until you delete your account.</li>
                <li>Audit log: 12 months rolling retention.</li>
                <li>Deleted accounts: soft-deleted immediately on request, permanently deleted within 30 days.</li>
              </ul>
            </section>

            <section>
              <h3 className="font-semibold text-slate-800 dark:text-slate-100 mb-1">6. Your rights</h3>
              <ul className="list-disc pl-4 space-y-1">
                <li><strong>Access (Article 15):</strong> Download a complete JSON export of your account and cases from Settings → Privacy &amp; Data.</li>
                <li><strong>Deletion (Article 17):</strong> Delete your account from Settings → Privacy &amp; Data. All data is permanently removed within 30 days.</li>
                <li>For other requests, contact <a href="mailto:kaloyandjunow@gmail.com" className="text-blue-600 hover:underline">kaloyandjunow@gmail.com</a>.</li>
              </ul>
            </section>

            <section>
              <h3 className="font-semibold text-slate-800 dark:text-slate-100 mb-1">7. Security</h3>
              <p>Passwords are hashed with bcrypt (cost factor 12). Sessions use short-lived JWT tokens with a revocation mechanism. All traffic is encrypted over HTTPS. Free-text fields submitted via the API are checked server-side for common identifying patterns (EGN, long digit sequences, email addresses, date formats, capitalised name patterns).</p>
            </section>

          </CardContent>
        </Card>

        <p className="text-center text-xs text-slate-400 dark:text-slate-600">
          <Link href="/terms" className="hover:underline">Terms of Service</Link>
          {" · "}
          <Link href="/login" className="hover:underline">Back to login</Link>
        </p>
      </div>
    </div>
  )
}
