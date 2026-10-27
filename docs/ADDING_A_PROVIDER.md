# Adding a provider

Example: adding GreyNoise. Expect one source file, one test file and a few
one-line edits. Nothing in the UI, caching or messaging needs to change.

1. **Register the id** in `src/core/provider-ids.ts`:

   ```ts
   export const PROVIDER_IDS = ['abuseipdb', 'virustotal', 'greynoise'] as const;
   ```

   TypeScript will now point at every place that needs the new provider
   (settings defaults, registry).

2. **Implement `Provider`** in `src/providers/greynoise.ts`, using
   `abuseipdb.ts` as the template:
   - `supports`: the indicator types the API accepts.
   - `lookup()`: call `getJson()` from `./http` (it handles timeouts, JSON and
     network errors), pass non-200 responses to `failForStatus()`, and map the
     body to a `Report`. Read every field through `obj`/`num`/`str` from
     `./json`: API responses are untrusted input.
   - `checkKey()`: the cheapest call that proves the key works.
   - Return a verdict, a headline number and at most ~6 facts. Keep the
     verdict thresholds as exported constants.

3. **List it** in `src/providers/registry.ts` (the order there is the menu order),
   and give it an empty key in `DEFAULT_SETTINGS` in `src/core/settings.ts`.

4. **Allow its API host** in `scripts/manifest.mjs` (`API_HOSTS`). This updates
   both `host_permissions` and the extension's `connect-src` CSP.

5. **Test it**: record real (trimmed) responses into `tests/fixtures/greynoise/`
   and copy the structure of `src/providers/abuseipdb.test.ts`: request shape,
   report mapping, every error status, malformed bodies, the key check.

The context menu entry, the settings field (with **Test** and **Get a key**),
caching, retry and the card all pick the new provider up automatically.
