// TypeScript 7 refuses a side-effect import it has no declaration for, and the
// font packages ship plain CSS. Bloom imports those files for their effect,
// never for a value.
declare module "*.css";
