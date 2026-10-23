import type { Prisma } from "../../../generated/prisma/client.js";
import { BillStatus, Role } from "../../../generated/prisma/enums.js";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../utils/ApiError.js";
import { type Actor, audit } from "../../utils/audit.js";
import { fireAndForget, formatDateTime } from "../../utils/helpers.js";
import { buildMeta, getSkipTake } from "../../utils/pagination.js";
import { calculateBill } from "../../utils/tariff.js";
import { notifyUsers } from "../notification/notification.service.js";
import type { CreateBillInput, ListBillsQuery } from "./bill.validator.js";

const billSelect = {
  id: true,
  billingMonth: true,
  units: true,
  amount: true,
  breakdown: true,
  dueDate: true,
  status: true,
  paidAt: true,
  createdAt: true,
  customer: { select: { id: true, name: true, email: true } },
} satisfies Prisma.BillSelect;

type BillWhereInput = NonNullable<
  NonNullable<Parameters<typeof prisma.bill.findMany>[0]>["where"]
>;

const scope = (actor: Actor): BillWhereInput =>
  actor.role === Role.CUSTOMER ? { customerId: actor.id as string } : {};

export const create = async (input: CreateBillInput, actor: Actor) => {
  const customer = await prisma.user.findFirst({
    where: {
      id: input.customerId,
      role: Role.CUSTOMER,
      isActive: true,
      deletedAt: null,
    },
    select: { id: true },
  });
  if (!customer) throw new AppError(404, "Customer not found");

  const duplicate = await prisma.bill.findUnique({
    where: {
      customerId_billingMonth: {
        customerId: input.customerId,
        billingMonth: input.billingMonth,
      },
    },
    select: { id: true },
  });
  if (duplicate)
    throw new AppError(
      409,
      "A bill already exists for this customer and month",
    );

  const { amount, breakdown } = calculateBill(input.units);
  const bill = await prisma.$transaction(async (tx) => {
    const created = await tx.bill.create({
      data: {
        customerId: input.customerId,
        billingMonth: input.billingMonth,
        units: input.units,
        dueDate: input.dueDate,
        amount,
        breakdown,
      },
      select: billSelect,
    });
    await audit(tx as unknown as Parameters<typeof audit>[0], actor, {
      action: "BILL_CREATED",
      entity: "Bill",
      entityId: created.id,
      metadata: { amount },
    });
    return created;
  });

  fireAndForget(() =>
    notifyUsers([input.customerId], {
      type: "BILLING",
      title: `Electricity bill ${input.billingMonth}`,
      message: `Amount ${amount} BDT, due ${formatDateTime(input.dueDate)}.`,
      refId: bill.id,
    }),
  );
  return bill;
};

export const list = async (query: ListBillsQuery, actor: Actor) => {
  const where: BillWhereInput = {
    deletedAt: null,
    ...scope(actor),
    ...(query.status ? { status: query.status } : {}),
    ...(query.month ? { billingMonth: query.month } : {}),
    ...(query.customerId && actor.role !== Role.CUSTOMER
      ? { customerId: query.customerId }
      : {}),
  };
  const [items, total] = await Promise.all([
    prisma.bill.findMany({
      where,
      select: billSelect,
      orderBy: { [query.sortBy]: query.order },
      ...getSkipTake(query),
    }),
    prisma.bill.count({ where }),
  ]);
  return { items, meta: buildMeta(query.page, query.limit, total) };
};

export const getById = async (id: string, actor: Actor) => {
  const bill = await prisma.bill.findFirst({
    where: { id, deletedAt: null, ...scope(actor) },
    select: {
      ...billSelect,
      payments: {
        select: {
          id: true,
          status: true,
          amount: true,
          trxId: true,
          paidAt: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });
  if (!bill) throw new AppError(404, "Bill not found");
  return bill;
};

export const softDelete = async (id: string, actor: Actor) => {
  const { count } = await prisma.bill.updateMany({
    where: { id, deletedAt: null, status: BillStatus.UNPAID },
    data: { deletedAt: new Date() },
  });
  if (count === 0) throw new AppError(409, "Bill not found or already paid");
  await audit(prisma as unknown as Parameters<typeof audit>[0], actor, {
    action: "BILL_DELETED",
    entity: "Bill",
    entityId: id,
  });
  return { deleted: true };
};
