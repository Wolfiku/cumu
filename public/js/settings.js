/**
 * public/js/settings.js
 * Settings View Controller — 3-Theme Switcher & Account Settings.
 * Uses CumuApi for OAuth2 authenticated REST calls.
 */

'use strict';

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

function renderSettingsPage(user) {
  const currentTheme = user.theme || 'coddy';

  return `
<div class="settings-page">
  <h1>settings</h1>
  <p class="mute caption" style="margin-bottom:24px">manage your account & application preferences</p>

  <!-- ── Design Theme Selector ────────────────────────────────────── -->
  <div class="settings-card">
    <div class="settings-card-title">design & theme</div>
    <div class="settings-card-desc">choose your preferred interface theme. themes change layout, typography, and icon sets independently.</div>

    <div class="theme-grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px;margin-top:16px">
      <!-- Klassik -->
      <label class="theme-option" style="cursor:pointer;border:2px solid ${currentTheme === 'klassik' ? 'var(--color-primary)' : 'var(--color-border)'};border-radius:var(--radius-md);padding:16px;background:var(--color-surface);display:block">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
          <input type="radio" name="cumuTheme" value="klassik" ${currentTheme === 'klassik' ? 'checked' : ''}>
          <strong>Klassik / Main</strong>
        </div>
        <div class="mute caption">schlicht · neutral · clean SVG stroke icons · Inter font</div>
      </label>

      <!-- Coddy -->
      <label class="theme-option" style="cursor:pointer;border:2px solid ${currentTheme === 'coddy' ? 'var(--color-primary)' : 'var(--color-border)'};border-radius:var(--radius-md);padding:16px;background:var(--color-surface);display:block">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
          <input type="radio" name="cumuTheme" value="coddy" ${currentTheme === 'coddy' ? 'checked' : ''}>
          <strong>Coddy (OpenCode TUI)</strong>
        </div>
        <div class="mute caption">terminal AI agent style · JetBrains Mono · ASCII glyphs · warm cream</div>
      </label>

      <!-- Material 3 -->
      <label class="theme-option" style="cursor:pointer;border:2px solid ${currentTheme === 'material3' ? 'var(--color-primary)' : 'var(--color-border)'};border-radius:var(--radius-md);padding:16px;background:var(--color-surface);display:block">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
          <input type="radio" name="cumuTheme" value="material3" ${currentTheme === 'material3' ? 'checked' : ''}>
          <strong>Material Design 3</strong>
        </div>
        <div class="mute caption">Google M3 · Roboto font · filled rounded icons · tonal elevation</div>
      </label>
    </div>

    <div id="settingsThemeError" class="error-msg hidden" style="margin-top:12px"></div>
    <div id="settingsThemeSuccess" class="settings-success-msg hidden" style="margin-top:12px"></div>
  </div>

  <!-- ── Password Change ─────────────────────────────────────────── -->
  <div class="settings-card" style="margin-top:24px">
    <div class="settings-card-title">change password</div>
    <div class="settings-card-desc">choose a strong password with at least 8 characters.</div>
    <form id="settingsPwForm" novalidate style="margin-top:16px">
      <div class="form-row">
        <label for="settingsCurrPw">current password</label>
        <input type="password" id="settingsCurrPw" name="currentPassword"
               placeholder="current password" autocomplete="current-password" required />
      </div>
      <div class="form-row">
        <label for="settingsNewPw">new password</label>
        <input type="password" id="settingsNewPw" name="newPassword"
               placeholder="new password (min. 8 chars)" autocomplete="new-password" required />
      </div>
      <div class="form-row">
        <label for="settingsConfirmPw">confirm new password</label>
        <input type="password" id="settingsConfirmPw" name="confirmPassword"
               placeholder="confirm new password" autocomplete="new-password" required />
      </div>
      <div id="settingsPwError" class="error-msg hidden" style="margin-top:8px"></div>
      <div id="settingsPwSuccess" class="settings-success-msg hidden" style="margin-top:8px"></div>
      <div style="margin-top:16px">
        <button type="submit" class="btn-primary" id="settingsPwBtn">update password</button>
      </div>
    </form>
  </div>
</div>`;
}

async function initSettingsPage() {
  const mainContent = document.getElementById('mainContent');
  if (!mainContent) return;

  let user = {};
  try {
    user = await CumuApi.get('/user/settings');
  } catch (_) {}

  mainContent.innerHTML = renderSettingsPage(user);

  // ── Password form ──────────────────────────────────────────────────
  const pwForm = document.getElementById('settingsPwForm');
  if (pwForm) {
    pwForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const pwError   = document.getElementById('settingsPwError');
      const pwSuccess = document.getElementById('settingsPwSuccess');
      pwError.classList.add('hidden');
      pwSuccess.classList.add('hidden');

      const btn = document.getElementById('settingsPwBtn');
      btn.disabled = true;
      btn.textContent = 'saving…';

      const body = {
        currentPassword: document.getElementById('settingsCurrPw').value,
        newPassword:     document.getElementById('settingsNewPw').value,
        confirmPassword: document.getElementById('settingsConfirmPw').value,
      };

      if (body.newPassword.length < 8) {
        showMsg(pwError, 'New password must be at least 8 characters.');
        btn.disabled = false; btn.textContent = 'update password';
        return;
      }
      if (body.newPassword !== body.confirmPassword) {
        showMsg(pwError, 'Passwords do not match.');
        btn.disabled = false; btn.textContent = 'update password';
        return;
      }

      try {
        const res = await CumuApi.post('/user/change-password', body);
        if (res.success) {
          showMsg(pwSuccess, res.message || 'Password updated successfully.');
          pwForm.reset();
        } else {
          showMsg(pwError, res.error || 'An error occurred.');
        }
      } catch (err) {
        showMsg(pwError, err.message || 'Network error.');
      } finally {
        btn.disabled = false; btn.textContent = 'update password';
      }
    });
  }

  // ── Theme Switcher ─────────────────────────────────────────────────
  const radios = document.querySelectorAll('input[name="cumuTheme"]');
  radios.forEach(radio => {
    radio.addEventListener('change', async () => {
      const theme = radio.value;
      const themeError   = document.getElementById('settingsThemeError');
      const themeSuccess = document.getElementById('settingsThemeSuccess');
      themeError.classList.add('hidden');
      themeSuccess.classList.add('hidden');

      if (window.applyTheme) window.applyTheme(theme);

      try {
        const res = await CumuApi.post('/user/theme', { theme });
        if (res.success) {
          showMsg(themeSuccess, `Theme switched to "${theme}".`);
        } else {
          showMsg(themeError, res.error || 'Could not save theme.');
        }
      } catch (err) {
        showMsg(themeError, err.message || 'Network error.');
      }
    });
  });
}

function showMsg(el, text) {
  if (!el) return;
  el.textContent = text;
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 5000);
}

window.initSettingsPage = initSettingsPage;
