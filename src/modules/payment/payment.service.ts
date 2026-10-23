import { randomBytes, timingSafeEqual } from "node:crypto";
import type { Prisma } from "../../../generated/prisma/client.js";
import {
	BillStatus,
	PaymentStatus,
	Role,
} from "../../../generated/prisma/enums.js";
import { env } from "../../config/env.js";
import { type BkashResponse, bkash } from "../../lib/bkash.js";
import { cache } from "../../lib/cache.js";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../utils/ApiError.js";
import { type Actor, audit } from "../../utils/audit.js";
import { fireAndForget } from "../../utils/helpers.js";
import { advisoryLock } from "../../utils/lock.js";
import { buildMeta, getSkipTake } from "../../utils/pagination.js";
import { notifyUsers } from "../notification/notification.service.js";
import type { CallbackQuery, ListPaymentsQuery } from "./payment.validator.js";

const BKASH_OK = "0000";
const SESSION_TTL_MS = 15 * 60 * 1000;

const paymentSelect = {
	id: true,
	billId: true,
	amount: true,
	currency: true,
	provider: true,
	status: true,
	merchantInvoiceNumber: true,
	bkashPaymentId: true,
	bkashUrl: true,
	trxId: true,
	failureReason: true,
	paidAt: true,
	createdAt: true,
	bill: { select: { billingMonth: true, status: true } },
} satisfies Prisma.PaymentSelect;

type PaymentRow = Prisma.PaymentGetPayload<{ select: typeof paymentSelect }>;

const scope = (actor: Actor): Prisma.PaymentWhereInput =>
	actor.role === Role.CUSTOMER ? { userId: actor.id as string } : {};
const fresh = (id: string) =>
	prisma.payment.findUniqueOrThrow({ where: { id }, select: paymentSelect });

// initiate
const callbackBase = (origin?: string) =>
	(origin ?? env.APP_URL).replace(/\/$/, "");

export const initiate = async (
	billId: string,
	actor: Actor,
	origin?: string,
) => {
	const prepared = await prisma.$transaction(async (tx) => {
		await advisoryLock(tx, `bill-payment:${billId}`);

		const bill = await tx.bill.findFirst({
			where: { id: billId, customerId: actor.id as string, deletedAt: null },
			select: { id: true, amount: true, status: true },
		});
		if (!bill) throw new AppError(404, "Bill not found");
		if (bill.status === BillStatus.PAID)
			throw new AppError(409, "Bill is already paid");

		// Reuse a live checkout session instead of opening a second one (prevents double payment).
		const live = await tx.payment.findFirst({
			where: {
				billId,
				status: PaymentStatus.INITIATED,
				createdAt: { gt: new Date(Date.now() - SESSION_TTL_MS) },
			},
			select: paymentSelect,
		});
		if (live) {
			if (!live.bkashUrl)
				throw new AppError(
					409,
					"A payment for this bill is already being initiated",
				);
			return { existing: live };
		}

		const payment = await tx.payment.create({
			data: {
				billId,
				userId: actor.id as string,
				amount: bill.amount,
				merchantInvoiceNumber: `INV${Date.now()}${randomBytes(3).toString("hex").toUpperCase()}`,
			},
			select: paymentSelect,
		});
		await audit(tx, actor, {
			action: "PAYMENT_INITIATED",
			entity: "Payment",
			entityId: payment.id,
			metadata: { billId },
		});
		return { payment };
	});

	if ("existing" in prepared && prepared.existing) return prepared.existing;
	const payment = prepared.payment as PaymentRow;

	try {
		const actorId = (actor.id as string).slice(0, 30);
		const res = await bkash.createPayment({
			amount: payment.amount.toFixed(2),
			invoice: payment.merchantInvoiceNumber,
			payerReference: actorId,
			callbackURL: `${callbackBase(origin)}/api/v1/payments/callback/${payment.id}`,
		});
		if (res.statusCode !== BKASH_OK || !res.paymentID || !res.bkashURL) {
			throw new AppError(
				502,
				res.statusMessage ?? "bKash rejected the payment request",
				[res],
			);
		}
		await prisma.payment.update({
			where: { id: payment.id },
			data: {
				bkashPaymentId: res.paymentID,
				bkashUrl: res.bkashURL,
				rawResponse: res as Prisma.InputJsonValue,
			},
		});
	} catch (err) {
		await prisma.payment.updateMany({
			where: { id: payment.id, status: PaymentStatus.INITIATED },
			data: {
				status: PaymentStatus.FAILED,
				failureReason: err instanceof Error ? err.message : "bKash error",
			},
		});
		throw err;
	}
	return fresh(payment.id);
};

