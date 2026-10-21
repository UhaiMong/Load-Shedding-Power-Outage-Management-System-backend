import type { Prisma } from "../../generated/prisma/client";

import type { Role } from "../../generated/prisma/enums";

export type Db = Prisma.TransactionClient;

export interface Actor {
	id: string | null | undefined | number;
	role: Role;
	ip?: string;
}

interface Entry {
	action: string;
	entity: string;
	entityId?: string;
	metadata?: Prisma.InputJsonValue;
}

/** Writes an audit trail row. Pass a transaction client to make it atomic with the change. */
export const audit = (
	db: Db,
	actor: Pick<Actor, "id" | "ip"> | null,
	entry: Entry,
) =>
	db.auditLog.create({
		data: {
			...entry,
			actorId: actor?.id == null ? null : String(actor.id),
			...(actor?.ip === undefined ? {} : { ipAddress: actor.ip }),
		} satisfies Prisma.AuditLogUncheckedCreateInput,
	});
