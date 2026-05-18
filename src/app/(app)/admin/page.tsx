"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Shield, Users, Clock, Check, X } from "lucide-react"

type UserRow = {
  id: string; email: string; name: string; firstName: string
  lastName: string; title: string; role: string; createdAt: string
  institution: { name: string; city: string }
}

type RoleRequest = {
  id: string; requestedAt: string
  user: { id: string; email: string; name: string; firstName: string; lastName: string; title: string; institution: { name: string; city: string } }
}

const ROLE_LABELS: Record<string, string> = {
  MEMBER: "Member", HEAD_OF_DEPT: "Head of Dept", ADMIN: "Admin",
  CLINICIAN: "Member (legacy)", RESEARCHER: "Member (legacy)",
}

export default function AdminPage() {
  const router = useRouter()
  const [users,    setUsers]    = useState<UserRow[]>([])
  const [requests, setRequests] = useState<RoleRequest[]>([])
  const [loading,  setLoading]  = useState(true)
  const [saving,   setSaving]   = useState<string | null>(null)
  const [acting,   setActing]   = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      fetch("/api/admin/users").then(r => r.status === 403 ? null : r.json()),
      fetch("/api/admin/role-requests").then(r => r.ok ? r.json() : []),
    ]).then(([users, reqs]) => {
      if (!users) { router.replace("/dashboard"); return }
      setUsers(users)
      setRequests(reqs ?? [])
      setLoading(false)
    })
  }, [router])

  async function changeRole(userId: string, role: string) {
    setSaving(userId)
    const res = await fetch(`/api/admin/users/${userId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    })
    setSaving(null)
    if (res.ok) setUsers(prev => prev.map(u => u.id === userId ? { ...u, role } : u))
  }

  async function handleRequest(id: string, action: "approve" | "reject") {
    setActing(id)
    const res = await fetch(`/api/admin/role-requests/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    })
    setActing(null)
    if (res.ok) {
      setRequests(prev => prev.filter(r => r.id !== id))
      if (action === "approve") {
        const req = requests.find(r => r.id === id)
        if (req) setUsers(prev => prev.map(u => u.id === req.user.id ? { ...u, role: "HEAD_OF_DEPT" } : u))
      }
    }
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Shield className="h-6 w-6 text-blue-600" />
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Admin Panel</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">Manage users and access levels</p>
        </div>
      </div>

      {/* Pending role requests */}
      <div className="bg-white dark:bg-[#1c1c1c] rounded-xl border border-amber-200 dark:border-amber-800 overflow-hidden">
        <div className="px-5 py-3 border-b border-amber-100 dark:border-amber-900/40 flex items-center gap-2 bg-amber-50 dark:bg-amber-900/10">
          <Clock className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          <span className="text-sm font-semibold text-amber-800 dark:text-amber-300">
            Head of Department requests {!loading && `(${requests.length})`}
          </span>
        </div>

        {loading ? (
          <div className="py-8 text-center text-slate-400 animate-pulse text-sm">Loading…</div>
        ) : requests.length === 0 ? (
          <div className="py-8 text-center text-slate-400 text-sm">No pending requests</div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-[#2a2a2a]">
            {requests.map(req => {
              const u = req.user
              const displayName = [u.title, u.firstName || u.name, u.lastName].filter(Boolean).join(" ")
              return (
                <div key={req.id} className="px-5 py-4 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-medium text-slate-800 dark:text-slate-100 text-sm">{displayName}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{u.email}</p>
                    <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                      {u.institution.name} — {u.institution.city}
                    </p>
                    <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                      Requested {new Date(req.requestedAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={() => handleRequest(req.id, "reject")} disabled={acting === req.id}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50 transition-colors">
                      <X className="h-3.5 w-3.5" /> Reject
                    </button>
                    <button onClick={() => handleRequest(req.id, "approve")} disabled={acting === req.id}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-green-600 hover:bg-green-700 text-white disabled:opacity-50 transition-colors">
                      <Check className="h-3.5 w-3.5" /> Approve
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* All users */}
      <div className="bg-white dark:bg-[#1c1c1c] rounded-xl border border-slate-200 dark:border-[#2a2a2a] overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100 dark:border-[#2a2a2a] flex items-center gap-2">
          <Users className="h-4 w-4 text-slate-400" />
          <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
            All users {!loading && `(${users.length})`}
          </span>
        </div>
        {loading ? (
          <div className="py-16 text-center text-slate-400 animate-pulse text-sm">Loading…</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-[#161616] text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                <tr>
                  {["Name", "Email", "Institution", "Role", "Joined"].map(h => (
                    <th key={h} className="px-4 py-3 text-left font-semibold">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-[#2a2a2a]">
                {users.map(u => (
                  <tr key={u.id} className="hover:bg-slate-50 dark:hover:bg-[#1a1a1a] transition-colors">
                    <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-100">
                      {[u.title, u.firstName || u.name, u.lastName].filter(Boolean).join(" ")}
                    </td>
                    <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{u.email}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                      {u.institution.name}
                      <span className="text-slate-400 ml-1 text-xs">({u.institution.city})</span>
                    </td>
                    <td className="px-4 py-3">
                      {u.role === "ADMIN" ? (
                        <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300">Admin</span>
                      ) : (
                        <select value={u.role === "CLINICIAN" || u.role === "RESEARCHER" ? "MEMBER" : u.role}
                          disabled={saving === u.id}
                          onChange={e => changeRole(u.id, e.target.value)}
                          className="text-xs rounded-lg border border-slate-200 dark:border-[#3a3a3a] bg-white dark:bg-[#2a2a2a] text-slate-700 dark:text-slate-300 px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50">
                          {["MEMBER", "HEAD_OF_DEPT"].map(r => (
                            <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                          ))}
                        </select>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-400 text-xs">
                      {new Date(u.createdAt).toLocaleDateString("en-GB")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="text-xs text-slate-400 dark:text-slate-500">
        <p><strong>Member</strong> — sees only their own cases.</p>
        <p><strong>Head of Dept</strong> — sees all cases within their institution.</p>
        <p><strong>Admin</strong> — sees all cases across all institutions. Admin status set directly in the database.</p>
      </div>
    </div>
  )
}
