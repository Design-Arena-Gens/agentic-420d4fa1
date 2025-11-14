"use client";

import { FormEvent, useMemo, useState } from "react";
import * as XLSX from "xlsx";

type PlaceRecord = {
  name: string;
  formattedAddress: string;
  phoneNumber?: string;
  googleMapsUrl?: string;
  website?: string;
  latitude?: number;
  longitude?: number;
  businessStatus?: string;
  types?: string[];
};

type SearchResponse = {
  results: PlaceRecord[];
};

export default function Home() {
  const [apiKey, setApiKey] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [location, setLocation] = useState("");
  const [maxResults, setMaxResults] = useState(40);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<PlaceRecord[]>([]);

  const hasResults = results.length > 0;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          apiKey,
          query: searchTerm,
          location,
          maxResults,
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error ?? "Search failed");
      }

      const payload = (await response.json()) as SearchResponse;
      setResults(payload.results);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error");
      setResults([]);
    } finally {
      setIsLoading(false);
    }
  };

  const downloadWorkbook = () => {
    if (!hasResults) return;

    const tableData = results.map((item) => ({
      Name: item.name,
      "Phone Number": item.phoneNumber ?? "",
      Address: item.formattedAddress,
      Latitude: item.latitude ?? "",
      Longitude: item.longitude ?? "",
      "Business Status": item.businessStatus ?? "",
      Website: item.website ?? "",
      "Google Maps URL": item.googleMapsUrl ?? "",
      Categories: item.types?.join(", ") ?? "",
    }));

    const worksheet = XLSX.utils.json_to_sheet(tableData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Places");
    XLSX.writeFile(workbook, `places-export-${Date.now()}.xlsx`);
  };

  const disabled = useMemo(() => {
    return apiKey.trim() === "" || searchTerm.trim() === "";
  }, [apiKey, searchTerm]);

  return (
    <div className="min-h-screen bg-slate-950">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 pb-16 pt-12 text-white">
        <header className="flex flex-col gap-2">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Google Maps Business Extractor
          </h1>
          <p className="text-sm text-slate-300 sm:text-base">
            Fetch business listings from Google Places, capture phone numbers,
            addresses, and export everything into a spreadsheet.
          </p>
        </header>

        <form
          onSubmit={handleSubmit}
          className="grid gap-6 rounded-xl border border-slate-800 bg-slate-900/60 p-6 shadow-lg shadow-black/20"
        >
          <div className="grid gap-4 lg:grid-cols-2">
            <label className="flex flex-col gap-2 text-sm">
              <span className="font-medium text-slate-200">Google API Key</span>
              <input
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                type="password"
                placeholder="AIza..."
                className="rounded-lg border border-slate-700 bg-slate-950 px-4 py-2 text-base text-white outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/40"
              />
            </label>

            <label className="flex flex-col gap-2 text-sm">
              <span className="font-medium text-slate-200">
                Search Keyword
              </span>
              <input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="e.g. dentists, coffee shops"
                className="rounded-lg border border-slate-700 bg-slate-950 px-4 py-2 text-base text-white outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/40"
              />
            </label>

            <label className="flex flex-col gap-2 text-sm">
              <span className="font-medium text-slate-200">
                Location (City, State, Country)
              </span>
              <input
                value={location}
                onChange={(event) => setLocation(event.target.value)}
                placeholder="e.g. Austin, TX"
                className="rounded-lg border border-slate-700 bg-slate-950 px-4 py-2 text-base text-white outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/40"
              />
            </label>

            <label className="flex flex-col gap-2 text-sm">
              <span className="font-medium text-slate-200">
                Max Results (up to 60)
              </span>
              <input
                value={maxResults}
                onChange={(event) =>
                  setMaxResults(
                    Math.min(60, Math.max(1, Number(event.target.value) || 1)),
                  )
                }
                type="number"
                min={1}
                max={60}
                className="rounded-lg border border-slate-700 bg-slate-950 px-4 py-2 text-base text-white outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/40"
              />
            </label>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              type="submit"
              disabled={isLoading || disabled}
              className="inline-flex h-11 items-center justify-center rounded-lg bg-emerald-500 px-6 text-sm font-medium text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-slate-700"
            >
              {isLoading ? "Searching..." : "Search Businesses"}
            </button>
            <button
              type="button"
              onClick={downloadWorkbook}
              disabled={!hasResults}
              className="inline-flex h-11 items-center justify-center rounded-lg border border-slate-700 px-6 text-sm font-medium text-white transition hover:border-emerald-400 hover:text-emerald-300 disabled:cursor-not-allowed disabled:border-slate-800 disabled:text-slate-500"
            >
              Download Excel
            </button>
          </div>
          {error && (
            <div className="rounded-lg border border-rose-500/60 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
              {error}
            </div>
          )}
        </form>

        <section className="rounded-xl border border-slate-800 bg-slate-900/40">
          <header className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
            <div>
              <h2 className="text-lg font-medium text-white">Results</h2>
              <p className="text-xs text-slate-400">
                {hasResults
                  ? `${results.length} businesses fetched`
                  : "Run a search to view businesses"}
              </p>
            </div>
          </header>
          <div className="max-h-[520px] overflow-x-auto">
            <table className="min-w-full text-left text-sm text-slate-200">
              <thead className="sticky top-0 bg-slate-900/80 backdrop-blur">
                <tr className="text-xs uppercase text-slate-400">
                  <th className="px-6 py-3">Name</th>
                  <th className="px-6 py-3">Phone</th>
                  <th className="px-6 py-3">Address</th>
                  <th className="px-6 py-3">Coordinates</th>
                  <th className="px-6 py-3">Website</th>
                  <th className="px-6 py-3">Google Maps</th>
                </tr>
              </thead>
              <tbody>
                {hasResults ? (
                  results.map((place) => (
                    <tr
                      key={`${place.name}-${place.googleMapsUrl ?? place.formattedAddress}`}
                      className="border-t border-slate-800/60 text-xs sm:text-sm"
                    >
                      <td className="px-6 py-3 text-slate-100">{place.name}</td>
                      <td className="px-6 py-3 text-slate-200">
                        {place.phoneNumber ?? "—"}
                      </td>
                      <td className="px-6 py-3 text-slate-300">
                        {place.formattedAddress}
                      </td>
                      <td className="px-6 py-3 text-slate-300">
                        {place.latitude && place.longitude
                          ? `${place.latitude.toFixed(6)}, ${place.longitude.toFixed(6)}`
                          : "—"}
                      </td>
                      <td className="px-6 py-3 text-emerald-300">
                        {place.website ? (
                          <a
                            href={place.website}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="underline decoration-emerald-400/60 hover:text-emerald-200"
                          >
                            Website
                          </a>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-6 py-3">
                        {place.googleMapsUrl ? (
                          <a
                            href={place.googleMapsUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-emerald-300 underline decoration-emerald-400/60 hover:text-emerald-200"
                          >
                            View
                          </a>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-6 py-10 text-center text-sm text-slate-400"
                    >
                      No data yet. Start by running a search.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
