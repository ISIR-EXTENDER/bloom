# Widget Renderers

React renderer registry for Bloom widget descriptors.

This package is intentionally separate from `@bloom/widgets`:

- `@bloom/widgets` owns framework-independent domain contracts;
- `@bloom/widget-renderers` owns React renderer registration and fallback components;
- apps such as the dashboard consume the registry instead of rendering widget descriptors inline.

The default components are transitional and intentionally simple. They prove the rendering boundary before the final
Bloom builder/runtime design is polished.
