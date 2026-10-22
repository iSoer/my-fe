import { Button } from '@game/ui/components/Button';
import { fmtDate } from '@game/ui/lib/format';
import type { SaveConflict } from './sync';
import { tr } from '@game/i18n';

/** До старта игры: прогресс в облаке Telegram новее, чем на этом устройстве, — какой оставить? */
export function ConflictScreen({
  conflict,
  onPick,
}: {
  conflict: SaveConflict;
  onPick: (choice: 'local' | 'cloud') => void;
}) {
  const { local, cloud } = conflict;
  return (
    <div className="pawfield">
      <div className="screen center">
        <div className="card stack pop-in">
          <h2>{tr('Found progress from another device', 'Найден прогресс с другого устройства')}</h2>
          <p className="muted">
            {tr(
              `Cloud: ${fmtDate(cloud.updatedAt)}, fighters: ${cloud.army?.units.length ?? 0}, Glory: ${cloud.profile.glory}.`,
              `В облаке: ${fmtDate(cloud.updatedAt)}, бойцов: ${cloud.army?.units.length ?? 0}, Славы: ${cloud.profile.glory}.`,
            )}
          </p>
          <p className="muted">
            {tr(
              `This device: ${fmtDate(local.updatedAt)}, fighters: ${local.army?.units.length ?? 0}, Glory: ${local.profile.glory}.`,
              `Здесь: ${fmtDate(local.updatedAt)}, бойцов: ${local.army?.units.length ?? 0}, Славы: ${local.profile.glory}.`,
            )}
          </p>
          <Button primary icon="☁️" onClick={() => onPick('cloud')}>
            {tr('Load from cloud', 'Загрузить из облака')}
          </Button>
          <Button icon="📱" onClick={() => onPick('local')}>
            {tr('Keep this one', 'Оставить этот')}
          </Button>
        </div>
      </div>
    </div>
  );
}
