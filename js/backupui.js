// backupui.js — строка «Мои данные» в настройках ⚙: резервная копия файлом, восстановление с подтверждением
// и кнопкой «Вернуть как было» (перед восстановлением текущие данные откладываются — ничего не теряется).
import { exportAll, replaceAll, load, save, storageAvailable } from './storage.js';
import { makeBackup, parseBackup, backupFileName, describeSummary, summarize, UNDO_KEY } from './backup.js';
import { downloadFile, shareFile, canShare, pickFile } from './files.js';
import { toast, esc } from './ui.js';

let pending = null; // разобранная копия, ждёт подтверждения

const fmtDate = iso => { try { return new Date(iso).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }); } catch (e) { return ''; } };

export function backupSettingsHTML() {
  const undo = load(UNDO_KEY, null);
  const mine = summarize(exportAll([UNDO_KEY]));
  let h = `<div class="setrow" id="backup-row" style="grid-column:1/-1"><b>Мои данные</b><div style="flex:1;min-width:200px">
    <div class="note">Сейчас: ${describeSummary(mine)}.</div>
    <div class="row" style="margin:6px 0">
      <button type="button" class="btn sm" data-act="backup">⬇ Резервная копия</button>
      ${canShare() ? '<button type="button" class="btn g sm" data-act="backup-share">📤 Отправить</button>' : ''}
      <button type="button" class="btn g sm" data-act="restore">📂 Восстановить…</button>
    </div>`;
  if (pending) {
    h += `<div class="info" style="--c:var(--root)"><b>В файле:</b> ${esc(describeSummary(pending.summary))}${pending.backup.created ? ` (копия от ${esc(fmtDate(pending.backup.created))})` : ''}.<br>
      Заменить текущие данные этими? Текущие я отложу — их можно вернуть кнопкой «Вернуть как было».
      <div class="row"><button type="button" class="btn sm" data-act="restore-yes">Заменить</button><button type="button" class="btn g sm" data-act="restore-no">Отмена</button></div></div>`;
  }
  if (undo && undo.data) {
    h += `<div class="row"><button type="button" class="btn g sm" data-act="restore-undo">↩ Вернуть как было</button><span class="note">данные до восстановления${undo.at ? ` (${esc(fmtDate(undo.at))})` : ''}</span></div>`;
  }
  h += `<div class="note">Копия — обычный файл .json: перенеси его на другое устройство (телефон ↔ ноутбук) и нажми там «Восстановить».
    ${storageAvailable() ? '' : ' <span class="warn">Хранилище браузера недоступно: восстановленные данные проживут до перезагрузки.</span>'}</div></div></div>`;
  return h;
}

function backupText() { return JSON.stringify(makeBackup(exportAll([UNDO_KEY])), null, 1); }

export const backupActs = rerender => ({
  backup: () => { downloadFile(backupFileName(), backupText(), 'application/json;charset=utf-8'); toast('Копия сохранена в «Загрузки»'); },
  'backup-share': async () => { const r = await shareFile(backupFileName(), backupText(), { title: 'Гитарный круг — мои данные', type: 'application/json' }); if (r === 'downloaded') toast('Копия сохранена в «Загрузки»'); },
  restore: async () => {
    const f = await pickFile('.json,application/json');
    if (!f) return;
    if (f.error) { toast(f.error); return; }
    const p = parseBackup(f.text);
    if (!p.ok) { toast(p.error, 4000); return; }
    pending = p; rerender();
  },
  'restore-no': () => { pending = null; rerender(); },
  'restore-yes': () => {
    if (!pending) return;
    const before = exportAll([UNDO_KEY]);
    replaceAll(pending.backup.data, []);
    save(UNDO_KEY, { at: new Date().toISOString(), data: before });
    pending = null;
    toast('Данные восстановлены — перезапускаю');
    setTimeout(() => location.reload(), 600);
  },
  'restore-undo': () => {
    const u = load(UNDO_KEY, null);
    if (!u || !u.data) return;
    const now = exportAll([UNDO_KEY]);
    replaceAll(u.data, []);
    save(UNDO_KEY, { at: new Date().toISOString(), data: now }); // можно вернуть и обратно
    toast('Вернул как было — перезапускаю');
    setTimeout(() => location.reload(), 600);
  },
});
