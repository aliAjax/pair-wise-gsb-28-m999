// 固定基础资料：司机、可登录身份（调度员 / 司机）、种子配送单

import { DeliveryOrder, Driver } from "./types";

export const DRIVERS: Driver[] = [
  { id: "liu", name: "刘师傅" },
  { id: "zhao", name: "赵师傅" },
  { id: "sun", name: "孙师傅" }
];

export interface Identity {
  id: string;
  name: string;
  kind: "dispatcher" | "driver";
  /** 司机身份绑定的司机 id */
  driverId?: string;
}

export const IDENTITIES: Identity[] = [
  { id: "dispatcher-a", name: "调度员甲（1号电脑）", kind: "dispatcher" },
  { id: "dispatcher-b", name: "调度员乙（2号电脑）", kind: "dispatcher" },
  { id: "driver-liu", name: "刘师傅", kind: "driver", driverId: "liu" },
  { id: "driver-zhao", name: "赵师傅", kind: "driver", driverId: "zhao" },
  { id: "driver-sun", name: "孙师傅", kind: "driver", driverId: "sun" }
];

export function driverName(driverId: string | null | undefined): string {
  if (!driverId) return "未派";
  return DRIVERS.find((d) => d.id === driverId)?.name ?? "未知司机";
}

export function seedOrders(): DeliveryOrder[] {
  const now = Date.now();
  const day = 86400000;
  const mk = (
    id: string,
    orderNo: string,
    revision: number,
    status: DeliveryOrder["status"],
    driverId: string | null,
    weight: number,
    destination: string,
    rank: number,
    note: string,
    daysAgo: number
  ): DeliveryOrder => ({
    id,
    orderNo,
    revision,
    status,
    driverId,
    weight,
    destination,
    rank,
    note,
    createdAt: new Date(now - daysAgo * day).toISOString(),
    updatedAt: new Date(now - daysAgo * day + 3600000).toISOString()
  });

  return [
    mk("seed-1", "ORD-9012", 3, "assigned", "liu", 260, "浦东", 1024, "上午配送", 2),
    mk("seed-2", "ORD-9031", 1, "unassigned", null, 140, "嘉定", 1024, "待排班", 1),
    mk("seed-3", "ORD-9045", 5, "departed", "zhao", 320, "昆山", 1024, "在途，收货人下午在店", 1),
    mk("seed-4", "ORD-9052", 2, "assigned", "sun", 180, "松江", 1024, "冷链优先", 1),
    mk("seed-5", "ORD-9060", 1, "unassigned", null, 90, "青浦", 2048, "等客户确认时间", 0),
    mk("seed-6", "ORD-9077", 2, "assigned", "liu", 410, "南汇", 2048, "重货需帮手", 0)
  ];
}