// ------------------------------------------------------------------ finalisation (idempotent)
const markFailed = (
	id: string,
	reason: string,
	raw?: BkashResponse,
	status: PaymentStatus = PaymentStatus.FAILED,
) =>
	prisma.payment.updateMany({
		where: { id, status: PaymentStatus.INITIATED },
		data: {
			status,
			failureReason: reason,
			...(raw ? { rawResponse: raw as Prisma.InputJsonValue } : {}),
		},
	});

const text = (value: unknown) =>
	typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;

const cents = (value: unknown) => {
	if (value == null) return null;
	const amount =
		typeof value === "number"
			? value
			: Number(typeof value === "string" ? value.trim() : String(value));
	if (!Number.isFinite(amount)) return null;
	return Math.round(amount * 100);
};

const isCompleted = (data: BkashResponse | undefined) => {
	if (!data) return false;
	if (text(data.transactionStatus)?.toLowerCase() === "completed") return true;
	return text(data.statusCode) === BKASH_OK && Boolean(text(data.trxID));
};

const bkashMessage = (data: BkashResponse | undefined, fallback: string) =>
	text(data?.statusMessage) ?? text(data?.errorMessage) ?? fallback;

const querySafe = async (paymentID: string) => {
	try {
		return await bkash.queryPayment(paymentID);
	} catch {
		return undefined;
	}
};

const executeSafe = async (paymentID: string) => {
	try {
		return await bkash.executePayment(paymentID);
	} catch {
		return undefined;
	}
};

const complete = async (payment: PaymentRow, data: BkashResponse) => {
	const returnedAmount = cents(data.amount);
	const amountMatches =
		data.amount === undefined || returnedAmount === cents(payment.amount);
	const returnedInvoice =
		text(data.merchantInvoiceNumber) ?? text(data.merchantInvoice);
	const invoiceMatches =
		!returnedInvoice || returnedInvoice === payment.merchantInvoiceNumber;
	if (!amountMatches || !invoiceMatches) {
		await markFailed(
			payment.id,
			"bKash response did not match the payment",
			data,
		);
		throw new AppError(422, "Payment verification mismatch");
	}

	const now = new Date();
	const finalized = await prisma.$transaction(async (tx) => {
		const { count } = await tx.payment.updateMany({
			where: {
				id: payment.id,
				status: { in: [PaymentStatus.INITIATED, PaymentStatus.FAILED] },
			},
			data: {
				status: PaymentStatus.COMPLETED,
				trxId: data.trxID as string,
				paidAt: now,
				failureReason: null,
				rawResponse: data as Prisma.InputJsonValue,
			},
		});
		if (count === 0) return false; // another request already completed it
		await tx.bill.updateMany({
			where: { id: payment.billId, status: BillStatus.UNPAID },
			data: { status: BillStatus.PAID, paidAt: now },
		});
		await audit(tx, null, {
			action: "PAYMENT_COMPLETED",
			entity: "Payment",
			entityId: payment.id,
			metadata: { trxId: data.trxID ?? null },
		});
		return true;
	});

	if (finalized) {
		await cache.invalidate("admin:");
		const owner = await prisma.payment.findUniqueOrThrow({
			where: { id: payment.id },
			select: { userId: true, amount: true },
		});
		fireAndForget(() =>
			notifyUsers([owner.userId], {
				type: "PAYMENT",
				title: "Payment received",
				message: `We received ${owner.amount.toFixed(2)} BDT (trxID ${data.trxID ?? "-"}). Thank you!`,
				refId: payment.id,
			}),
		);
	}
	return fresh(payment.id);
};

const customerVerified = (data: BkashResponse | undefined) =>
	text(data?.userVerificationStatus)?.toLowerCase() === "complete";

