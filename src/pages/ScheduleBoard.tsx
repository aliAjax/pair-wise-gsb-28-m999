import {
  closestCorners,
  DndContext,
  DragEndEvent,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors
} from "@dnd-kit/core";
import { Alert, App as AntApp, Button, Empty, Select, Tag, Tooltip } from "antd";
import { useMemo, useState } from "react";
import HandoverModal from "../components/HandoverModal";
import OrderCard from "../components/OrderCard";
import { DRIVERS, driverName } from "../data";
import { useBoardStore } from "../store";
import {
  DeliveryOrder,
  HandoverRequest,
  ScheduleTarget
} from "../types";

interface ColumnDef {
  key: string;
  driverId: string | null;
  title: string;
}

const COLUMNS: ColumnDef[] = [
  { key: "unassigned", driverId: null, title: "未派区" },
  ...DRIVERS.map((d) => ({ key: d.id, driverId: d.id, title: d.name }))
];

function DropColumn({
  column,
  orders,
  children
}: {
  column: ColumnDef;
  orders: DeliveryOrder[];
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `col:${column.key}` });
  const departedCount = orders.filter((o) => o.status === "departed").length;
  return (
    <section ref={setNodeRef} className={`schedule-column${isOver ? " column-over" : ""}`}>
      <header className="schedule-column-head">
        <strong>{column.title}</strong>
        <span className="column-count">
          {orders.length} 单
          {departedCount > 0 && <Tag color="red" className="departed-mini">在途 {departedCount}</Tag>}
        </span>
      </header>
      <div className="schedule-column-body">
        {orders.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="拖到此处" /> : children}
      </div>
    </section>
  );
}

