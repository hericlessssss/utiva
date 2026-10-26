import { useState } from 'react';
import { type ItemEntry, type SpriteCategory, spriteUrl } from '../api/types';

/**
 * Um ícone do bazar (item/mount/outfit): o GIF do proxy com o nome no `title`/`alt` e, p/ itens,
 * o badge de quantidade. Sem sprite — ou se a imagem falhar (parser frágil, 404 do proxy) — cai
 * no nome em texto, sem buraco na tela. `size="sm"` é a célula menor dos cards da lista.
 */
export function Sprite({
  category,
  item,
  size,
  hideOnError,
}: {
  category: SpriteCategory;
  item: ItemEntry;
  size?: 'sm';
  /** Avatar decorativo (ex.: outfit na lista): some se a imagem falhar, em vez de virar texto. */
  hideOnError?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const label = item.count > 1 ? `${item.count}× ${item.name}` : item.name;
  const cls = size === 'sm' ? 'icon-cell icon-cell--sm' : 'icon-cell';

  if (!item.sprite || failed) {
    if (hideOnError) return null;
    return (
      <span className={`${cls} icon-cell--text`} title={label}>
        {size === 'sm' ? item.name : label}
      </span>
    );
  }
  return (
    <span className={cls} title={label}>
      <img
        className="sprite"
        src={spriteUrl(category, item.sprite)}
        alt={item.name}
        loading="lazy"
        onError={() => setFailed(true)}
      />
      {item.count > 1 && <span className="icon-count">{item.count}</span>}
    </span>
  );
}
