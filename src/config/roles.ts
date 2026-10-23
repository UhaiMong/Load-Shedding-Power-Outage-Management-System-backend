import { Role } from "../../generated/prisma/enums.js";

export { Role };

/** Central permission groups */
export const ROLE_GROUPS = {
  ADMIN: [Role.ADMIN],
  MANAGEMENT: [Role.ZONE_MANAGER, Role.ADMIN],
  STAFF: [Role.OPERATOR, Role.ZONE_MANAGER, Role.ADMIN],
  BILLING: [Role.OPERATOR, Role.ADMIN],
  CUSTOMER: [Role.CUSTOMER],
  TECHNICIAN: [Role.TECHNICIAN],
  ALL: Object.values(Role),
} as const;
