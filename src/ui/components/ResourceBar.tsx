import { useStore } from '@nanostores/preact';
import { $profile } from '@state/save';

export function ResourceBar() {
  const p = useStore($profile);
  return (
    <div class="resources">
      <span class="res" title="Слава">
        ✦ {p.glory}
      </span>
      <span class="res" title="Вкусняшки">
        🦴 {p.treats}
      </span>
    </div>
  );
}
