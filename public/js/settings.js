// settings.js
// Settings page: password change + theme preference

'use strict';

/* ── Password strength scorer ─────────────────────────────────────── */
function scorePassword(pw) {
  if (!pw) return { score: 0, label: '' };
  let score = 0;
  if (pw.length >= 8)  score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  if (score <= 2) return { score, label: 'weak' };
  if (score <= 3) return { score, label: 'medium' };
  return { score, label: 'strong' };
}

/* ── Render ───────────────────────────────────────────────────── */
function renderSettingsPage(user) {
  return `
<div class="settings-page">
  <h2>settings</h2>
  <p class="settings-subtitle">manage your account preferences</p>

  <!-- ── Password ──────────────────────────────────────────── -->
  <div class="settings-card">
    <div class="settings-card-title">change password</div>
    <div class="settings-card-desc">choose a strong password with at least 8 characters.</div>
    <form id="settingsPwForm" novalidate>
      <div class="form-row">
        <label for="settingsCurrPw">current password</label>
        <input type="password" id="settingsCurrPw" name="currentPassword"
               placeholder="current password" autocomplete="current-password" required />
      </div>
      <div class="form-row">
        <label for="settingsNewPw">new password</label>
        <input type="password" id="settingsNewPw" name="newPassword"
               placeholder="new password (min. 8 chars)" autocomplete="new-password" required />
        <div class="pw-strength" aria-hidden="true">
          <div class="pw-strength-fill" id="pwStrengthFill"></div>
        </div>
      </div>
      <div class="form-row">
        <label for="settingsConfirmPw">confirm new password</label>
        <input type="password" id="settingsConfirmPw" name="confirmPassword"
               placeholder="confirm new password" autocomplete="new-password" required />
      </div>
      <div id="settingsPwError"   class="settings-error-msg"   style="display:none"></div>
      <div id="settingsPwSuccess" class="settings-success-msg" style="display:none"></div>
      <div class="settings-actions">
        <button type="submit" class="btn-primary" id="settingsPwBtn">update password</button>
      </div>
    </form>
  </div>

  <!-- ── Theme ────────────────────────────────────────────── -->
  <div class="settings-card">
    <div class="settings-card-title">design</div>
    <div class="settings-card-desc">choose how cumu looks. your preference is saved to your account.</div>
    <div class="theme-grid">
      <label class="theme-option">
        <input type="radio" name="cumuTheme" value="codec"
               ${ (user.theme || 'codec') === 'codec' ? 'checked' : '' } />
        <div class="theme-preview">
          <div class="theme-preview-swatch codec"></div>
          <div class="theme-preview-label">Codec</div>
          <div class="theme-preview-sub">monospace · dark accent</div>
        </div>
      </label>
      <label class="theme-option">
        <input type="radio" name="cumuTheme" value="standard"
               ${ (user.theme || 'codec') === 'standard' ? 'checked' : '' } />
        <div class="theme-preview">
          <div class="theme-preview-swatch standard"></div>
          <div class="theme-preview-label">Standard</div>
          <div class="theme-preview-sub">clean · modern icons</div>
        </div>
      </label>
    </div>
    <div id="settingsThemeError"   class="settings-error-msg"   style="display:none; margin-top:8px;"></div>
    <div id="settingsThemeSuccess" class="settings-success-msg" style="display:none; margin-top:8px;"></div>
  </div>
</div>`;
}

/* ── Bootstrap ─────────────────────────────────────────────────────────── */
async function initSettingsPage() {
  let user = {};
  try {
    const r = await fetch('/user/settings');
    if (r.ok) user = await r.json();
  } catch(_) {}

  document.getElementById('mainContent').innerHTML = renderSettingsPage(user);

  // ── Password form ──────────────────────────────────────────── //
  const pwForm       = document.getElementById('settingsPwForm');
  const newPwInput   = document.getElementById('settingsNewPw');
  const strengthFill = document.getElementById('pwStrengthFill');
  const pwError      = document.getElementById('settingsPwError');
  const pwSuccess    = document.getElementById('settingsPwSuccess');

  newPwInput.addEventListener('input', () => {
    const { label } = scorePassword(newPwInput.value);
    strengthFill.className = `pw-strength-fill${label ? ' ' + label : ''}`;
  });

  pwForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    pwError.style.display   = 'none';
    pwSuccess.style.display = 'none';

    const btn = document.getElementById('settingsPwBtn');
    btn.disabled = true;
    btn.textContent = 'saving…';

    const body = {
      currentPassword: document.getElementById('settingsCurrPw').value,
      newPassword:     newPwInput.value,
      confirmPassword: document.getElementById('settingsConfirmPw').value,
    };

    if (body.newPassword.length < 8) {
      showSettingsMsg(pwError, 'New password must be at least 8 characters.');
      btn.disabled = false; btn.textContent = 'update password';
      return;
    }
    if (body.newPassword !== body.confirmPassword) {
      showSettingsMsg(pwError, 'Passwords do not match.');
      btn.disabled = false; btn.textContent = 'update password';
      return;
    }

    try {
      const res  = await fetch('/user/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (res.ok) {
        showSettingsMsg(pwSuccess, data.message || 'Password updated.');
        pwForm.reset();
        strengthFill.className = 'pw-strength-fill';
      } else {
        showSettingsMsg(pwError, data.error || 'An error occurred.');
      }
    } catch(_) {
      showSettingsMsg(pwError, 'Network error. Please try again.');
    } finally {
      btn.disabled = false; btn.textContent = 'update password';
    }
  });

  // ── Theme radios ──────────────────────────────────────────── //
  const radios = document.querySelectorAll('input[name="cumuTheme"]');
  radios.forEach(radio => {
    radio.addEventListener('change', async () => {
      const theme = radio.value;
      const themeError   = document.getElementById('settingsThemeError');
      const themeSuccess = document.getElementById('settingsThemeSuccess');
      themeError.style.display = themeSuccess.style.display = 'none';

      applyTheme(theme);

      try {
        const res  = await fetch('/user/theme', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ theme }),
        });
        const data = await res.json();
        if (res.ok) {
          showSettingsMsg(themeSuccess, `Design switched to "${theme}".`);
        } else {
          showSettingsMsg(themeError, data.error || 'Could not save theme.');
          applyTheme(theme === 'codec' ? 'standard' : 'codec');
        }
      } catch(_) {
        showSettingsMsg(themeError, 'Network error.');
        applyTheme(theme === 'codec' ? 'standard' : 'codec');
      }
    });
  });
}

/* ── Helpers ────────────────────────────────────────────────────────── */
function showSettingsMsg(el, text) {
  el.textContent = text;
  el.style.display = 'block';
  setTimeout(() => { el.style.display = 'none'; }, 5000);
}

function applyTheme(theme) {
  if (theme === 'standard') {
    document.documentElement.setAttribute('data-theme', 'standard');
  } else {
    document.documentElement.removeAttribute('data-theme');
  }
  localStorage.setItem('cumu_theme', theme);
}
