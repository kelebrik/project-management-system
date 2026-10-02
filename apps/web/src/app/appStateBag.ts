/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * The application state the root component hands to its hooks and to the
 * presentation layer. Each part is typed where it is made; this bag only
 * carries them along, the way PageContextValue does for pages.
 */
export type AppStateBag = Record<string, any>;
