/**
 * Build diagnostics.
 *
 * Reached at `?selftest`, and shipped in the production bundle on purpose: its
 * whole value is that it can be run on the device, in the WebView, offline,
 * where no test runner can reach. The fingerprint it prints must match the one
 * CI records for the same commit — see docs/ANDROID.md.
 *
 * This is not a placeholder or a debug leftover. It is the only way to check
 * that a phone's WebView, WASM runtime and JavaScript engine agree with the
 * numbers the test suite certified, and "it is the same code so it must agree"
 * is not a check.
 */
import { useCallback, useEffect, useState, type JSX } from 'react';
import { runSelfTest, type SelfTestResult } from '@astro/engine';
import { getProvider, getLocations } from '../lib/engine.js';

/** Recorded by `packages/engine/test/integration/selftest.test.ts`. */
const EXPECTED_FINGERPRINT = '855fec9b';

interface Environment {
  readonly userAgent: string;
  readonly platform: string;
  readonly online: boolean;
  readonly wasm: boolean;
  readonly origin: string;
  readonly languages: string;
}

interface AssetCheck {
  readonly url: string;
  readonly ok: boolean;
  readonly bytes?: number;
  readonly detail?: string;
}

export function SelfTestPanel(): JSX.Element {
  const [result, setResult] = useState<SelfTestResult | null>(null);
  const [assets, setAssets] = useState<readonly AssetCheck[] | null>(null);
  const [locations, setLocations] = useState<string>('not checked');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [environment, setEnvironment] = useState<Environment | null>(null);

  useEffect(() => {
    setEnvironment({
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      online: navigator.onLine,
      wasm: typeof WebAssembly === 'object',
      origin: globalThis.location.origin,
      languages: navigator.languages.join(', '),
    });
  }, []);

  const run = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      /*
       * Assets first. If the ephemeris payload is missing the engine throws
       * something unhelpful, and on a device the difference between "the maths
       * is wrong" and "the file did not ship" is the difference between a day
       * of debugging and a minute of it.
       */
      const checks: AssetCheck[] = [];
      for (const url of ['/wasm/swisseph.wasm', '/wasm/swisseph.data', '/data/cities.json']) {
        try {
          const response = await fetch(url);
          const buffer = await response.arrayBuffer();
          checks.push({ url, ok: response.ok, bytes: buffer.byteLength });
        } catch (cause) {
          checks.push({ url, ok: false, detail: String(cause) });
        }
      }
      setAssets(checks);

      const provider = await getProvider();
      setResult(runSelfTest(provider));

      const database = await getLocations();
      const hits = database.search('Mumbai', { limit: 3 });
      setLocations(`${hits.length} result(s) for "Mumbai"`);
    } catch (cause) {
      console.error('self-test failed', cause);
      setError(String(cause));
    } finally {
      setBusy(false);
    }
  }, []);

  const matches = result?.fingerprint === EXPECTED_FINGERPRINT;

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-6 font-mono text-sm">
      <header>
        <h1 className="text-lg font-semibold">Engine self-test</h1>
        <p className="mt-1 text-xs text-slate-600">
          Runs {8} reference charts and fingerprints every position, cusp and
          aspect. The result must equal the fingerprint recorded by CI for this
          commit.
        </p>
      </header>

      <button
        type="button"
        onClick={() => void run()}
        disabled={busy}
        className="rounded bg-slate-900 px-4 py-2 text-white disabled:bg-slate-400"
      >
        {busy ? 'Running…' : 'Run self-test'}
      </button>

      {error ? (
        <pre className="whitespace-pre-wrap rounded border border-rose-300 bg-rose-50 p-3 text-xs text-rose-900">
          {error}
        </pre>
      ) : null}

      {result ? (
        <section
          className={`rounded border p-3 ${
            matches ? 'border-emerald-400 bg-emerald-50' : 'border-rose-400 bg-rose-50'
          }`}
        >
          <p className="text-base font-semibold">
            {matches ? 'PASS' : 'MISMATCH'} — fingerprint {result.fingerprint}
          </p>
          <p className="text-xs">
            expected {EXPECTED_FINGERPRINT} · {result.milliseconds} ms
          </p>
          {!matches ? (
            <p className="mt-2 text-xs">
              The per-case digests below identify which case diverged.
            </p>
          ) : null}
        </section>
      ) : null}

      {result ? (
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="border-b border-slate-300 text-left">
              <th className="py-1">case</th>
              <th className="py-1">digest</th>
              <th className="py-1">source</th>
              <th className="py-1">bodies</th>
              <th className="py-1">aspects</th>
            </tr>
          </thead>
          <tbody>
            {result.cases.map((testCase) => (
              <tr key={testCase.id} className="border-b border-slate-100">
                <td className="py-1">{testCase.id}</td>
                <td className="py-1">{testCase.digest}</td>
                <td className={`py-1 ${testCase.source === 'swiss' ? '' : 'text-amber-700'}`}>
                  {testCase.source}
                </td>
                <td className="py-1">{testCase.bodies}</td>
                <td className="py-1">{testCase.aspects}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}

      {assets ? (
        <section>
          <h2 className="font-semibold">Bundled assets</h2>
          <ul className="mt-1 space-y-0.5 text-xs">
            {assets.map((asset) => (
              <li key={asset.url} className={asset.ok ? '' : 'text-rose-700'}>
                {asset.ok ? '✓' : '✗'} {asset.url}
                {asset.bytes !== undefined
                  ? ` — ${(asset.bytes / 1048576).toFixed(2)} MB`
                  : ` — ${asset.detail ?? 'failed'}`}
              </li>
            ))}
            <li>· city database: {locations}</li>
          </ul>
        </section>
      ) : null}

      {environment ? (
        <section>
          <h2 className="font-semibold">Environment</h2>
          <dl className="mt-1 space-y-0.5 text-xs">
            {Object.entries(environment).map(([key, value]) => (
              <div key={key} className="flex gap-2">
                <dt className="w-24 shrink-0 text-slate-500">{key}</dt>
                <dd className="break-all">{String(value)}</dd>
              </div>
            ))}
          </dl>
          {/*
            Network state is reported rather than required. The app must work
            with it false — that is what offline-first means — so seeing
            "online: false" beside a passing fingerprint is the result worth
            having, not a problem.
          */}
          <p className="mt-2 text-xs text-slate-500">
            A passing fingerprint with <code>online: false</code> is the offline
            proof: nothing here is fetched from the network.
          </p>
        </section>
      ) : null}
    </div>
  );
}
