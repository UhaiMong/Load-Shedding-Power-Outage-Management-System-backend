import { env } from "../config/env";
import { AppError } from "../utils/ApiError";

export interface BkashResponse {
  statusCode?: string;
  statusMessage?: string;
  paymentID?: string;
  bkashURL?: string;
  trxID?: string;
  transactionStatus?: string;
  amount?: string;
  merchantInvoiceNumber?: string;
  id_token?: string;
  expires_in?: number;
  [key: string]: unknown;
}

let tokenCache: { token: string; expiresAt: number } | null = null;
let tokenPromise: Promise<string> | null = null;

const assertConfigured = () => {
  if (
    !env.BKASH_APP_KEY ||
    !env.BKASH_APP_SECRET ||
    !env.BKASH_USERNAME ||
    !env.BKASH_PASSWORD
  ) {
    throw new AppError(503, "bKash is not configured");
  }
};

const post = async (
  path: string,
  body: unknown,
  headers: Record<string, string>,
) => {
  let res: Response;
  try {
    res = await fetch(`${env.BKASH_BASE_URL}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...headers,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new AppError(502, "Could not reach bKash");
  }
  const data = (await res.json().catch(() => ({}))) as BkashResponse;
  if (!res.ok)
    throw new AppError(502, data.statusMessage ?? "bKash request failed", [
      data,
    ]);
  return data;
};

const getToken = async () => {
  assertConfigured();
  if (tokenCache && tokenCache.expiresAt > Date.now() + 30_000)
    return tokenCache.token;
  tokenPromise ??= post(
    "/tokenized/checkout/token/grant",
    { app_key: env.BKASH_APP_KEY, app_secret: env.BKASH_APP_SECRET },
    {
      username: env.BKASH_USERNAME as string,
      password: env.BKASH_PASSWORD as string,
    },
  )
    .then((data) => {
      if (!data.id_token)
        throw new AppError(
          502,
          data.statusMessage ?? "bKash token grant failed",
        );
      tokenCache = {
        token: data.id_token,
        expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
      };
      return data.id_token;
    })
    .finally(() => {
      tokenPromise = null;
    });
  return tokenPromise;
};

const authed = async (path: string, body: unknown) => {
  const token = await getToken();
  return post(path, body, {
    Authorization: token,
    "X-APP-Key": env.BKASH_APP_KEY as string,
  });
};

export const bkash = {
  createPayment: (input: {
    amount: string;
    invoice: string;
    payerReference: string;
    callbackURL: string;
  }) =>
    authed("/tokenized/checkout/create", {
      mode: "0011",
      payerReference: input.payerReference,
      callbackURL: input.callbackURL,
      amount: input.amount,
      currency: "BDT",
      intent: "sale",
      merchantInvoiceNumber: input.invoice,
    }),
  executePayment: (paymentID: string) =>
    authed("/tokenized/checkout/execute", { paymentID }),
  queryPayment: (paymentID: string) =>
    authed("/tokenized/checkout/payment/status", { paymentID }),
};
