import { Field, Input, Text } from '../ui';

export const digitsOnly = (value: string) => value.replace(/[^0-9]/g, '');

/**
 * The one field every step shares. Digits are enforced as they are typed rather
 * than reported back after a submit.
 */
export function EmployeeIdField({ value, onChange, autoFocus = false }: {
  value: string;
  onChange: (value: string) => void;
  autoFocus?: boolean;
}) {
  return (
    <Field label="직번">
      {(id) => (
        <Input
          id={id}
          name="employeeId"
          value={value}
          onChange={(event) => onChange(digitsOnly(event.target.value))}
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="username"
          spellCheck={false}
          placeholder="예: 20260001…"
          required
          autoFocus={autoFocus}
        />
      )}
    </Field>
  );
}

export function PasswordField({ label, value, onChange, autoComplete, hint, minLength, autoFocus = false }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: 'current-password' | 'new-password';
  hint?: string;
  minLength?: number;
  autoFocus?: boolean;
}) {
  return (
    <Field label={label} hint={hint}>
      {(id) => (
        <Input
          id={id}
          name={autoComplete === 'current-password' ? 'password' : 'newPassword'}
          type="password"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          autoComplete={autoComplete}
          minLength={minLength}
          required
          autoFocus={autoFocus}
        />
      )}
    </Field>
  );
}

/**
 * The two halves of setting a password.
 *
 * The mismatch is surfaced here, as it is typed, instead of waiting for the
 * submit to throw — the old flow let you fill both fields and press the button
 * before telling you they differed.
 */
export function NewPasswordFields({ password, confirmation, onPassword, onConfirmation }: {
  password: string;
  confirmation: string;
  onPassword: (value: string) => void;
  onConfirmation: (value: string) => void;
}) {
  const mismatch = confirmation.length > 0 && password !== confirmation;
  return (
    <>
      <PasswordField
        label="새 비밀번호"
        value={password}
        onChange={onPassword}
        autoComplete="new-password"
        minLength={8}
        hint="8자 이상, 직번과 다르게 정해 주세요."
      />
      <Field label="새 비밀번호 확인" error={mismatch ? '비밀번호가 서로 다릅니다.' : undefined}>
        {(id) => (
          <Input
            id={id}
            name="newPasswordConfirmation"
            type="password"
            value={confirmation}
            onChange={(event) => onConfirmation(event.target.value)}
            autoComplete="new-password"
            aria-invalid={mismatch || undefined}
            required
          />
        )}
      </Field>
    </>
  );
}

/** Keeps the number visible after the lookup, so nobody wonders which account they are fixing. */
export function IdentifiedAs({ employeeId }: { employeeId: string }) {
  return (
    <div className="auth-identified">
      <span>직번</span>
      <b>{employeeId}</b>
    </div>
  );
}

/** Where the recovery code is going, stated before the button that sends it. */
export function DeliveryNote({ maskedEmail }: { maskedEmail: string }) {
  return (
    <div className="auth-note">
      <span className="glyph" aria-hidden="true">✉</span>
      <div>
        <b>{maskedEmail}</b>
        <Text size="caption">이 주소로 6자리 인증번호를 보냅니다.</Text>
      </div>
    </div>
  );
}

export function Feedback({ notice, error }: { notice: string; error: string }) {
  if (error) return <p className="auth-message error" role="alert">{error}</p>;
  if (notice) return <p className="auth-message notice" role="status">{notice}</p>;
  return null;
}
