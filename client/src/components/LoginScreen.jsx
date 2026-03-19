import { useState } from "react";
import { api } from "../api";
import { useTheme, font, mono } from "../theme";
import { Card, Input, PasswordInput, Button, ErrorBanner } from "./shared";

export const LoginScreen = ({ onLogin }) => {
  const T = useTheme();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    setError(""); setLoading(true);
    try {
      const data = await api.login(username, password);
      onLogin(data);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: T.bg, fontFamily: font }}>
      <style>{`@keyframes fadeIn { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } } input:focus { border-color: ${T.accent} !important; box-shadow: 0 0 0 2px ${T.accentDim}; outline: none; } button:hover:not(:disabled) { filter: brightness(1.15); }`}</style>
      <div style={{ animation: "fadeIn 0.4s ease-out", width: 380 }}>
        <div style={{ textAlign: "center", marginBottom: 36 }}>
          <span style={{ fontSize: 40, color: T.accent, display: "block", marginBottom: 8 }}>◈</span>
          <span style={{ fontSize: 22, fontWeight: 800, color: T.textBright }}>TestForge AI</span>
          <div style={{ fontSize: 10, fontFamily: mono, color: T.textMuted, marginTop: 6, textTransform: "uppercase", letterSpacing: "0.08em" }}>AI-Powered Test Creation Tool v1.2</div>
        </div>
        <Card glow style={{ padding: 28 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: T.textBright, marginBottom: 4 }}>Sign In</div>
          <div style={{ fontSize: 11, color: T.textMuted, marginBottom: 20 }}>Enter your credentials to access the Tool</div>
          <Input label="Username" value={username} onChange={setUsername} placeholder="Enter username" style={{ marginBottom: 14 }} />
          <PasswordInput label="Password" value={password} onChange={setPassword} placeholder="Enter password" onKeyDown={e => e.key === "Enter" && handleLogin()} style={{ marginBottom: 20 }} />
          <ErrorBanner msg={error} />
          <Button onClick={handleLogin} disabled={!username || !password || loading} style={{ width: "100%", justifyContent: "center" }}>{loading ? "Signing in..." : "Sign In"}</Button>
          <div style={{ marginTop: 16, fontSize: 10, color: T.textMuted, textAlign: "center", fontFamily: mono }}>UM-008: Account locks after 5 failed attempts</div>
        </Card>
      </div>
    </div>
  );
};

export const PasswordChangeScreen = ({ userId, userName, isOtp, onComplete }) => {
  const T = useTheme();
  const [newPass, setNewPass] = useState("");
  const [confirmPass, setConfirmPass] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    setError("");
    if (newPass.length < 4) { setError("Password must be at least 4 characters."); return; }
    if (newPass !== confirmPass) { setError("Passwords do not match."); return; }
    setLoading(true);
    try {
      const data = await api.changePassword(userId, newPass);
      onComplete(data.user);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: T.bg, fontFamily: font }}>
      <style>{`@keyframes fadeIn { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } } input:focus { border-color: ${T.accent} !important; box-shadow: 0 0 0 2px ${T.accentDim}; outline: none; } button:hover:not(:disabled) { filter: brightness(1.15); }`}</style>
      <div style={{ animation: "fadeIn 0.4s ease-out", width: 380 }}>
        <div style={{ textAlign: "center", marginBottom: 36 }}>
          <span style={{ fontSize: 40, color: T.accent, display: "block", marginBottom: 8 }}>◈</span>
          <span style={{ fontSize: 22, fontWeight: 800, color: T.textBright }}>TestForge AI</span>
        </div>
        <Card glow style={{ padding: 28 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: T.textBright, marginBottom: 4 }}>{isOtp ? "Create Your Password" : "Change Default Password"}</div>
          <div style={{ fontSize: 11, color: T.textMuted, marginBottom: 8 }}>Welcome, {userName}.</div>
          <div style={{ padding: "8px 12px", background: T.amberDim, borderRadius: 6, border: `1px solid ${T.amber}33`, fontSize: 11, color: T.amber, marginBottom: 20 }}>
            {isOtp ? "You signed in with a one-time password. Please create your own password to continue." : "This is your first login. Please change the default password to continue."}
          </div>
          <PasswordInput label="New Password" value={newPass} onChange={setNewPass} placeholder="Create a password" style={{ marginBottom: 14 }} />
          <PasswordInput label="Confirm Password" value={confirmPass} onChange={setConfirmPass} placeholder="Confirm password" onKeyDown={e => e.key === "Enter" && handleSubmit()} style={{ marginBottom: 20 }} />
          <ErrorBanner msg={error} />
          <Button onClick={handleSubmit} disabled={!newPass || !confirmPass || loading} style={{ width: "100%", justifyContent: "center" }}>{loading ? "Setting..." : "Set Password & Continue"}</Button>
        </Card>
      </div>
    </div>
  );
};
