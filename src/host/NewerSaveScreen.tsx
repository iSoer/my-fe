import { Button } from '@game/ui/components/Button';
import { tr } from '@game/i18n';

/**
 * До старта игры: сейв (здесь или в облаке) записан более новой версией игры. Эта версия его не читает и не
 * перезаписывает — нужно обновиться.
 */
export function NewerSaveScreen({ onReload }: { onReload: () => void }) {
  return (
    <div className="pawfield">
      <div className="screen center">
        <div className="card stack pop-in">
          <h2>{tr('A newer version of the game is needed', 'Нужна более новая версия игры')}</h2>
          <p className="muted">
            {tr(
              'Your progress was saved by a newer version of the game. This version cannot read it and will not touch it — update to continue.',
              'Прогресс сохранён более новой версией игры. Эта версия не может его прочитать и не будет его трогать — обновитесь, чтобы продолжить.',
            )}
          </p>
          <Button primary icon="🔄" onClick={onReload}>
            {tr('Update and reload', 'Обновить и перезагрузить')}
          </Button>
        </div>
      </div>
    </div>
  );
}
