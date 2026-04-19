import { FormEvent, useMemo, useState } from 'react';
import logoUrl from './assets/logo2.png';
import { requestDriverVerification } from './lib/api';
import type { DriverRecord } from '@car-movers/shared/verification';
import type { VerificationStatus } from './types';

function getDriverIdFromUrl() {
  const searchParams = new URLSearchParams(window.location.search);
  const queryId = searchParams.get('id');

  if (queryId) {
    return queryId;
  }

  const pathSegments = window.location.pathname.split('/').filter(Boolean);
  return pathSegments[pathSegments.length - 1] ?? '';
}

function maskDriverId(driverId: string) {
  if (!driverId) {
    return 'missing';
  }

  if (driverId.length <= 5) {
    return '*'.repeat(driverId.length);
  }

  return `${driverId.slice(0, -5)}${'*'.repeat(5)}`;
}

function formatDriverSince(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);

  if (match) {
    const [, year, month, day] = match;
    return `${day}-${month}-${year}`;
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  const day = String(parsed.getDate()).padStart(2, '0');
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const year = parsed.getFullYear();

  return `${day}-${month}-${year}`;
}

function App() {
  const driverId = useMemo(() => getDriverIdFromUrl(), []);
  const maskedDriverId = useMemo(() => maskDriverId(driverId), [driverId]);
  const [surname, setSurname] = useState('');
  const [status, setStatus] = useState<VerificationStatus>('idle');
  const [driver, setDriver] = useState<DriverRecord | null>(null);
  const [errorMessage, setErrorMessage] = useState('');

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!driverId || !surname.trim()) {
      setDriver(null);
      setStatus('not_verified');
      return;
    }

    setStatus('loading');
    setDriver(null);
    setErrorMessage('');

    try {
      const result = await requestDriverVerification({ id: driverId, surname });
      setDriver(result.verified ? result.driver : null);
      setStatus(result.verified ? 'verified' : 'not_verified');
    } catch (error) {
      setStatus('error');
      setErrorMessage(error instanceof Error ? error.message : 'Verification failed.');
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <section className="w-full max-w-xl animate-rise rounded-[32px] border border-white/70 bg-white/90 p-6 shadow-panel backdrop-blur md:p-10 items-center justify-center flex flex-col">
        <img
          src={logoUrl}
          alt="Logo"
          className="h-20 w-auto md:h-24 md:max-w-[300px]"
        />

        <div className="mt-8">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-primary">
            Driver verification
          </p>
          <h1 className="mt-3 text-3xl font-semibold text-ink">
            Confirm the Driver's Surname
          </h1>
          <p className="mt-3 text-sm leading-6 text-ink/70">
            Enter the surname to verify the driver linked to ID{' '}
            <span className="font-semibold text-ink">{maskedDriverId}</span>.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="mt-8 space-y-4"
        >
          <label
            htmlFor="surname"
            className="block text-sm font-medium text-ink"
          >
            Driver surname
          </label>
          <input
            id="surname"
            value={surname}
            onChange={(event) => setSurname(event.target.value)}
            placeholder="Enter surname"
            className="w-full rounded-2xl border border-primary/20 bg-mist px-4 py-3 text-base text-ink outline-none transition focus:border-primary focus:bg-white focus:ring-4 focus:ring-secondary/40"
          />

          <button
            type="submit"
            disabled={status === 'loading'}
            className="w-full rounded-2xl bg-primary px-4 py-3 text-base font-semibold text-white transition hover:bg-[#4f92cf] disabled:cursor-wait disabled:opacity-70"
          >
            {status === 'loading' ? 'Checking...' : 'Verify driver'}
          </button>
        </form>

        {status === 'verified' && driver ? (
          <section className="mt-8 rounded-[28px] border border-[#9cc8ee] bg-gradient-to-br from-[#dff0ff] via-[#cfe8ff] to-[#f7fbff] p-6 text-center shadow-[0_18px_45px_rgba(90,162,225,0.18)] md:p-7 md:text-left">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-primary">
              Verified
            </p>
            <div className="mt-5 flex flex-col items-center gap-5 sm:flex-row sm:items-center sm:text-left">
              <div className="flex h-36 w-36 shrink-0 items-center justify-center overflow-hidden rounded-3xl bg-white shadow-sm md:h-44 md:w-44">
                {driver.photoUrl ? (
                  <img
                    src={driver.photoUrl}
                    alt={driver.fullName}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="text-2xl font-semibold text-primary">
                    {driver.fullName
                      .split(' ')
                      .map((part) => part[0])
                      .join('')
                      .slice(0, 2)}
                  </span>
                )}
              </div>

              <div className="min-w-0">
                <h2 className="text-3xl font-semibold text-ink">{driver.fullName}</h2>
                <p className="mt-2 text-base text-ink/70">ID: {maskDriverId(driver.id)}</p>
                {driver.driverSince ? (
                  <p className="mt-2 text-base text-ink/70">
                    Driver since:{' '}
                    <span className="font-semibold text-ink">{formatDriverSince(driver.driverSince)}</span>
                  </p>
                ) : null}
                <p className="mt-4 inline-flex rounded-full border border-emerald-300 bg-emerald-100 px-4 py-1.5 text-sm font-medium text-emerald-800 shadow-[0_8px_20px_rgba(16,185,129,0.14)]">
                  {driver.status}
                </p>
              </div>
            </div>
          </section>
        ) : null}

        {status === 'not_verified' ? (
          <section className="mt-8 rounded-[28px] border border-red-100 bg-red-50 p-5 text-center">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-red-500">
              Not verified
            </p>
            <p className="mt-2 text-sm text-red-700">
              We could not find a driver matching that ID and surname.
            </p>
          </section>
        ) : null}

        {status === 'error' ? (
          <section className="mt-8 rounded-[28px] border border-amber-100 bg-amber-50 p-5">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-amber-600">
              Configuration needed
            </p>
            <p className="mt-2 text-sm text-amber-800">{errorMessage}</p>
          </section>
        ) : null}
      </section>
    </main>
  );
}

export default App;
