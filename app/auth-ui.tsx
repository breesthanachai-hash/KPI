"use client";

import { useEffect, useId, useRef, useState } from "react";
import { MAX_NEW_PASSWORD_LENGTH, MIN_GENERAL_PASSWORD_LENGTH, passwordMeetsMinimum, passwordMinimumError } from "../lib/password-policy.js";

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
  const minimumError = passwordMinimumError(password);
  if (minimumError) return minimumError;
  if ([...password.normalize("NFC")].length > MAX_NEW_PASSWORD_LENGTH) return `รหัสผ่านใหม่ต้องไม่เกิน ${MAX_NEW_PASSWORD_LENGTH} ตัวอักษร`;
  if (password !== confirmation) return "รหัสผ่านทั้งสองช่องไม่ตรงกัน";
  return "";
}

function registrationPasswordValidation(password: string, confirmation: string) {
  if (!password.trim()) return "กรุณากรอกรหัสผ่าน";
  const minimumError = passwordMinimumError(password);
  if (minimumError) return minimumError;
  if ([...password.normalize("NFC")].length > MAX_NEW_PASSWORD_LENGTH) return `รหัสผ่านสำหรับสมัครสมาชิกต้องไม่เกิน ${MAX_NEW_PASSWORD_LENGTH} ตัวอักษร`;
  if (password !== confirmation) return "รหัสผ่านทั้งสองช่องไม่ตรงกัน";
  return "";
}

