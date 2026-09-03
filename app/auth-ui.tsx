"use client";

import { useEffect, useId, useRef, useState } from "react";

type AuthResponse = {
  authenticated?: boolean;
  mustChangePassword?: boolean;
  passwordChangeRequired?: boolean;
  displayName?: string;
  loginId?: string;
  error?: string;
};

type AuthScreenProps = {
  initialMode: "login" | "change";
  displayName?: string;
  loginId?: string;
  onAuthenticated: () => void;
};

function retryMessage(response: Response) {
  const retryAfterHeader = response.headers.get("retry-after")?.trim() ?? "";
  const retryAfterSeconds = Number(retryAfterHeader);
  const retryAfterDate = Date.parse(retryAfterHeader);
  const waitSeconds = Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
    ? retryAfterSeconds
    : Number.isFinite(retryAfterDate) ? Math.max(0, Math.ceil((retryAfterDate - Date.now()) / 1000)) : 0;
  if (waitSeconds > 0) {
    const minutes = Math.max(1, Math.ceil(waitSeconds / 60));
    return `ลองเข้าสู่ระบบหลายครั้งเกินไป กรุณารอประมาณ ${minutes} นาทีแล้วลองใหม่`;
  }
  return "ลองเข้าสู่ระบบหลายครั้งเกินไป กรุณารอสักครู่แล้วลองใหม่";
}

function passwordValidation(password: string, confirmation: string) {
  if (password.length < 15) return "รหัสผ่านใหม่ต้องมีอย่างน้อย 15 ตัวอักษร";
  if (password.length > 128) return "รหัสผ่านใหม่ต้องไม่เกิน 128 ตัวอักษร";
  if (password !== confirmation) return "รหัสผ่านทั้งสองช่องไม่ตรงกัน";
  return "";
}

function PasswordControl({
  id,
  label,
  value,
  onChange,
  autoComplete,
  describedBy,
  required = true,
  autoFocus = false,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: "current-password" | "new-password";
  describedBy?: string;
  required?: boolean;
  autoFocus?: boolean;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <label className="auth-field" htmlFor={id}>
      <span>{label}</span>
      <span className="auth-password-control">
        <input
          id={id}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-describedby={describedBy}
          required={required}
          minLength={autoComplete === "new-password" ? 15 : undefined}
          maxLength={128}
          autoFocus={autoFocus}
        />
        <button
          type="button"
          onClick={() => setVisible((current) => !current)}
          aria-label={`${visible ? "ซ่อน" : "แสดง"}${label}`}
          aria-pressed={visible}
        >
          {visible ? "ซ่อน" : "แสดง"}
        </button>
      </span>
    </label>
  );
}

