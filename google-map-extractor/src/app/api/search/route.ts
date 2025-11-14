import { NextRequest, NextResponse } from "next/server";

type TextSearchPlace = {
  place_id: string;
  name?: string;
  formatted_address?: string;
  business_status?: string;
  geometry?: {
    location?: {
      lat?: number;
      lng?: number;
    };
  };
  types?: string[];
};

type PlaceDetails = {
  name?: string;
  formatted_phone_number?: string;
  international_phone_number?: string;
  formatted_address?: string;
  url?: string;
  website?: string;
  business_status?: string;
  geometry?: {
    location?: {
      lat?: number;
      lng?: number;
    };
  };
  types?: string[];
};

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

const TEXT_SEARCH_ENDPOINT =
  "https://maps.googleapis.com/maps/api/place/textsearch/json";
const DETAILS_ENDPOINT =
  "https://maps.googleapis.com/maps/api/place/details/json";
const DETAIL_FIELDS =
  "name,formatted_phone_number,international_phone_number,formatted_address,url,website,business_status,geometry,types";
const MAX_TOTAL_RESULTS = 60;

const sleep = (durationMs: number) =>
  new Promise((resolve) => setTimeout(resolve, durationMs));

const toRecord = (
  summary: TextSearchPlace,
  details?: PlaceDetails,
): PlaceRecord => {
  const source = details ?? {};
  const phone =
    source.formatted_phone_number ?? source.international_phone_number ?? "";

  const lat =
    source.geometry?.location?.lat ?? summary.geometry?.location?.lat;
  const lng =
    source.geometry?.location?.lng ?? summary.geometry?.location?.lng;

  const googleMapsUrl =
    source.url ??
    (lat !== undefined && lng !== undefined
      ? `https://www.google.com/maps/search/?api=1&query=${lat},${lng}&query_place_id=${summary.place_id}`
      : undefined);

  return {
    name: source.name ?? summary.name ?? "Unknown",
    formattedAddress:
      source.formatted_address ??
      summary.formatted_address ??
      "Address unavailable",
    phoneNumber: phone || undefined,
    googleMapsUrl,
    website: source.website ?? undefined,
    latitude: lat,
    longitude: lng,
    businessStatus: source.business_status ?? summary.business_status,
    types: source.types ?? summary.types,
  };
};

const sanitizeMaxResults = (raw: unknown) => {
  if (typeof raw !== "number") return MAX_TOTAL_RESULTS;
  if (Number.isNaN(raw)) return MAX_TOTAL_RESULTS;
  return Math.min(MAX_TOTAL_RESULTS, Math.max(1, Math.floor(raw)));
};

async function fetchPlaceDetails(
  placeId: string,
  apiKey: string,
): Promise<PlaceDetails | undefined> {
  const params = new URLSearchParams({
    place_id: placeId,
    key: apiKey,
    fields: DETAIL_FIELDS,
  });

  const response = await fetch(`${DETAILS_ENDPOINT}?${params.toString()}`, {
    method: "GET",
    cache: "no-store",
  });

  if (!response.ok) {
    return undefined;
  }

  const payload = await response.json();

  if (payload.status === "OK") {
    return payload.result as PlaceDetails;
  }

  if (payload.status === "NOT_FOUND" || payload.status === "ZERO_RESULTS") {
    return undefined;
  }

  if (payload.status === "OVER_QUERY_LIMIT") {
    throw new Error(
      "Google Places quota exceeded. Wait before trying again or adjust your API usage.",
    );
  }

  throw new Error(
    payload.error_message ??
      `Google Places Details returned status ${payload.status}`,
  );
}

async function fetchTextSearchPage(
  params: URLSearchParams,
  apiKey: string,
  pageToken?: string,
) {
  const fullParams = new URLSearchParams(params);
  if (pageToken) {
    fullParams.set("pagetoken", pageToken);
  }
  fullParams.set("key", apiKey);

  const response = await fetch(
    `${TEXT_SEARCH_ENDPOINT}?${fullParams.toString()}`,
    {
      method: "GET",
      cache: "no-store",
    },
  );

  if (!response.ok) {
    throw new Error(`Text search failed with status ${response.status}`);
  }

  const payload = await response.json();
  const status: string = payload.status;

  if (status === "OK" || status === "ZERO_RESULTS") {
    return payload as {
      results: TextSearchPlace[];
      next_page_token?: string;
    };
  }

  if (status === "OVER_QUERY_LIMIT") {
    throw new Error(
      "Google Places quota exceeded. Wait before trying again or adjust your API usage.",
    );
  }

  if (status === "REQUEST_DENIED" || status === "INVALID_REQUEST") {
    throw new Error(payload.error_message ?? `Request denied: ${status}`);
  }

  throw new Error(payload.error_message ?? `Unexpected status: ${status}`);
}

export async function POST(request: NextRequest) {
  try {
    const { apiKey, query, location, maxResults } = await request.json();

    if (typeof apiKey !== "string" || apiKey.trim() === "") {
      return NextResponse.json(
        { error: "API key is required." },
        { status: 400 },
      );
    }

    if (typeof query !== "string" || query.trim() === "") {
      return NextResponse.json(
        { error: "Search keyword is required." },
        { status: 400 },
      );
    }

    const cleanMaxResults = sanitizeMaxResults(maxResults);
    const searchQuery =
      typeof location === "string" && location.trim() !== ""
        ? `${query} in ${location}`
        : query;

    const baseParams = new URLSearchParams({
      query: searchQuery,
    });

    const summaries: TextSearchPlace[] = [];
    let pageToken: string | undefined;

    do {
      if (pageToken) {
        await sleep(2000);
      }

      const page = await fetchTextSearchPage(baseParams, apiKey, pageToken);

      summaries.push(...page.results);
      pageToken = page.next_page_token;
    } while (
      pageToken &&
      summaries.length < cleanMaxResults &&
      summaries.length < MAX_TOTAL_RESULTS
    );

    const trimmedSummaries = summaries.slice(0, cleanMaxResults);

    const records: PlaceRecord[] = [];
    const chunkSize = 5;

    for (let index = 0; index < trimmedSummaries.length; index += chunkSize) {
      const chunk = trimmedSummaries.slice(index, index + chunkSize);
      const detailsList = await Promise.all(
        chunk.map(async (summary) => {
          try {
            return await fetchPlaceDetails(summary.place_id, apiKey);
          } catch (error) {
            if (error instanceof Error) {
              if (
                error.message.includes("quota exceeded") ||
                error.message.includes("Request denied")
              ) {
                throw error;
              }
            }
            return undefined;
          }
        }),
      );

      chunk.forEach((summary, offset) => {
        records.push(toRecord(summary, detailsList[offset]));
      });
    }

    return NextResponse.json({
      results: records,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unexpected error while searching for places.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