function PasswordControl({
  id,
  name,
  label,
  value,
  onChange,
  autoComplete,
  describedBy,
  required = true,
  autoFocus = false,
  minLength,
  maxLength = 128,
}: {
  id: string;
  name: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: "current-password" | "new-password";
  describedBy?: string;
  required?: boolean;
  autoFocus?: boolean;
  minLength?: number;
  maxLength?: number;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <label className="auth-field" htmlFor={id}>
      <span>{label}</span>
      <span className="auth-password-control">
        <input
          id={id}
          name={name}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-describedby={describedBy}
          required={required}
          minLength={minLength ?? (autoComplete === "new-password" ? MIN_GENERAL_PASSWORD_LENGTH : undefined)}
          maxLength={maxLength}
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
  const [authView, setAuthView] = useState<"login" | "register" | "submitted">("login");
  const [loginId, setLoginId] = useState(initialLoginId);
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [knownDisplayName, setKnownDisplayName] = useState(displayName);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [registration, setRegistration] = useState({ firstName: "", lastName: "", nickname: "", email: "", loginId: "", password: "", confirmation: "" });
  const errorRef = useRef<HTMLDivElement>(null);
  const loginPasswordId = useId();
  const newPasswordId = useId();
  const confirmationId = useId();
  const registrationPasswordId = useId();
  const registrationConfirmationId = useId();

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

  const submitRegistration = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    const validationError = registrationPasswordValidation(registration.password, registration.confirmation);
    if (validationError) {
      setError(validationError);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: registration.email.trim(),
          loginId: registration.loginId.trim(),
          password: registration.password,
          firstName: registration.firstName.trim(),
          lastName: registration.lastName.trim(),
          nickname: registration.nickname.trim(),
        }),
      });
      const body = await response.json().catch(() => ({})) as { submitted?: boolean; error?: string };
      if (response.status === 429) throw new Error(retryMessage(response).replace("เข้าสู่ระบบ", "สมัครสมาชิก"));
      if (!response.ok || !body.submitted) throw new Error(body.error || "ส่งคำขอสมัครสมาชิกไม่สำเร็จ กรุณาลองใหม่");
      setRegistration((current) => ({ ...current, password: "", confirmation: "" }));
      setAuthView("submitted");
    } catch (caught) {
      setRegistration((current) => ({ ...current, password: "", confirmation: "" }));
      setError(caught instanceof Error ? caught.message : "ส่งคำขอสมัครสมาชิกไม่สำเร็จ กรุณาลองใหม่");
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
        {mode === "login" && authView === "login" ? (
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
            <PasswordControl id={loginPasswordId} name="password" label="รหัสผ่าน" value={password} onChange={setPassword} autoComplete="current-password" />
            <button className="auth-primary" disabled={busy || !loginId.trim() || !password}>{busy ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบ"}</button>
            <p className="auth-help"><strong>ลืมรหัสผ่าน?</strong> ติดต่อ HR หรือผู้ดูแลระบบเพื่อขอรหัสชั่วคราวใหม่</p>
            <div className="auth-register-entry"><span>ยังไม่มีบัญชี?</span><button type="button" onClick={() => { setError(""); setAuthView("register"); }}>สมัครสมาชิกพนักงาน</button></div>
          </form>
        ) : mode === "login" && authView === "register" ? (
          <form className="auth-card auth-registration-card" onSubmit={submitRegistration} aria-busy={busy}>
            <header>
              <p>EMPLOYEE REGISTRATION</p>
              <h1 id="auth-title">สมัครสมาชิกพนักงาน</h1>
              <span>กรอกข้อมูลให้ครบ ผู้ดูแลระบบจะตรวจและผูกบัญชีกับโปรไฟล์พนักงานก่อนเปิดใช้งาน</span>
            </header>
            {error && <div ref={errorRef} className="auth-error" role="alert" tabIndex={-1}><b>!</b><span>{error}</span></div>}
            <div className="auth-registration-grid">
              <label className="auth-field" htmlFor="registration-first-name"><span>ชื่อจริง</span><input id="registration-first-name" name="given-name" autoComplete="given-name" maxLength={80} required value={registration.firstName} onChange={(event) => setRegistration((current) => ({ ...current, firstName: event.target.value }))} /></label>
              <label className="auth-field" htmlFor="registration-last-name"><span>นามสกุล</span><input id="registration-last-name" name="family-name" autoComplete="family-name" maxLength={80} required value={registration.lastName} onChange={(event) => setRegistration((current) => ({ ...current, lastName: event.target.value }))} /></label>
              <label className="auth-field" htmlFor="registration-nickname"><span>ชื่อเล่น</span><input id="registration-nickname" name="nickname" autoComplete="nickname" maxLength={40} required value={registration.nickname} onChange={(event) => setRegistration((current) => ({ ...current, nickname: event.target.value }))} /></label>
              <label className="auth-field" htmlFor="registration-email"><span>อีเมล</span><input id="registration-email" name="email" type="email" autoComplete="email" maxLength={254} required value={registration.email} onChange={(event) => setRegistration((current) => ({ ...current, email: event.target.value }))} /></label>
            </div>
            <label className="auth-field" htmlFor="registration-login-id"><span>รหัสผู้ใช้ (ID)</span><input id="registration-login-id" name="username" autoComplete="username" autoCapitalize="none" spellCheck={false} minLength={3} maxLength={64} required placeholder="เช่น EMP001 หรือ niran.k" value={registration.loginId} onChange={(event) => setRegistration((current) => ({ ...current, loginId: event.target.value }))} /><small>ใช้ a-z, 0-9, จุด ขีดกลาง หรือขีดล่าง และต้องไม่ซ้ำกับผู้อื่น</small></label>
            <PasswordControl id={registrationPasswordId} name="password" label="รหัสผ่าน" value={registration.password} onChange={(value) => setRegistration((current) => ({ ...current, password: value }))} autoComplete="new-password" describedBy="registration-password-rules" minLength={MIN_GENERAL_PASSWORD_LENGTH} maxLength={MAX_NEW_PASSWORD_LENGTH} />
            <PasswordControl id={registrationConfirmationId} name="confirmation" label="ยืนยันรหัสผ่าน" value={registration.confirmation} onChange={(value) => setRegistration((current) => ({ ...current, confirmation: value }))} autoComplete="new-password" describedBy="registration-password-rules" minLength={MIN_GENERAL_PASSWORD_LENGTH} maxLength={MAX_NEW_PASSWORD_LENGTH} />
            <div id="registration-password-rules" className="auth-password-rules"><b>ตั้งรหัสผ่านของคุณเอง</b><span className={passwordMeetsMinimum(registration.password) && [...registration.password.normalize("NFC")].length <= MAX_NEW_PASSWORD_LENGTH ? "passed" : ""}>ใช้ตัวอักษร ตัวเลข หรือสัญลักษณ์แบบใดก็ได้</span><span>ความยาว 6–15 ตัวอักษร และต้องกรอกให้ตรงกันทั้งสองช่อง</span></div>
            <div className="auth-registration-note"><b>หลังส่งคำขอ</b><span>บัญชียังเข้าใช้งานไม่ได้จนกว่าผู้ดูแลระบบจะตรวจสอบและอนุมัติ</span></div>
            <button className="auth-primary" disabled={busy || !registration.email.trim() || !registration.loginId.trim() || !registration.firstName.trim() || !registration.lastName.trim() || !registration.nickname.trim() || !registration.password || !registration.confirmation}>{busy ? "กำลังส่งคำขอ..." : "ส่งคำขอสมัครสมาชิก"}</button>
            <button className="auth-text-button" type="button" disabled={busy} onClick={() => { setError(""); setAuthView("login"); }}>กลับไปหน้าเข้าสู่ระบบ</button>
          </form>
        ) : mode === "login" && authView === "submitted" ? (
          <section className="auth-card auth-registration-success" role="status" aria-labelledby="auth-title">
            <span className="auth-success-icon" aria-hidden="true">✓</span>
            <header><p>REQUEST RECEIVED</p><h1 id="auth-title">ส่งคำขอสมัครสมาชิกแล้ว</h1><span>คำขอของ {registration.firstName} {registration.lastName} ถูกส่งให้ผู้ดูแลระบบตรวจสอบเรียบร้อย</span></header>
            <div className="auth-registration-note"><b>ขั้นตอนถัดไป</b><span>รอผู้ดูแลอนุมัติและผูกโปรไฟล์พนักงาน จากนั้นจึงใช้ ID และรหัสผ่านที่ตั้งไว้เข้าสู่ระบบได้</span></div>
            <button className="auth-primary" type="button" onClick={() => { setLoginId(registration.loginId); setAuthView("login"); }}>กลับไปหน้าเข้าสู่ระบบ</button>
          </section>
        ) : (
          <form className="auth-card auth-change-card" onSubmit={submitForcedPassword} aria-busy={busy}>
            <header>
              <p>ความปลอดภัยครั้งแรก</p>
              <h1 id="auth-title">ตั้งรหัสผ่านใหม่ก่อนเริ่มใช้งาน</h1>
              <span>รหัสที่ได้รับเป็นรหัสชั่วคราว ต้องเปลี่ยนก่อนเปิดข้อมูลพนักงาน</span>
            </header>
            {(knownDisplayName || loginId) && <div className="auth-identity"><span>{knownDisplayName.slice(0, 1) || "P"}</span><p><strong>{knownDisplayName || "ผู้ใช้งาน"}</strong><small>รหัสผู้ใช้ {loginId || "—"}</small></p></div>}
            {error && <div ref={errorRef} className="auth-error" role="alert" tabIndex={-1}><b>!</b><span>{error}</span></div>}
            <PasswordControl id={newPasswordId} name="newPassword" label="รหัสผ่านใหม่" value={newPassword} onChange={setNewPassword} autoComplete="new-password" describedBy="forced-password-rules" maxLength={MAX_NEW_PASSWORD_LENGTH} autoFocus />
            <PasswordControl id={confirmationId} name="confirmation" label="ยืนยันรหัสผ่านใหม่" value={confirmation} onChange={setConfirmation} autoComplete="new-password" describedBy="forced-password-rules" maxLength={MAX_NEW_PASSWORD_LENGTH} />
            <div id="forced-password-rules" className="auth-password-rules"><b>ตั้งรหัสที่จำง่าย</b><span className={passwordMeetsMinimum(newPassword) ? "passed" : ""}>อย่างน้อย 6 ตัวอักษร</span><span>ใช้ตัวอักษร ตัวเลข หรือสัญลักษณ์ได้ และไม่เกิน 15 ตัวอักษร</span></div>
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
          <PasswordControl id={currentId} name="currentPassword" label="รหัสผ่านปัจจุบัน" value={currentPassword} onChange={setCurrentPassword} autoComplete="current-password" />
          <PasswordControl id={nextId} name="newPassword" label="รหัสผ่านใหม่" value={newPassword} onChange={setNewPassword} autoComplete="new-password" describedBy="voluntary-password-rules" maxLength={MAX_NEW_PASSWORD_LENGTH} />
          <PasswordControl id={confirmId} name="confirmation" label="ยืนยันรหัสผ่านใหม่" value={confirmation} onChange={setConfirmation} autoComplete="new-password" describedBy="voluntary-password-rules" maxLength={MAX_NEW_PASSWORD_LENGTH} />
          <p id="voluntary-password-rules" className="auth-dialog-rules">รหัสผ่านต้องมี 6–15 ตัวอักษร ใช้ตัวอักษร ตัวเลข หรือสัญลักษณ์ได้</p>
        </div>
        <footer><button type="button" onClick={onClose} disabled={busy}>ยกเลิก</button><button className="primary" disabled={busy || !currentPassword || !newPassword || !confirmation}>{busy ? "กำลังบันทึก..." : "บันทึกรหัสผ่านใหม่"}</button></footer>
      </form>
    </div>
  );
}
