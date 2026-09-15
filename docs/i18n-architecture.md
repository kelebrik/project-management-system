# Bilingual interface architecture

## Goals

- English (`en`) is the cloud default. Russian (`ru`) remains available through the language toggle and persisted per user.
- Russian (`ru`) remains available through a runtime switch without a reload.
- Every interface string has a stable key and a typed translation entry.
- Dates, numbers and relative labels follow the selected locale.
- User supplied content and Jira data remain unchanged; only application chrome is translated.

## Runtime design

`I18nProvider` is mounted in `main.tsx`, inside `StrictMode` and alongside the existing providers. It owns the single shared locale state and exposes `useI18n()`:

```ts
const { locale, setLocale, t, formatters, labels } = useI18n();
```

`Locale` is the union `"en" | "ru"`. The initial value is read from `pms-language`; invalid or missing values resolve to `en`. Writes to storage are guarded so private browsing does not break the application. The provider updates `document.documentElement.lang` and uses `Intl` with `en-GB` or `ru-RU`.

Translations are split into domain dictionaries (`common`, `navigation`, `auth`, `projects`, `reports`, `resources`, `admin`, `jira`, `wiki`). A typed key union is generated from the dictionary shape, so a missing language entry fails TypeScript checks. `t(key, params)` supports named interpolation. Plurals use an explicit shape such as `{ one, few, many, other }`; English dictionaries may repeat `other`, while Russian must provide all four categories and tests verify every category.

## Boundaries

Application labels, validation text, empty states, buttons, tooltips, accessibility labels and toast messages use translation keys. In step 1, the API error envelope gains stable codes for the top user-reachable errors and the web boundary maps those codes; unknown server text remains Russian until that migration is complete. Project names, Jira summaries, statuses and other business data are not machine translated.

Date and number helpers accept an optional locale or read it from `useI18n`; all 72 current `ru-RU` call sites move to these helpers in step 1. Model sorting remains deterministic and is not coupled to display language. Print/export templates explicitly select their intended language.

## Migration order

0. Migrate Playwright selectors from visible Russian text to stable roles/test IDs so locale changes do not break the suite.
1. Add provider, dictionaries, explicit plural shapes, interpolation, locale-aware formatting, API error codes/mapping, and unit coverage.
2. Convert shell, authentication and shared components (dialogs, search, banners, controls); replace the visible theme toggle with the language toggle, as requested.
3. Convert project registry, overview, schedule, WBS and RAID pages.
4. Convert portfolio, reports and resources.
5. Convert administration and Jira pages.
6. Convert wiki content as a separate authored-content track; finish remaining notices.
7. Run scoped Cyrillic lint (excluding wiki, fixtures and tests), browser smoke tests in both locales, and verify the English cloud default.

Each step is independently shippable with English as the default. New UI code must use `t()`; a development-only missing-key warning prevents silent fallbacks. The default is defined in `i18n/locale.ts`; there is currently no environment override.

## Testing

Unit tests cover storage fallback, switching, interpolation, every plural category and formatting. Component-level label tests require adding a DOM test runner; until then, Playwright checks accessible labels in both locales. Playwright smoke tests switch locale, reload, and verify persistence on representative pages.

## Implementation checkpoint (2026-09-15)

English is the runtime default; an existing explicit `pms-language=ru` preference is respected. Report tables, PDF headings and clipboard output take an explicit locale and preserve project/Jira content. WBS and current-work columns use keyed labels; spreadsheet parsing retains its canonical matching rules independently of the interface language.

The migration is not complete. Remaining work includes dynamic messages in Jira, portfolio, resources and automation, additional table/model labels, and the API error-code boundary. Cyrillic search results must be classified: persisted content, parser tokens and Russian dictionary values are intentional. Passing the current build and tests is not proof of complete language coverage.
