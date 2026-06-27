import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { LosporBrand } from "@/components/LosporBrand"

export const metadata = { title: "Privacy Policy - LOSPOR" }

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 to-blue-50 dark:from-[#111] dark:to-[#1a1a2e] p-4 py-12">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="text-center">
          <LosporBrand compact linked />
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Privacy Policy</CardTitle>
            <p className="text-xs text-slate-400 mt-1">Effective date: 25 June 2026 - Version 3.1</p>
          </CardHeader>
          <CardContent className="prose prose-sm dark:prose-invert max-w-none text-slate-700 dark:text-slate-300 space-y-4 text-sm leading-relaxed">
            <section>
              <h3 className="font-semibold text-slate-800 dark:text-slate-100 mb-1">1. Who we are</h3>
              <p>LOSPOR is an independent tool operated by Kaloyan Dzhunov (contact: <a href="mailto:kaloyandjunow@gmail.com" className="text-blue-600 hover:underline">kaloyandjunow@gmail.com</a>).</p>
              <p>Each user is the sole data controller for the clinical records they enter. Kaloyan Dzhunov operates the infrastructure that stores that data. By using LOSPOR, you acknowledge that you are responsible for ensuring your use complies with applicable data protection law.</p>
            </section>

            <section>
              <h3 className="font-semibold text-slate-800 dark:text-slate-100 mb-1">2. What we process</h3>
              <ul className="list-disc pl-4 space-y-1">
                <li><strong>Account data:</strong> name, email address, title, institution, registration date, last login time, role, and terms acceptance records.</li>
                <li><strong>Case data:</strong> structured perioperative fields, normalized research rows, append-only intraoperative events, timestamps, institution linkage, and audit metadata. No patient names, national ID numbers, dates of birth, or hospital record numbers are intended to be stored.</li>
                <li><strong>Audit log:</strong> records of case creation, update, deletion, AI use, export, and account events.</li>
                <li><strong>Session tokens:</strong> short-lived web session cookies and mobile bearer tokens. Bearer tokens are revoked on logout.</li>
                <li><strong>PWA local data:</strong> browser localStorage may hold the bearer token, offline drafts, queued saves, and queued intraoperative events until logout or successful sync.</li>
              </ul>
            </section>

            <section>
              <h3 className="font-semibold text-slate-800 dark:text-slate-100 mb-1">3. Legal basis</h3>
              <ul className="list-disc pl-4 space-y-1">
                <li><strong>Account data:</strong> legitimate interest in providing the service; explicit consent recorded at registration.</li>
                <li><strong>Case data:</strong> legitimate interest for personal learning log, audit, and pseudonymised research datasets; you remain responsible for the records you enter.</li>
              </ul>
            </section>

            <section>
              <h3 className="font-semibold text-slate-800 dark:text-slate-100 mb-1">4. Sub-processors</h3>
              <ul className="list-disc pl-4 space-y-1">
                <li><strong>Supabase:</strong> PostgreSQL database hosting.</li>
                <li><strong>Vercel:</strong> application hosting and serverless functions.</li>
                <li><strong>Mistral AI:</strong> opt-in AI inference for lab report images, monitor images, and structured clinical advisor requests. Uploaded images are processed for extraction and should be cropped to remove identifiers before upload.</li>
              </ul>
            </section>

            <section>
              <h3 className="font-semibold text-slate-800 dark:text-slate-100 mb-1">5. Data retention</h3>
              <ul className="list-disc pl-4 space-y-1">
                <li>Case data is retained while your account is active and processed according to the applicable institutional or research retention policy after account deactivation.</li>
                <li>Audit logs are retained for security, integrity, and medico-legal traceability according to the retention policy.</li>
                <li>Deleted accounts are disabled immediately, the presented mobile token is revoked, and the account is marked as deleted. Further deletion or anonymisation is processed according to the retention policy.</li>
              </ul>
            </section>

            <section>
              <h3 className="font-semibold text-slate-800 dark:text-slate-100 mb-1">6. Your rights</h3>
              <ul className="list-disc pl-4 space-y-1">
                <li><strong>Access:</strong> download a JSON export of your account and cases from Settings - Privacy &amp; Data.</li>
                <li><strong>Deletion:</strong> delete your account from Settings - Privacy &amp; Data. Account access is disabled immediately. Further deletion or anonymisation requests can be sent to the contact address below.</li>
                <li>For other requests, contact <a href="mailto:kaloyandjunow@gmail.com" className="text-blue-600 hover:underline">kaloyandjunow@gmail.com</a>.</li>
              </ul>
            </section>

            <section>
              <h3 className="font-semibold text-slate-800 dark:text-slate-100 mb-1">7. Security</h3>
              <p>Passwords are hashed with bcrypt. Sessions use short-lived tokens with a revocation mechanism. All traffic is encrypted over HTTPS. Free-text fields submitted via the API are checked server-side for common identifying patterns. Controlled clinical vocabulary labels are allowlisted so valid clinical terms are not blocked. This detection is best-effort and does not guarantee that all personal identifiers are caught.</p>
            </section>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-slate-400 dark:text-slate-600">
          <Link href="/terms" className="hover:underline">Terms of Service</Link>
          {" - "}
          <Link href="/login" className="hover:underline">Back to login</Link>
        </p>
      </div>
    </div>
  )
}
