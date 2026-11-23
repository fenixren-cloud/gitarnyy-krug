// files.js — файлы на устройстве: скачать, открыть, поделиться (на Android — системное меню «Поделиться»:
// мессенджер, почта, Google Диск). Всё остаётся на устройстве, никуда не отправляется само.

// Имя файла без запрещённых символов
export const safeName = s => String(s || '').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60) || 'без названия';

export function downloadFile(name, data, type = 'text/plain;charset=utf-8') {
  const blob = data instanceof Blob ? data : new Blob([data], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; a.rel = 'noopener'; a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export const canShare = () => !!(navigator.share);

// Поделиться файлом; если браузер не умеет — поделиться текстом; если и этого нет — скачать.
export async function shareFile(name, text, { title = name, type = 'text/plain' } = {}) {
  try {
    const file = new File([text], name, { type });
    if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title }); return 'shared'; }
    if (navigator.share) { await navigator.share({ title, text }); return 'shared'; }
  } catch (e) {
    if (e && e.name === 'AbortError') return 'cancelled'; // закрыл меню «Поделиться»
  }
  downloadFile(name, text, type + ';charset=utf-8');
  return 'downloaded';
}

// Выбрать файл на устройстве. Возвращает { name, text } или null (отмена, слишком большой файл).
export function pickFile(accept, maxBytes = 5 * 1024 * 1024) {
  return new Promise(resolve => {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = accept; inp.style.display = 'none';
    const done = v => { inp.remove(); resolve(v); };
    inp.addEventListener('cancel', () => done(null));
    inp.addEventListener('change', async () => {
      const f = inp.files && inp.files[0];
      if (!f) return done(null);
      if (f.size > maxBytes) return done({ name: f.name, error: 'Файл слишком большой' });
      try { done({ name: f.name, text: await f.text() }); } catch (e) { done({ name: f.name, error: 'Не удалось прочитать файл' }); }
    });
    document.body.appendChild(inp);
    inp.click();
  });
}
