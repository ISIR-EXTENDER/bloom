import type { ReactNode } from "react";

export type BloomNavItem<TView extends string = string> = {
  description?: string;
  id: TView;
  label: string;
};

export type BloomNavBarProps<TView extends string = string> = {
  activeItemId: TView;
  brand: {
    imageSrc?: string;
    label: string;
  };
  items: readonly BloomNavItem<TView>[];
  onItemSelect: (itemId: TView) => void;
  renderActions?: () => ReactNode;
};

export function BloomNavBar<TView extends string>({
  activeItemId,
  brand,
  items,
  onItemSelect,
  renderActions,
}: BloomNavBarProps<TView>) {
  return (
    <header className="bloom-nav-shell">
      <a className="bloom-nav-brand" href="#bloom-main">
        {brand.imageSrc ? <img src={brand.imageSrc} alt="" aria-hidden="true" /> : null}
        <span>{brand.label}</span>
      </a>
      <nav aria-label="Bloom product areas" className="bloom-nav-links">
        {items.map((item) => (
          <button
            aria-current={activeItemId === item.id ? "page" : undefined}
            aria-label={item.description ? `${item.label}: ${item.description}` : item.label}
            className="bloom-nav-link"
            key={item.id}
            onClick={() => onItemSelect(item.id)}
            type="button"
          >
            {item.label}
          </button>
        ))}
      </nav>
      {renderActions ? <div className="bloom-nav-actions">{renderActions()}</div> : null}
    </header>
  );
}