const executeAndFinalize = async (payment: PaymentRow) => {
	if (!payment.bkashPaymentId)
		throw new AppError(409, "Payment was never started at bKash");
	const paymentID = payment.bkashPaymentId;

	const before = await querySafe(paymentID);
	if (isCompleted(before)) return complete(payment, before);

	const exec = await executeSafe(paymentID);
	if (isCompleted(exec)) return complete(payment, exec);

	const after = await querySafe(paymentID);
	if (isCompleted(after)) return complete(payment, after);

	const open =
		text(
			after?.transactionStatus ?? before?.transactionStatus,
		)?.toLowerCase() === "initiated";
	const code = text(exec?.errorCode) ?? text(exec?.statusCode) ?? "";
	if (
		open &&
		(customerVerified(before) || customerVerified(after) || code === "2060")
	) {
		const retry = await executeSafe(paymentID);
		if (isCompleted(retry)) return complete(payment, retry);
		const finalStatus = await querySafe(paymentID);
		if (isCompleted(finalStatus)) return complete(payment, finalStatus);
	}

	await markFailed(
		payment.id,
		bkashMessage(exec ?? after ?? before, "Payment execution failed"),
		exec ?? after ?? before,
	);
	return fresh(payment.id);
};

/** Never trusts client input */
const reconcile = async (payment: PaymentRow) => {
	if (payment.status === PaymentStatus.COMPLETED) return payment;
	if (!payment.bkashPaymentId)
		throw new AppError(409, "Payment was never started at bKash");
	const status = await bkash.queryPayment(payment.bkashPaymentId);
	if (isCompleted(status)) return complete(payment, status);
	const state = text(status.transactionStatus)?.toLowerCase();
	if (
		state === "authorized" ||
		(state === "initiated" && customerVerified(status))
	)
		return executeAndFinalize(payment);
	return payment;
};

// public entry points
/** bKash redirects the customer here */
export const handleCallback = async (id: string, query: CallbackQuery) => {
	const payment = await prisma.payment.findUnique({
		where: { id },
		select: paymentSelect,
	});
	if (!payment) throw new AppError(404, "Payment not found");
	if (payment.status === PaymentStatus.COMPLETED) return payment;
	if (query.paymentID && payment.bkashPaymentId !== query.paymentID)
		throw new AppError(400, "paymentID does not match this payment");

	if (query.status === "success") return executeAndFinalize(payment);

	if (payment.bkashPaymentId) {
		const status = await querySafe(payment.bkashPaymentId);
		if (isCompleted(status)) return complete(payment, status);
		if (query.status !== "cancel" && customerVerified(status))
			return executeAndFinalize(payment);
	}

	if (query.status === "cancel")
		await markFailed(
			id,
			"Cancelled by customer",
			undefined,
			PaymentStatus.CANCELLED,
		);
	else await markFailed(id, "Payment failed at bKash");
	return fresh(id);
};

export const handleWebhook = async (
	paymentID: string,
	secret: string | undefined,
) => {
	const expected = env.BKASH_WEBHOOK_SECRET;
	if (!expected) throw new AppError(503, "Webhook is not configured");
	const a = Buffer.from(secret ?? "");
	const b = Buffer.from(expected);
	if (a.length !== b.length || !timingSafeEqual(a, b))
		throw new AppError(401, "Invalid webhook secret");

	const payment = await prisma.payment.findUnique({
		where: { bkashPaymentId: paymentID },
		select: paymentSelect,
	});
	if (!payment) throw new AppError(404, "Payment not found");
	return reconcile(payment);
};

export const verify = async (id: string, actor: Actor) => {
	const payment = await prisma.payment.findFirst({
		where: { id, ...scope(actor) },
		select: paymentSelect,
	});
	if (!payment) throw new AppError(404, "Payment not found");
	return reconcile(payment);
};

export const list = async (query: ListPaymentsQuery, actor: Actor) => {
	const where: Prisma.PaymentWhereInput = {
		...scope(actor),
		...(query.status ? { status: query.status } : {}),
		...(query.billId ? { billId: query.billId } : {}),
	};
	const [items, total] = await Promise.all([
		prisma.payment.findMany({
			where,
			select: paymentSelect,
			orderBy: { [query.sortBy]: query.order },
			...getSkipTake(query),
		}),
		prisma.payment.count({ where }),
	]);
	return { items, meta: buildMeta(query.page, query.limit, total) };
};

export const getById = async (id: string, actor: Actor) => {
	const payment = await prisma.payment.findFirst({
		where: { id, ...scope(actor) },
		select: paymentSelect,
	});
	if (!payment) throw new AppError(404, "Payment not found");
	return payment;
};
