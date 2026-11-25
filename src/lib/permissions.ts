export type Role = "owner" | "admin" | "manager" | "cashier" | "storekeeper";

export const ROLE_LABELS: Record<Role, string> = {
  owner: "Mmiliki",
  admin: "Msimamizi",
  manager: "Meneja",
  cashier: "Mhudumu wa Mauzo",
  storekeeper: "Msimamizi wa Stoo",
};

export type Permission =
  | "dashboard.view"
  | "sales.use"
  | "sales.history"
  | "sales.discount"
  | "sales.cancel"
  | "products.view"
  | "products.manage"
  | "inventory.view"
  | "inventory.manage"
  | "purchases.view"
  | "purchases.manage"
  | "expenses.view"
  | "expenses.manage"
  | "customers.view"
  | "customers.manage"
  | "reports.view"
  | "team.view"
  | "team.manage"
  | "settings.manage"
  | "demo.reset";

const PERMISSIONS: Record<Role, Permission[]> = {
  owner: [
    "dashboard.view",
    "sales.use",
    "sales.history",
    "sales.discount",
    "sales.cancel",
    "products.view",
    "products.manage",
    "inventory.view",
    "inventory.manage",
    "purchases.view",
    "purchases.manage",
    "expenses.view",
    "expenses.manage",
    "customers.view",
    "customers.manage",
    "reports.view",
    "team.view",
    "team.manage",
    "settings.manage",
    "demo.reset",
  ],
  admin: [
    "dashboard.view",
    "sales.use",
    "sales.history",
    "sales.discount",
    "sales.cancel",
    "products.view",
    "products.manage",
    "inventory.view",
    "inventory.manage",
    "purchases.view",
    "purchases.manage",
    "expenses.view",
    "expenses.manage",
    "customers.view",
    "customers.manage",
    "reports.view",
    "team.view",
    "team.manage",
  ],
  manager: [
    "dashboard.view",
    "sales.use",
    "sales.history",
    "sales.discount",
    "sales.cancel",
    "products.view",
    "products.manage",
    "inventory.view",
    "inventory.manage",
    "purchases.view",
    "purchases.manage",
    "expenses.view",
    "expenses.manage",
    "customers.view",
    "customers.manage",
    "reports.view",
  ],
  cashier: [
    "dashboard.view",
    "sales.use",
    "sales.history",
    "customers.view",
    "customers.manage",
  ],
  storekeeper: [
    "dashboard.view",
    "products.view",
    "products.manage",
    "inventory.view",
    "inventory.manage",
    "purchases.view",
    "purchases.manage",
  ],
};

export function can(role: Role | null | undefined, permission: Permission) {
  if (!role) return false;
  return PERMISSIONS[role]?.includes(permission) ?? false;
}

export function isManagerial(role: Role | null | undefined) {
  return role === "owner" || role === "admin" || role === "manager";
}

export function asRole(value: string | null | undefined): Role | null {
  if (
    value === "owner" ||
    value === "admin" ||
    value === "manager" ||
    value === "cashier" ||
    value === "storekeeper"
  ) {
    return value;
  }

  return null;
}
