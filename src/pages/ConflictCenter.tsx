import { Alert, App as AntApp, Button, Empty, Segmented, Table, Tag } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useMemo, useState } from "react";
import { driverName } from "../data";
import {
  conflictStatusText,
  handoverStatusText,
  targetText,
  useBoardStore
} from "../store";
import { ConflictRecord, HandoverRequest } from "../types";
import { formatFullTime } from "../utils";

type FilterKey = "open" | "retried" | "ignored" | "all";

export default function ConflictCenter() {
  const { message } = AntApp.useApp();
  const conflicts = useBoardStore((s) => s.conflicts);
  const handovers = useBoardStore((s) => s.handovers);
  const orders = useBoardStore((s) => s.orders);
  const retryConflict = useBoardStore((s) => s.retryConflict);
  const ignoreConflict = useBoardStore((s) => s.ignoreConflict);
  const resolveHandover = useBoardStore((s) => s.resolveHandover);
  const identity = useBoardStore((s) => s.identity);

  const [filter, setFilter] = useState<FilterKey>("open");

  const orderOf = (orderId: string) => orders.find((o) => o.id === orderId);

  const visibleConflicts = useMemo(
    () =>
      conflicts
        .filter((c) => (filter === "all" ? true : c.status === filter))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [conflicts, filter]
  );

  const openCount = conflicts.filter((c) => c.status === "open").length;

  const conflictColumns: ColumnsType<ConflictRecord> = [
    {
      title: "单号",
      dataIndex: "orderNo",
      width: 120,
      render: (no: string, record) => {
        const gone = !orderOf(record.orderId);
        return (
          <>
            <strong>{no}</strong>
            {gone && <Tag color="default" className="ml4">已删除</Tag>}
          </>
        );
      }
    },
    {
      title: "原司机（本地快照）",
      dataIndex: "baseDriverId",
      width: 140,
      render: (driverId: string | null) => driverName(driverId)
    },
    {
      title: "本地序号",
      dataIndex: "baseRevision",
      width: 90,
      render: (rev: number) => <Tag># {rev}</Tag>
    },
    {
      title: "当前序号（服务端）",
      dataIndex: "currentRevision",
      width: 130,
      render: (rev: number) => <Tag color="red"># {rev}</Tag>
    },
    {
      title: "当前占用",
      dataIndex: "currentDriverId",
      width: 110,
      render: (driverId: string | null) => driverName(driverId)
    },
    {
      title: "本次操作目标",
      dataIndex: "target",
      width: 130,
      render: (target: ConflictRecord["target"]) => targetText(target)
    },
    { title: "冲突原因", dataIndex: "reason", ellipsis: true },
    { title: "操作人", dataIndex: "operator", width: 150, ellipsis: true },
    { title: "发生时间", dataIndex: "createdAt", width: 150, render: (t: string) => formatFullTime(t) },
    {
      title: "状态",
      dataIndex: "status",
      width: 110,
      render: (status: ConflictRecord["status"]) => (
        <Tag color={status === "open" ? "volcano" : status === "retried" ? "green" : "default"}>
          {conflictStatusText(status)}
        </Tag>
      )
    },
    {
      title: "处理",
      width: 170,
      fixed: "right",
      render: (_, record) =>
        record.status === "open" ? (
          <>
            <Button
              size="small"
              type="primary"
              onClick={() => {
                const result = retryConflict(record.id);
                if (result.ok) message.success(`已按当前序号重试，${record.orderNo} 放到目标列尾`);
                else message.warning(result.error ?? "重试失败");
              }}
            >
              按当前序号重试
            </Button>
            <Button size="small" style={{ marginLeft: 6 }} onClick={() => ignoreConflict(record.id)}>
              忽略
            </Button>
          </>
        ) : (
          <span className="muted">已留痕</span>
        )
    }
  ];

  const handoverColumns: ColumnsType<HandoverRequest> = [
    {
      title: "单号",
      width: 120,
      render: (_, record) => orderOf(record.orderId)?.orderNo ?? record.orderId
    },
    { title: "原司机", width: 100, render: (_, r) => driverName(r.fromDriverId) },
    { title: "承接司机", width: 100, render: (_, r) => driverName(r.toDriverId) },
    { title: "移交原因", dataIndex: "reason", ellipsis: true },
    { title: "登记时间", dataIndex: "createdAt", width: 150, render: (t: string) => formatFullTime(t) },
    {
      title: "处理时间",
      dataIndex: "decidedAt",
      width: 150,
      render: (t?: string) => (t ? formatFullTime(t) : "—")
    },
    {
      title: "状态",
      dataIndex: "status",
      width: 130,
      render: (status: HandoverRequest["status"]) => (
        <Tag color={status === "pending" ? "orange" : status === "accepted" ? "green" : "default"}>
          {handoverStatusText(status)}
        </Tag>
      )
    },
    {
      title: "承接方操作",
      width: 170,
      render: (_, record) => {
        if (record.status !== "pending") return <span className="muted">流程已结束</span>;
        const isTarget = identity.kind === "driver" && identity.driverId === record.toDriverId;
        if (!isTarget)
          return <span className="muted">需 {driverName(record.toDriverId)} 登录确认</span>;
        return (
          <>
            <Button
              size="small"
              type="primary"
              onClick={() => {
                const result = resolveHandover(record.id, true);
                if (result.ok) message.success("已确认承接，占用已更换");
                else message.warning(result.error ?? "操作失败");
              }}
            >
              确认承接
            </Button>
            <Button
              size="small"
              danger
              style={{ marginLeft: 6 }}
              onClick={() => {
                const result = resolveHandover(record.id, false);
                if (result.ok) message.info("已拒绝，占用保持不变");
                else message.warning(result.error ?? "操作失败");
              }}
            >
              拒绝
            </Button>
          </>
        );
      }
    }
  ];

  return (
    <div className="conflict-page">
      <Alert
        type="warning"
        showIcon
        className="board-alert"
        message="冲突区：晚保存不会盖掉先排结果"
        description="拖拽提交时若发现配送单修订序号已被另一台电脑推进，这次操作整笔转入此处，保留单号、原司机、本地/当前序号与目标位置；刷新重开记录仍在。与对方核对后可按当前序号重放到目标列尾，或忽略留痕。"
      />

      <section className="panel-block">
        <div className="block-head">
          <h2>排班冲突记录</h2>
          <Segmented<FilterKey>
            value={filter}
            onChange={(value) => setFilter(value)}
            options={[
              { label: `待处理 ${openCount}`, value: "open" },
              { label: "已重试", value: "retried" },
              { label: "已忽略", value: "ignored" },
              { label: "全部", value: "all" }
            ]}
          />
        </div>

        {conflicts.length === 0 ? (
          <Empty description="暂无冲突：序号一致的排班都会直接生效" />
        ) : (
          <Table<ConflictRecord>
            rowKey="id"
            size="small"
            scroll={{ x: 1500 }}
            columns={conflictColumns}
            dataSource={visibleConflicts}
            pagination={{ pageSize: 8, showSizeChanger: false }}
          />
        )}
      </section>

      <section className="panel-block">
        <div className="block-head">
          <h2>在途移交登记</h2>
          <span className="muted">已发车的单子不能拖动，原司机登记、承接方确认后才换占用</span>
        </div>
        {handovers.length === 0 ? (
          <Empty description="暂无移交登记" />
        ) : (
          <Table<HandoverRequest>
            rowKey="id"
            size="small"
            scroll={{ x: 1100 }}
            columns={handoverColumns}
            dataSource={[...handovers].sort((a, b) => b.createdAt.localeCompare(a.createdAt))}
            pagination={{ pageSize: 8, showSizeChanger: false }}
          />
        )}
      </section>
    </div>
  );
}