export default function ScheduleBoard() {
  const { message, modal } = AntApp.useApp();
  const orders = useBoardStore((s) => s.orders);
  const handovers = useBoardStore((s) => s.handovers);
  const identity = useBoardStore((s) => s.identity);
  const serverNotice = useBoardStore((s) => s.serverNotice);
  const pullFromServer = useBoardStore((s) => s.pullFromServer);
  const submitSchedule = useBoardStore((s) => s.submitSchedule);
  const markDeparted = useBoardStore((s) => s.markDeparted);
  const registerHandover = useBoardStore((s) => s.registerHandover);
  const resolveHandover = useBoardStore((s) => s.resolveHandover);
  const simulateRemoteEdit = useBoardStore((s) => s.simulateRemoteEdit);

  const [handoverOrder, setHandoverOrder] = useState<DeliveryOrder | null>(null);
  const [simulateOrderId, setSimulateOrderId] = useState<string | undefined>(undefined);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  const ordersByDriver = useMemo(() => {
    const map = new Map<string | null, DeliveryOrder[]>();
    for (const column of COLUMNS) map.set(column.driverId, []);
    for (const order of orders) {
      const key = order.driverId;
      map.get(key)?.push(order);
    }
    for (const list of map.values()) list.sort((a, b) => a.rank - b.rank);
    return map;
  }, [orders]);

  const handoverMap = useMemo(() => {
    // 每个单取最新一条；有待确认时优先显示待确认
    const map = new Map<string, HandoverRequest>();
    const byOrder = new Map<string, HandoverRequest[]>();
    for (const h of handovers) {
      const list = byOrder.get(h.orderId) ?? [];
      list.push(h);
      byOrder.set(h.orderId, list);
    }
    for (const [orderId, list] of byOrder) {
      const pending = list.find((h) => h.status === "pending");
      const latest = [...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
      map.set(orderId, pending ?? latest);
    }
    return map;
  }, [handovers]);

  const stats = useMemo(
    () => ({
      unassigned: orders.filter((o) => o.status === "unassigned").length,
      assigned: orders.filter((o) => o.status === "assigned").length,
      departed: orders.filter((o) => o.status === "departed").length,
      pendingHandovers: handovers.filter((h) => h.status === "pending").length
    }),
    [orders, handovers]
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;

    const activeId = String(active.id).replace(/^order:/, "");
    const overId = String(over.id);
    const order = orders.find((o) => o.id === activeId);
    if (!order) return;

    // 拖拽开始时的本地快照序号：拖放期间他端若已保存，这里就会与服务端不一致
    const snapshot = active.data.current as { revision: number; driverId: string | null } | undefined;
    const baseRevision = snapshot?.revision ?? order.revision;
    const baseDriverId = snapshot?.driverId ?? order.driverId;

    let targetDriverId: string | null;
    let index: number;

    if (overId.startsWith("col:")) {
      const columnKey = overId.replace(/^col:/, "");
      targetDriverId = columnKey === "unassigned" ? null : columnKey;
      index = (ordersByDriver.get(targetDriverId) ?? []).length;
    } else if (overId.startsWith("order:")) {
      const overOrderId = overId.replace(/^order:/, "");
      const overOrder = orders.find((o) => o.id === overOrderId);
      if (!overOrder) return;
      targetDriverId = overOrder.driverId;
      const siblings = (ordersByDriver.get(targetDriverId) ?? []).filter((o) => o.id !== activeId);
      index = siblings.findIndex((o) => o.id === overOrderId);
      if (index < 0) index = siblings.length;
    } else {
      return;
    }

    // 同列且落点与原位置一致：没有调整，直接忽略
    if (targetDriverId === order.driverId) {
      const currentIndex = (ordersByDriver.get(targetDriverId) ?? []).findIndex((o) => o.id === activeId);
      if (index === currentIndex) return;
    }

    const target: ScheduleTarget =
      targetDriverId === null ? { kind: "unassigned" } : { kind: "driver", driverId: targetDriverId };

    const result = submitSchedule({ orderId: activeId, baseRevision, baseDriverId, target, index });
    if (result.ok) {
      message.success(
        targetDriverId === order.driverId
          ? `已调整 ${order.orderNo} 的顺序，序号 ${baseRevision} → ${baseRevision + 1}`
          : `已排班：${order.orderNo} → ${driverName(targetDriverId)}`
      );
    } else {
      message.warning(result.error ?? "操作未生效");
    }
  }

  function handleDepart(orderId: string) {
    const result = markDeparted(orderId);
    if (result.ok) message.success("已登记发车，该单进入在途并锁定拖拽");
    else message.warning(result.error ?? "操作失败");
  }

  function handleRegister(orderId: string, toDriverId: string, reason: string) {
    const result = registerHandover(orderId, toDriverId, reason);
    if (result.ok) message.success("移交已登记，等待承接司机确认后才会换占用");
    else message.warning(result.error ?? "登记失败");
  }

  function handleResolve(handoverId: string, accept: boolean) {
    const result = resolveHandover(handoverId, accept);
    if (result.ok) message.success(accept ? "已确认承接，占用已更换" : "已拒绝移交，占用保持不变");
    else message.warning(result.error ?? "操作失败");
  }

  function handleSimulate() {
    modal.confirm({
      title: "模拟另一台电脑抢先保存",
      content:
        "将以“2号电脑”身份推进所选单据的修订序号。随后你在本页的下一次拖放会因序号不一致而落入冲突区。确定继续？",
      okText: "模拟他端改动",
      cancelText: "取消",
      onOk: () => {
        const result = simulateRemoteEdit(simulateOrderId);
        if (result.ok) {
          message.info(`2号电脑已改动 ${result.orderNo}，现在可尝试拖动该单查看冲突`);
        }
      }
    });
  }

  return (
    <div className="schedule-page">
      <Alert
        type="info"
        showIcon
        className="board-alert"
        message="双人排单与冲突核对"
        description={
          <ul className="board-tips">
            <li>每张配送单带修订序号，拖到司机名下或调整顺序提交时都会核对；序号已被另一台电脑推进时，本次操作进冲突区，单据位置不被覆盖。</li>
            <li>在浏览器另开一个标签页即“2号电脑”，两边拖动同一张单即可复现“晚保存覆盖先排结果”；也可用下方按钮一键模拟。</li>
            <li>在途单已锁定不可拖动；由原司机登记承接司机与移交原因，承接司机登录确认后才换占用。</li>
          </ul>
        }
      />

      <div className="schedule-toolbar">
        <div className="schedule-stats">
          <span className="stat-chip blue">未派 {stats.unassigned}</span>
          <span className="stat-chip cyan">已派未发车 {stats.assigned}</span>
          <span className="stat-chip red">在途 {stats.departed}</span>
          <span className="stat-chip orange">待确认移交 {stats.pendingHandovers}</span>
        </div>
        <div className="simulate-box">
          <Select
            allowClear
            placeholder="选择一张单（默认自动）"
            style={{ width: 220 }}
            value={simulateOrderId}
            onChange={(value) => setSimulateOrderId(value)}
            options={orders.map((o) => ({
              value: o.id,
              label: `${o.orderNo}（${driverName(o.driverId)} · #${o.revision}）`
            }))}
          />
          <Tooltip title="模拟2号调度电脑先保存了排班或资料，使服务端序号 +1">
            <Button onClick={handleSimulate}>模拟他端抢先保存</Button>
          </Tooltip>
        </div>
      </div>

      {serverNotice && (
        <Alert
          className="remote-tick"
          type="warning"
          showIcon
          message={serverNotice}
          action={
            <Button size="small" type="primary" onClick={() => { pullFromServer(); message.success("已拉取服务端最新排班"); }}>
              拉取最新排班
            </Button>
          }
        />
      )}

      <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={handleDragEnd}>
        <div className="schedule-grid">
          {COLUMNS.map((column) => {
            const columnOrders = ordersByDriver.get(column.driverId) ?? [];
            return (
              <DropColumn key={column.key} column={column} orders={columnOrders}>
                {columnOrders.map((order) => (
                  <OrderCard
                    key={order.id}
                    order={order}
                    handover={handoverMap.get(order.id)}
                    identity={identity}
                    onDepart={handleDepart}
                    onRegisterHandover={setHandoverOrder}
                    onResolveHandover={handleResolve}
                  />
                ))}
              </DropColumn>
            );
          })}
        </div>
      </DndContext>

      <HandoverModal
        order={handoverOrder}
        onClose={() => setHandoverOrder(null)}
        onSubmit={handleRegister}
      />
    </div>
  );
}
