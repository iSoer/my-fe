import { tg } from './telegram';

export type HapticKind = 'select' | 'light' | 'medium' | 'heavy' | 'error' | 'success' | 'warning';

let enabled = true;
export function setHapticsEnabled(on: boolean): void {
  enabled = on;
}

export function haptic(kind: HapticKind): void {
  if (!enabled || !tg) return;
  try {
    switch (kind) {
      case 'select':
        tg.HapticFeedback.selectionChanged();
        break;
      case 'light':
      case 'medium':
      case 'heavy':
        tg.HapticFeedback.impactOccurred(kind);
        break;
      default:
        tg.HapticFeedback.notificationOccurred(kind);
    }
  } catch {
    /* ignore */
  }
}