export function AuthScreen({ initialMode, displayName = "", loginId: initialLoginId = "", onAuthenticated }: AuthScreenProps) {
  const [mode, setMode] = useState(initialMode);
  const [loginId, setLoginId] = useState(initialLoginId);
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [knownDisplayName, setKnownDisplayName] = useState(displayName);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const errorRef = useRef<HTMLDivElement>(null);
  const loginPasswordId = useId();
  const newPasswordId = useId();
  const confirmationId = useId();

  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  const submitLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ loginId: loginId.trim(), password }),
      });
      const body = await response.json().catch(() => ({})) as AuthResponse;
      if (response.status === 429) throw new Error(retryMessage(response));
      if (response.status === 428 || body.passwordChangeRequired) {
        setKnownDisplayName(body.displayName || loginId.trim());
        setLoginId(body.loginId || loginId.trim());
        setPassword("");
        setMode("change");
        return;
      }
      if (response.status === 401) throw new Error("รหัสผู้ใช้หรือรหัสผ่านไม่ถูกต้อง");
      if (response.status === 403) throw new Error("บัญชีนี้ยังใช้งานไม่ได้ กรุณาติดต่อ HR หรือผู้ดูแลระบบ");
      if (!response.ok) throw new Error("ระบบเข้าสู่ระบบยังไม่พร้อม กรุณาลองใหม่หรือติดต่อผู้ดูแลระบบ");
      if (body.mustChangePassword) {
        setKnownDisplayName(body.displayName || loginId.trim());
        setLoginId(body.loginId || loginId.trim());
        setPassword("");
        setMode("change");
        return;
      }
      if (!body.authenticated) throw new Error("ยังยืนยันการเข้าสู่ระบบไม่ได้ กรุณาลองใหม่");
      onAuthenticated();
    } catch (caught) {
      setPassword("");
      setError(caught instanceof Error ? caught.message : "ยังเข้าสู่ระบบไม่ได้ กรุณาลองใหม่");
    } finally {
      setBusy(false);
    }
  };

  const submitForcedPassword = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    const validationError = passwordValidation(newPassword, confirmation);
    if (validationError) {
      setError(validationError);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ newPassword }),
      });
      const body = await response.json().catch(() => ({})) as AuthResponse;
      if (response.status === 429) throw new Error(retryMessage(response));
      if (response.status === 401) {
        setMode("login");
        setNewPassword("");
        setConfirmation("");
        throw new Error("เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง");
      }
      if (!response.ok || body.authenticated === false) throw new Error(body.error || "เปลี่ยนรหัสผ่านไม่สำเร็จ กรุณาลองใหม่");
      onAuthenticated();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "เปลี่ยนรหัสผ่านไม่สำเร็จ กรุณาลองใหม่");
    } finally {
      setBusy(false);
    }
  };

  const exitForcedSession = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth/logout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ allDevices: false }),
      });
      const body = await response.json().catch(() => ({})) as { loggedOut?: boolean; error?: string };
      if (!response.ok || !body.loggedOut) throw new Error(body.error || "ออกจากเซสชันไม่สำเร็จ กรุณาลองใหม่");
      window.location.replace("/");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "ออกจากเซสชันไม่สำเร็จ กรุณาลองใหม่");
      setBusy(false);
    }
  };

  return (
    <main className="auth-page">
      <section className="auth-shell" aria-labelledby="auth-title">
        <div className="auth-brand" aria-hidden="true"><span><i /><i /><i /></span><strong>PEOPLE PULSE</strong></div>
        {mode === "login" ? (
          <form className="auth-card" onSubmit={submitLogin} aria-busy={busy}>
            <header>
              <p>พื้นที่ทำงานของทีม</p>
              <h1 id="auth-title">เข้าสู่ระบบ People Pulse</h1>
              <span>ใช้รหัสผู้ใช้และรหัสผ่านที่ HR หรือผู้ดูแลระบบมอบให้</span>
            </header>
            {error && <div ref={errorRef} className="auth-error" role="alert" tabIndex={-1}><b>!</b><span>{error}</span></div>}
            <label className="auth-field" htmlFor="people-pulse-login-id">
              <span>รหัสผู้ใช้</span>
              <input
                id="people-pulse-login-id"
                name="username"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                value={loginId}
                onChange={(event) => setLoginId(event.target.value)}
                placeholder="เช่น EMP001"
                maxLength={64}
                required
                autoFocus
              />
            </label>
            <PasswordControl id={loginPasswordId} label="รหัสผ่าน" value={password} onChange={setPassword} autoComplete="current-password" />
            <button className="auth-primary" disabled={busy || !loginId.trim() || !password}>{busy ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบ"}</button>
            <p className="auth-help"><strong>ลืมรหัสผ่าน?</strong> ติดต่อ HR หรือผู้ดูแลระบบเพื่อขอรหัสชั่วคราวใหม่</p>
          </form>
        ) : (
          <form className="auth-card auth-change-card" onSubmit={submitForcedPassword} aria-busy={busy}>
            <header>
              <p>ความปลอดภัยครั้งแรก</p>
              <h1 id="auth-title">ตั้งรหัสผ่านใหม่ก่อนเริ่มใช้งาน</h1>
              <span>รหัสที่ได้รับเป็นรหัสชั่วคราว ต้องเปลี่ยนก่อนเปิดข้อมูลพนักงาน</span>
            </header>
            {(knownDisplayName || loginId) && <div className="auth-identity"><span>{knownDisplayName.slice(0, 1) || "P"}</span><p><strong>{knownDisplayName || "ผู้ใช้งาน"}</strong><small>รหัสผู้ใช้ {loginId || "—"}</small></p></div>}
            {error && <div ref={errorRef} className="auth-error" role="alert" tabIndex={-1}><b>!</b><span>{error}</span></div>}
            <PasswordControl id={newPasswordId} label="รหัสผ่านใหม่" value={newPassword} onChange={setNewPassword} autoComplete="new-password" describedBy="forced-password-rules" autoFocus />
            <PasswordControl id={confirmationId} label="ยืนยันรหัสผ่านใหม่" value={confirmation} onChange={setConfirmation} autoComplete="new-password" describedBy="forced-password-rules" />
            <div id="forced-password-rules" className="auth-password-rules"><b>รหัสผ่านที่ปลอดภัย</b><span className={newPassword.length >= 15 ? "passed" : ""}>อย่างน้อย 15 ตัวอักษร และไม่เกิน 128 ตัว</span><span>ใช้วลีที่จำได้ แต่ผู้อื่นเดายาก</span></div>
            <button className="auth-primary" disabled={busy || !newPassword || !confirmation}>{busy ? "กำลังตั้งรหัสผ่าน..." : "ตั้งรหัสผ่านและเริ่มใช้งาน"}</button>
            <button className="auth-text-button" type="button" disabled={busy} onClick={() => void exitForcedSession()}>ออกจากเซสชันนี้</button>
          </form>
        )}
        <footer>ระบบจัดการงาน KPI สกิล และการเติบโตของ People Pulse</footer>
      </section>
    </main>
  );
}

