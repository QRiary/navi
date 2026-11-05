import { useEffect } from 'react';
import { activeKeymap } from '../core/project/ops';
import { loadSpec } from '../core/keycodes/spec';
import { planWrite } from '../core/via/sync';
import { useDeviceStore } from '../store/deviceStore';
import { useProjectStore } from '../store/projectStore';
import { useSettingsStore } from '../store/settingsStore';
import { toast, toastError } from '../store/toastStore';
import { hardwareFacts } from './hardwareFacts';
import { t } from '../i18n';

/**
 * “Live write” (like in VIA): if it is on in the settings and the keyboard is connected,
 * every key and encoder change is written to it right away (with read-back verification).
 * Macros — only with an explicit write (the buffer is rewritten as a whole).
 */
export function useLiveWrite() {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let running = false;
    const unsubscribe = useProjectStore.subscribe((state, prev) => {
      if (state.project === prev.project || !state.project) return;
      if (!useSettingsStore.getState().settings.device.liveWrite) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(async () => {
        const device = useDeviceStore.getState();
        const project = useProjectStore.getState().project;
        if (running || device.status !== 'connected' || !device.snapshot || !project) return;
        if (project.device && (project.device.vid !== device.current?.vendorId || project.device.pid !== device.current?.productId)) return;
        const plan = planWrite({
          project,
          keymap: activeKeymap(project),
          snapshot: device.snapshot,
          spec: loadSpec(project.firmware.keycodeSpec),
          hardware: hardwareFacts(project),
          includeMacros: false,
        });
        if (!plan.ok || (plan.keys.length === 0 && plan.encoders.length === 0)) return;
        running = true;
        try {
          const res = await device.write(plan);
          if (!res.verified) toast(t('Live write: verification failed', 'Живая запись: проверка не совпала'), 'error');
        } catch (err) {
          toastError(t('Live write to the keyboard failed. Check it is connected; edits stay in the project.', 'Живая запись в клавиатуру не удалась. Проверьте подключение; правки остаются в проекте.'), err);
        } finally {
          running = false;
        }
      }, 200);
    });
    return () => {
      unsubscribe();
      if (timer) clearTimeout(timer);
    };
  }, []);
}
