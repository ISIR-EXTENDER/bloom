import { BloomNavBar, type BloomNavItem } from "@bloom/ui";

export type ProductView = "builder" | "help" | "landing" | "runtime";

type ProductNavigationProps = {
  activeView: ProductView;
  onChangeView: (view: ProductView) => void;
};

const productViews: readonly BloomNavItem<ProductView>[] = [
  { id: "landing", label: "Home", description: "Project overview" },
  { id: "builder", label: "Builder", description: "Compose screens" },
  { id: "runtime", label: "Runtime", description: "Operate and inspect" },
  { id: "help", label: "Help", description: "Get started guide" },
];

export function ProductNavigation({ activeView, onChangeView }: ProductNavigationProps) {
  return (
    <>
      <a className="skip-link" href="#bloom-main-content">
        Skip to main content
      </a>
      <BloomNavBar
        activeItemId={activeView}
        brand={{ imageSrc: "/favicon.png", label: "Bloom" }}
        items={productViews}
        onItemSelect={onChangeView}
      />
    </>
  );
}