export function ChangePasswordDialog({
  displayName,
  onClose,
  onSuccess,
}: {
  displayName: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const errorRef = useRef<HTMLDivElement>(null);
  const currentId = useId();
  const nextId = useId();
  const confirmId = useId();

  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    const validationError = passwordValidation(newPassword, confirmation);
    if (validationError) {
      setError(validationError);
      return;
    }
    if (currentPassword === newPassword) {
      setError("รหัสผ่านใหม่ต้องไม่ซ้ำกับรหัสผ่านปัจจุบัน");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const body = await response.json().catch(() => ({})) as AuthResponse;
      if (response.status === 429) throw new Error(retryMessage(response));
      if (!response.ok || body.authenticated === false) throw new Error(body.error || "เปลี่ยนรหัสผ่านไม่สำเร็จ กรุณาตรวจรหัสปัจจุบัน");
      onSuccess();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "เปลี่ยนรหัสผ่านไม่สำเร็จ กรุณาลองใหม่");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop auth-dialog-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && !busy && onClose()}>
      <form className="auth-password-dialog" role="dialog" aria-modal="true" aria-labelledby="change-password-title" onSubmit={submit} aria-busy={busy}>
        <header>
          <div><p>ACCOUNT SECURITY</p><h2 id="change-password-title">เปลี่ยนรหัสผ่าน</h2><span>{displayName}</span></div>
          <button type="button" onClick={onClose} disabled={busy} aria-label="ปิดหน้าต่างเปลี่ยนรหัสผ่าน">×</button>
        </header>
        <div className="auth-password-dialog-body">
          {error && <div ref={errorRef} className="auth-error" role="alert" tabIndex={-1}><b>!</b><span>{error}</span></div>}
          <PasswordControl id={currentId} label="รหัสผ่านปัจจุบัน" value={currentPassword} onChange={setCurrentPassword} autoComplete="current-password" />
          <PasswordControl id={nextId} label="รหัสผ่านใหม่" value={newPassword} onChange={setNewPassword} autoComplete="new-password" describedBy="voluntary-password-rules" />
          <PasswordControl id={confirmId} label="ยืนยันรหัสผ่านใหม่" value={confirmation} onChange={setConfirmation} autoComplete="new-password" describedBy="voluntary-password-rules" />
          <p id="voluntary-password-rules" className="auth-dialog-rules">ใช้รหัสผ่าน 15–128 ตัวอักษรที่จำได้และผู้อื่นเดายาก</p>
        </div>
        <footer><button type="button" onClick={onClose} disabled={busy}>ยกเลิก</button><button className="primary" disabled={busy || !currentPassword || !newPassword || !confirmation}>{busy ? "กำลังบันทึก..." : "บันทึกรหัสผ่านใหม่"}</button></footer>
      </form>
    </div>
  );
}
