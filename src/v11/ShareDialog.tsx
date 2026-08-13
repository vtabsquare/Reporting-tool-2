import { useEffect, useState } from "react";
import { supabase } from "../supabase";

type Role = "Viewer" | "Co-Owner";
type Grant = { email: string; role: Role; granted_at?: string };

type Props = {
  reportId: string;
  reportName: string;
  onClose: () => void;
  supabaseSession: any;
};

export default function ShareDialog({ reportId, reportName, onClose, supabaseSession }: Props) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("Viewer");
  const [grants, setGrants] = useState<Grant[]>([]);
  const [sharesBusy, setSharesBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [success, setSuccess] = useState("");
  
  // NEW: Workspaces state
  const [workspaces, setWorkspaces] = useState<any[]>([]);
  const [selectedWs, setSelectedWs] = useState<string>("");
  const [wsBusy, setWsBusy] = useState(false);

  const reportUrl = `${window.location.origin}/?workspace=1&report=${encodeURIComponent(reportId)}`;

  const loadShares = async () => {
    if (!supabase) return;
    setSharesBusy(true);
    try {
      const { data, error } = await supabase.rpc("list_report_shares", { p_report_id: reportId });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setGrants((data?.shares || []).filter((g: Grant) => g.role === "Viewer" || g.role === "Co-Owner"));
    } catch (e: any) {
      setErr(e.message || String(e));
    } finally {
      setSharesBusy(false);
    }
  };
  
  const loadWorkspaces = async () => {
    if (!supabaseSession?.access_token) return;
    try {
      const res = await fetch('/api/v1/cloud/workspaces', { headers: { 'Authorization': `Bearer ${supabaseSession.access_token}` } });
      if (res.ok) {
        const data = await res.json();
        // Only allow sharing to workspaces where user is Admin
        setWorkspaces(data.filter((w: any) => w.role === 'Admin'));
      }
    } catch (e) {}
  };

  useEffect(() => { loadShares(); loadWorkspaces(); }, [reportId]);

  const copyLink = async () => {
    try { await navigator.clipboard.writeText(reportUrl); setSuccess("Access link copied. Only signed-in registered users shared below can open it."); }
    catch { window.prompt("Copy access link for registered users", reportUrl); }
  };

  const shareEmail = async () => {
    const targetEmail = email.trim().toLowerCase();
    if (!targetEmail) return;
    setBusy(true); setErr(""); setSuccess("");
    try {
      if (!supabase) throw new Error("Supabase client is not configured.");
      const granterId = supabaseSession?.user?.id;
      if (!granterId) throw new Error("Please sign in again before sharing.");
      const { data, error } = await supabase.rpc("share_report_by_email", {
        p_report_id: reportId,
        p_target_email: targetEmail,
        p_role: role,
        p_granter_id: granterId
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const sharedEmail = data?.email || targetEmail;
      setGrants(g => [{ email: sharedEmail, role }, ...g.filter(x => x.email !== sharedEmail)]);
      setSuccess(`${sharedEmail} added as ${role}. They must sign in with this registered account to view the report.`);
      setEmail("");
      loadShares();
    } catch (e: any) {
      setErr(e.message || String(e));
    } finally {
      setBusy(false);
    }
  };
  
  const shareToWorkspace = async () => {
    if (!selectedWs) return;
    setWsBusy(true); setErr(""); setSuccess("");
    try {
      const res = await fetch(`/api/v1/cloud/workspaces/${selectedWs}/reports`, {
        method: 'POST', headers: { 'Authorization': `Bearer ${supabaseSession?.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ report_id: reportId })
      });
      const data = await res.json();
      if (res.ok) {
        setSuccess(`Report successfully shared to the workspace!`);
      } else {
        throw new Error(data.detail || 'Failed to share report to workspace');
      }
    } catch (e: any) {
      setErr(e.message || String(e));
    } finally {
      setWsBusy(false);
    }
  };

  return (
    <div className="modalShade" onMouseDown={onClose}>
      <div className="modalCard" style={{ maxWidth: 480 }} onMouseDown={e => e.stopPropagation()}>
        <div className="modalHead">
          <div>
            <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: ".12em", color: "#2563eb" }}>SHARE REPORT</span>
            <h3 style={{ margin: "4px 0 0" }}>{reportName}</h3>
          </div>
          <button onClick={onClose}>×</button>
        </div>

        <p style={{ color: "#475569", fontSize: 13, margin: "8px 0 16px" }}>
          Share this report only with registered workspace users. The recipient must sign in with the shared email address before the report opens.
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 8, alignItems: "center", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 9, padding: 10, marginBottom: 12 }}>
          <code style={{ color: "#334155", fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{reportUrl}</code>
          <button onClick={copyLink} style={{ border: "1px solid #cbd5e1", borderRadius: 8, background: "#fff", padding: "7px 10px", fontWeight: 700, color: "#334155" }}>Copy Access Link</button>
          <button onClick={() => window.open(reportUrl, "_blank")} style={{ border: "1px solid #bfdbfe", borderRadius: 8, background: "#eff6ff", padding: "7px 10px", fontWeight: 700, color: "#1d4ed8" }}>Open</button>
        </div>

        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <input
            style={{ flex: 1, minHeight: 38, border: "1px solid #cbd5e1", borderRadius: 8, padding: "0 10px", fontSize: 13 }}
            placeholder="Registered user email address"
            value={email}
            onChange={e => setEmail(e.target.value)}
            onKeyDown={e => e.key === "Enter" && shareEmail()}
          />
          <select
            style={{ border: "1px solid #cbd5e1", borderRadius: 8, padding: "0 8px", fontSize: 12, fontWeight: 700 }}
            value={role}
            onChange={e => setRole(e.target.value as Role)}
          >
            <option value="Viewer">Viewer</option>
            <option value="Co-Owner">Co-Owner</option>
          </select>
          <button className="primary" onClick={shareEmail} disabled={busy || !email.trim()} style={{ whiteSpace: "nowrap" }}>
            {busy ? "Sharing…" : "Share"}
          </button>
        </div>
        
        {workspaces.length > 0 && (
          <div style={{ display: "flex", gap: 8, marginBottom: 12, alignItems: 'center', background: '#f0fdf4', padding: 8, borderRadius: 8, border: '1px solid #bbf7d0' }}>
            <span style={{fontSize: 18}}>🏢</span>
            <select
              style={{ flex: 1, border: "1px solid #cbd5e1", borderRadius: 8, padding: "8px 10px", fontSize: 13 }}
              value={selectedWs}
              onChange={e => setSelectedWs(e.target.value)}
            >
              <option value="">Share directly to Team Workspace...</option>
              {workspaces.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
            <button className="primary" onClick={shareToWorkspace} disabled={wsBusy || !selectedWs} style={{ whiteSpace: "nowrap", background: '#16a34a' }}>
              {wsBusy ? "Sharing…" : "Share"}
            </button>
          </div>
        )}

        {err && <div style={{ color: "#dc2626", fontSize: 12, marginBottom: 8 }}>{err}</div>}
        {success && <div style={{ color: "#16a34a", fontSize: 12, marginBottom: 8 }}>✓ {success}</div>}

        <div style={{ borderTop: "1px solid #e2e8f0", paddingTop: 12 }}>
          <small style={{ color: "#64748b", fontWeight: 700, fontSize: 10, letterSpacing: ".08em" }}>CURRENTLY SHARED WITH</small>
          {sharesBusy && <div style={{ color: "#64748b", fontSize: 12, padding: "8px 0" }}>Loading shared users…</div>}
          {!sharesBusy && grants.length === 0 && <div style={{ color: "#64748b", fontSize: 12, padding: "8px 0" }}>No other users have access yet.</div>}
          {!sharesBusy && grants.map((g, i) => (
            <div key={`${g.email}-${i}`} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", fontSize: 13 }}>
              <span>{g.email}</span>
              <span style={{
                fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 999,
                background: g.role === "Co-Owner" ? "#ede9fe" : "#dbeafe",
                color: g.role === "Co-Owner" ? "#6d28d9" : "#1d4ed8"
              }}>{g.role}</span>
            </div>
          ))}
        </div>

        <div style={{ borderTop: "1px solid #e2e8f0", paddingTop: 12, marginTop: 8, background: "#f8fafc", borderRadius: 8, padding: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#334155", marginBottom: 6 }}>Role Permissions</div>
          <div style={{ fontSize: 11, color: "#64748b", lineHeight: 1.6 }}>
            <b style={{ color: "#1d4ed8" }}>Viewer</b> — Can view and interact with charts. Cannot share.<br />
            <b style={{ color: "#6d28d9" }}>Co-Owner</b> — Can view charts, copy links and share this report with other registered users.
          </div>
        </div>
      </div>
    </div>
  );
}
