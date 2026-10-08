import { useStore } from '@nanostores/preact';
import { $profile } from '@state/save';
import { useCountUp } from '../lib/animate';

function Res({ icon, value, title }: { icon: string; value: number; title: string }) {
  const shown = useCountUp(value, 600);
  return (
    <span class={`res ${shown !== value ? 'ticking' : ''}`} title={title}>
      <span class="res-ico" aria-hidden="true">
        {icon}
      </span>
      <b key={value} class="res-val">
        {shown}
      </b>
    </span>
  );
}

export function ResourceBar() {
  const p = useStore($profile);
  return (
    <div class="resources">
      <Res icon="✦" value={p.glory} title="Слава" />
      <Res icon="🦴" value={p.treats} title="Вкусняшки" />
    </div>
  );
}
