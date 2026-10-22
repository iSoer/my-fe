import { Button } from '@game/ui/components/Button';
import { fmtDate } from '@game/ui/lib/format';
import type { SaveConflict } from './sync';

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
          <h2>Найден прогресс с другого устройства</h2>
          <p className="muted">
            {`В облаке: ${fmtDate(cloud.updatedAt)}, бойцов: ${cloud.army?.units.length ?? 0}, Славы: ${cloud.profile.glory}.`}
          </p>
          <p className="muted">
            {`Здесь: ${fmtDate(local.updatedAt)}, бойцов: ${local.army?.units.length ?? 0}, Славы: ${local.profile.glory}.`}
          </p>
          <Button primary icon="☁️" onClick={() => onPick('cloud')}>
            Загрузить из облака
          </Button>
          <Button icon="📱" onClick={() => onPick('local')}>
            Оставить этот
          </Button>
        </div>
      </div>
    </div>
  );
}
