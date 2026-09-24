import { useMemo, useState } from "react";
import {
  Alert,
  Button,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Statistic,
  Tag
} from "antd";
import {
  DndContext,
  DragEndEvent,
  DragStartEvent,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors
} from "@dnd-kit/core";
import type { DeliveryOrder } from "../domain/types";
import { useDispatchStore } from "../state/store";
import { DRIVERS } from "../data/storage";
import { DropZone } from "../components/DropZone";
import { OrderCard } from "../components/OrderCard";

interface DragSnapshot {
  orderId: string;
  carriedRevision: number;
  sourceDriver: string | null;
}

export function BoardPage() {
  const orders = useDispatchStore((s) => s.orders);
  const handovers = useDispatchStore((s) => s.handovers);
  const currentUser = useDispatchStore((s) => s.currentUser);
  const setCurrentUser = useDispatchStore((s) => s.setCurrentUser);
  const drop = useDispatchStore((s) => s.drop);
  const depart = useDispatchStore((s) => s.depart);
  const registerHandover = useDispatchStore((s) => s.registerHandover);
  const simulateRemoteSave = useDispatchStore((s) => s.simulateRemoteSave);
  const reloadFromServer = useDispatchStore((s) => s.reloadFromServer);

  const [dragSnapshot, setDragSnapshot] = useState<DragSnapshot | null>(null);
  const [handoverTarget, setHandoverTarget] = useState<DeliveryOrder | null>(null);
  const [handoverForm] = Form.useForm();

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const undeparted = useMemo(() => orders.filter((o) => o.status === "未派").sort((a, b) => a.seq - b.seq), [orders]);
  const byDriver = useMemo(() => {
    const map = new Map<string, { queued: DeliveryOrder[]; departed: DeliveryOrder[] }>();
    for (const driver of DRIVERS) {
      map.set(driver, { queued: [], departed: [] });
    }
    for (const order of orders) {
      if (!order.driver) continue;
      const bucket = map.get(order.driver);
      if (!bucket) continue;
      if (order.status === "已发车") bucket.departed.push(order);
      else bucket.queued.push(order);
    }
    for (const bucket of map.values()) {
      bucket.queued.sort((a, b) => a.seq - b.seq);
      bucket.departed.sort((a, b) => a.seq - b.seq);
    }
    return map;
  }, [orders]);

  function handleDragStart(event: DragStartEvent) {
    const data = event.active.data.current as
      | { orderId: string; carriedRevision: number; sourceDriver: string | null }
      | undefined;
    if (data) setDragSnapshot(data);
  }

  function handleDragEnd(event: DragEndEvent) {
    try {
      const overData = event.over?.data.current as { type: string; container?: string } | undefined;
      const overId = String(event.over?.id ?? "");
      const snapshot = dragSnapshot;
      if (!snapshot || !overData) return;

      const targetDriver: string | null = overData.container === "__pool__" ? null : overData.container ?? null;
      const sourceDriver = snapshot.sourceDriver;

      // 计算目标容器内插入位置
      const targetCards =
        targetDriver === null
          ? undeparted.filter((o) => o.id !== snapshot.orderId)
          : (byDriver.get(targetDriver)?.queued.filter((o) => o.id !== snapshot.orderId) ?? []);
      let targetIndex = targetCards.length;
      if (overData.type === "card" && overId !== snapshot.orderId) {
        const overIndex = targetCards.findIndex((o) => o.id === overId);
        if (overIndex >= 0) targetIndex = overIndex;
      }

      // 原地落回：不产生排班变更，也不增加序号
      const samePlace = sourceDriver === targetDriver && targetIndex === (
        sourceDriver === null
          ? undeparted.findIndex((o) => o.id === snapshot.orderId)
          : byDriver.get(sourceDriver ?? "")?.queued.findIndex((o) => o.id === snapshot.orderId)
      );
      if (samePlace) return;

      drop({
        orderId: snapshot.orderId,
        carriedRevision: snapshot.carriedRevision,
        sourceDriver,
        kind: sourceDriver === targetDriver ? "reorder" : "assign",
        targetDriver,
        targetIndex
      });
    } finally {
      setDragSnapshot(null);
    }
  }

  function openHandover(order: DeliveryOrder) {
    setHandoverTarget(order);
    handoverForm.resetFields();
  }

  async function submitHandover() {
    const values = await handoverForm.validateFields();
    registerHandover({ orderId: handoverTarget!.id, toDriver: values.toDriver, reason: values.reason });
    setHandoverTarget(null);
  }

  const pendingHandovers = handovers.filter((h) => h.status === "待确认");
  const stats = {
    pending: orders.filter((o) => o.status === "未派").length,
    queued: orders.filter((o) => o.status === "已排").length,
    departed: orders.filter((o) => o.status === "已发车").length
  };

  return (
    <div className="board-page">
      <div className="board-toolbar">
        <Space size="large" wrap>
          <Statistic title="未派" value={stats.pending} valueStyle={{ fontSize: 20 }} />
          <Statistic title="已排在途" value={stats.queued} valueStyle={{ fontSize: 20 }} />
          <Statistic title="已发车" value={stats.departed} valueStyle={{ fontSize: 20 }} />
          <Statistic title="待确认移交" value={pendingHandovers.length} valueStyle={{ fontSize: 20, color: pendingHandovers.length ? "#cf1322" : undefined }} />
        </Space>
        <Space>
          <span className="user-label">当前身份</span>
          <Select
            value={currentUser}
            style={{ width: 130 }}
            onChange={setCurrentUser}
            options={[
              { value: "调度员甲", label: "调度员甲" },
              ...DRIVERS.map((d) => ({ value: d, label: d }))
            ]}
          />
          <Button onClick={reloadFromServer}>重新载入最新数据</Button>
        </Space>
      </div>

      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 14 }}
        message="拖动开始时卡片会带上修订序号，落子与当前序号核对；序号不一致则本次操作进冲突区，排班不变。已发车的单子不能拖动，只能由原司机登记移交。可点“模拟他端+1”或再开一个浏览器标签页同时排班来复现。"
      />

      <DndContext sensors={sensors} collisionDetection={pointerWithin} onDragStart={handleDragStart} onDragEnd={handleDragEnd} onDragCancel={() => setDragSnapshot(null)}>
        <div className="board-columns">
          <section className="board-column pool-column">
            <div className="column-head">
              <h3>未派池</h3>
              <Tag>{undeparted.length}</Tag>
            </div>
            <DropZone id="zone-pool" container="__pool__" emptyText="把单子拖回这里">
              {undeparted.map((order) => (
                <OrderCard
                  key={order.id}
                  order={order}
                  onDepart={(o) => depart(o.id)}
                  onBumpRevision={(o) => simulateRemoteSave(o.id)}
                />
              ))}
            </DropZone>
          </section>

          {DRIVERS.map((driver) => {
            const bucket = byDriver.get(driver)!;
            return (
              <section className="board-column" key={driver}>
                <div className="column-head">
                  <h3>{driver}</h3>
                  <Tag color="blue">{bucket.queued.length} 已排</Tag>
                  <Tag color="green">{bucket.departed.length} 发车</Tag>
                </div>
                <DropZone id={`zone-${driver}`} container={driver} emptyText="拖到司机名下班单">
                  {bucket.queued.map((order) => (
                    <OrderCard
                      key={order.id}
                      order={order}
                      onDepart={(o) => depart(o.id)}
                      onBumpRevision={(o) => simulateRemoteSave(o.id, driver === "刘师傅" ? "赵师傅" : "刘师傅")}
                    />
                  ))}
                </DropZone>
                {bucket.departed.length > 0 && (
                  <div className="departed-block">
                    <p className="block-title">已发车（不可拖动）</p>
                    {bucket.departed.map((order) => (
                      <OrderCard
                        key={order.id}
                        order={order}
                        departed
                        canHandover={currentUser === driver}
                        onHandover={openHandover}
                      />
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      </DndContext>

      <Modal
        title={handoverTarget ? `登记在途移交 · ${handoverTarget.orderNo}` : ""}
        open={handoverTarget !== null}
        onCancel={() => setHandoverTarget(null)}
        onOk={submitHandover}
        okText="登记移交"
        cancelText="取消"
      >
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 12 }}
          message={`原司机：${handoverTarget?.driver}（以当前身份登记）`}
          description="登记后占用不立即变化，需承接司机确认后才换占用。"
        />
        <Form form={handoverForm} layout="vertical">
          <Form.Item name="toDriver" label="承接司机" rules={[{ required: true, message: "请选择承接司机" }]}>
            <Select
              placeholder="请选择承接司机"
              options={DRIVERS.filter((d) => d !== handoverTarget?.driver).map((d) => ({ value: d, label: d }))}
            />
          </Form.Item>
          <Form.Item name="reason" label="移交原因" rules={[{ required: true, message: "请填写移交原因" }]}>
            <Input.TextArea rows={3} placeholder="如：车辆故障 / 路线调整 / 司机身体不适" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
