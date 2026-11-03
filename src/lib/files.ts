/**
 * Files: save/open through the system dialog (desktop app)
 * or through download/file picker (browser).
 */
import { navi } from '../desktop/bridge';

export interface FileFilter {
  name: string;
  extensions: string[];
}

export async function saveTextFile(name: string, text: string, filters?: FileFilter[]): Promise<string | null> {
  if (navi) return navi.saveFile({ name, text, filters });
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return name;
}

export async function openTextFile(filters?: FileFilter[]): Promise<{ name: string; text: string } | null> {
  if (navi) return navi.openFile({ filters });
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = (filters ?? []).flatMap((f) => f.extensions.map((e) => `.${e}`)).join(',');
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      if (file.size > 20 * 1024 * 1024) return resolve(null);
      resolve({ name: file.name, text: await file.text() });
    };
    input.click();
  });
}

export const JSON_FILTERS: FileFilter[] = [{ name: 'JSON', extensions: ['json', 'jsonc'] }];
