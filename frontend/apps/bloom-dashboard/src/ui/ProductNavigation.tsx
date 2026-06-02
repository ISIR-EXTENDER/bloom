export type ProductView = "builder" | "landing" | "runtime";

type ProductNavigationProps = {
  activeView: ProductView;
  onChangeView: (view: ProductView) => void;
};

const productViews: readonly { id: ProductView; label: string; description: string }[] = [
  { id: "landing", label: "Home", description: "Project overview" },
  { id: "builder", label: "Builder", description: "Compose screens" },
  { id: "runtime", label: "Runtime", description: "Operate and inspect" },
];

export function ProductNavigation({ activeView, onChangeView }: ProductNavigationProps) {
  return (
    <header className="product-header">
      <a className="product-brand" href="#bloom-main">
        <img src="/favicon.png" alt="" aria-hidden="true" />
        <span>Bloom</span>
      </a>
      <nav aria-label="Bloom product areas">
        {productViews.map((view) => (
          <button
            aria-current={activeView === view.id ? "page" : undefined}
            className="product-nav-button"
            key={view.id}
            onClick={() => onChangeView(view.id)}
            type="button"
          >
            <strong>{view.label}</strong>
            <small>{view.description}</small>
          </button>
        ))}
      </nav>
    </header>
  );
}
