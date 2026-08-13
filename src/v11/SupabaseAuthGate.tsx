import { useEffect, useState } from "react";
import { api } from "../api";
import { supabase } from "../supabase";

type Props = { onSignedIn: (session: any) => void };

export default function SupabaseAuthGate({ onSignedIn }: Props) {
  const [mode, setMode] = useState<"login" | "register" | "forgot" | "reset">("login");
  const [form, setForm] = useState({ email: "", password: "", name: "", otp: "", newPassword: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [info, setInfo] = useState("");
  const [resetProvider, setResetProvider] = useState<"backend" | "supabase">("backend");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (!params.has("error") && !params.has("error_code") && !params.has("error_description")) return;
    params.delete("error");
    params.delete("error_code");
    params.delete("error_description");
    const query = params.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}`);
    setMode("forgot");
    setErr("That reset link is expired. Request a fresh 6-digit OTP below.");
  }, []);

  const submit = async () => {
    if (!supabase) { setErr("Cloud not configured. Contact your administrator."); return; }
    setBusy(true); setErr(""); setInfo("");
    try {
      if (mode === "forgot") {
        const email = form.email.trim().toLowerCase();
        if (!email) throw new Error("Enter your registered email address.");
        try {
          await api("/auth/password-reset/request", { method: "POST", body: JSON.stringify({ email }) });
          setResetProvider("backend");
        } catch (apiError: any) {
          const apiMessage = apiError.message || String(apiError);
          if (!apiMessage.includes("Cannot reach VTAB API")) throw apiError;
          const recoveryUrl = `${window.location.origin}${window.location.pathname}?workspace=1`;
          const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: recoveryUrl });
          if (error) throw error;
          setResetProvider("supabase");
        }
        setForm(p => ({ ...p, email }));
        setInfo("A 6-digit reset code was sent to your email.");
        setMode("reset");
      } else if (mode === "reset") {
        const email = form.email.trim().toLowerCase();
        const token = form.otp.trim();
        if (!email || !token || !form.newPassword) throw new Error("Enter email, 6-digit OTP and new password.");
        if (token.length !== 6) throw new Error("Enter the 6-digit OTP from your email.");
        if (form.newPassword.length < 6) throw new Error("Password must be at least 6 characters.");
        if (resetProvider === "backend") {
          await api("/auth/password-reset/confirm", { method: "POST", body: JSON.stringify({ email, otp: token, newPassword: form.newPassword }) });
          const { data, error } = await supabase.auth.signInWithPassword({ email, password: form.newPassword });
          if (error) throw error;
          if (data.session) localStorage.setItem('vtab_supabase_token', data.session.access_token);
          setInfo("Password reset successfully.");
          onSignedIn(data.session);
        } else {
          const { data, error } = await supabase.auth.verifyOtp({ email, token, type: "recovery" });
          if (error) throw error;
          const { error: updateError } = await supabase.auth.updateUser({ password: form.newPassword });
          if (updateError) throw updateError;
          if (data.session) localStorage.setItem('vtab_supabase_token', data.session.access_token);
          setInfo("Password reset successfully.");
          onSignedIn(data.session);
        }
      } else if (mode === "register") {
        const { data, error } = await supabase.auth.signUp({
          email: form.email,
          password: form.password,
          options: { data: { display_name: form.name } }
        });
        if (error) throw error;
        if (data.session) { localStorage.setItem('vtab_supabase_token', data.session.access_token); onSignedIn(data.session); }
        else setErr("Check your email for a confirmation link.");
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: form.email,
          password: form.password
        });
        if (error) throw error;
        if (data.session) localStorage.setItem('vtab_supabase_token', data.session.access_token);
        onSignedIn(data.session);
      }
    } catch (e: any) {
      const message = e.message || String(e);
      const recoveryEmailFailed = message.includes("Error sending recovery email") || message.includes("HTTP 500") || message.includes("HTTP 504") || message.includes("unexpected_failure");
      setErr(recoveryEmailFailed ? "Supabase could not send the OTP email. Fix Supabase SMTP/Brevo settings: verified sender email, correct Brevo SMTP login/key, port 587, and Reset Password template using {{ .Token }}." : message);
    } finally {
      setBusy(false);
    }
  };

  const f = (k: string) => (e: any) => setForm(p => ({ ...p, [k]: e.target.value }));
  const title = mode === "register" ? "Create a new account" : mode === "forgot" ? "Reset your password" : mode === "reset" ? "Enter reset OTP" : "Sign in to your workspace";
  const buttonText = busy ? (mode === "register" ? "Creating account…" : mode === "forgot" ? "Sending OTP…" : mode === "reset" ? "Resetting password…" : "Signing in…") : (mode === "register" ? "Create Account" : mode === "forgot" ? "Send 6-digit OTP" : mode === "reset" ? "Reset Password" : "Sign In");
  const disabled = busy || !form.email || (mode === "login" && !form.password) || (mode === "register" && !form.password) || (mode === "reset" && (!form.otp || !form.newPassword));

  return (
    <div className="authoringLogin">
      <div className="authoringLoginCard">
        <div className="brandMark">V</div>
        <div>
          <small>VTAB WORKSPACE</small>
          <h1>{title}</h1>
          <p>{mode === "forgot" || mode === "reset" ? "Use the 6-digit OTP sent to your registered email to reset your password." : "Access reports shared with you or create an account to get started."}</p>
        </div>
        {mode === "register" && (
          <label>Display Name<input autoFocus value={form.name} onChange={f("name")} placeholder="Your name" /></label>
        )}
        <label>Email<input autoFocus={mode === "login" || mode === "forgot"} type="email" value={form.email} onChange={f("email")} onKeyDown={e => e.key === "Enter" && submit()} /></label>
        {(mode === "login" || mode === "register") && <label>Password<input type="password" value={form.password} onChange={f("password")} onKeyDown={e => e.key === "Enter" && submit()} /></label>}
        {mode === "reset" && <label>6-digit OTP<input inputMode="numeric" maxLength={6} value={form.otp} onChange={e => setForm(p => ({ ...p, otp: e.target.value.replace(/\D/g, '').slice(0, 6) }))} onKeyDown={e => e.key === "Enter" && submit()} /></label>}
        {mode === "reset" && <label>New Password<input type="password" value={form.newPassword} onChange={f("newPassword")} onKeyDown={e => e.key === "Enter" && submit()} /></label>}
        {err && <div className="authoringLoginError">{err}</div>}
        {info && <div style={{ color: "#16a34a", fontSize: 12, marginBottom: 8 }}>{info}</div>}
        <button className="primary" onClick={submit} disabled={disabled}>
          {buttonText}
        </button>
        <div className="bootstrapHint">
          {mode === "login"
            ? <><span>Don&apos;t have an account?</span><button style={{background:"none",border:"none",color:"#2563eb",cursor:"pointer",padding:0,fontWeight:700}} onClick={() => { setErr(""); setInfo(""); setMode("register"); }}>Register here</button><button style={{background:"none",border:"none",color:"#2563eb",cursor:"pointer",padding:0,fontWeight:700,marginLeft:12}} onClick={() => { setErr(""); setInfo(""); setMode("forgot"); }}>Forgot password?</button></>
            : <><span>{mode === "register" ? "Already have an account?" : "Remember your password?"}</span><button style={{background:"none",border:"none",color:"#2563eb",cursor:"pointer",padding:0,fontWeight:700}} onClick={() => { setErr(""); setInfo(""); setMode("login"); }}>Sign in</button>{mode === "reset"&&<button style={{background:"none",border:"none",color:"#2563eb",cursor:"pointer",padding:0,fontWeight:700,marginLeft:12}} onClick={() => { setErr(""); setInfo(""); setMode("forgot"); }}>Resend OTP</button>}</>
          }
        </div>
      </div>
    </div>
  );
}
