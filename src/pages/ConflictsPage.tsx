import { useMemo } from "react";
import { Alert, Button, Empty, Popconfirm, Space, Table, Tag } from "antd";
import type { ColumnsType } from "antd/es/table";
import type { ConflictRecord, HandoverRequest } from "../domain/types";
import { useDispatchStore } from "../state/store";

function driverText(driver: string | null) {
  return driver ?? "未派池";
}

export function ConflictsPage() {
  const conflicts = useDispatchStore((s) => s.conflicts);
  const handovers = useDispatchStore((s) => s.handovers);
  const currentUser = useDispatchStore((s) => s.currentUser);
  const resolveConflict = useDispatchStore((s) => s.resolveConflict);
  const clearResolved = useDispatchStore((s) => s.clearResolvedConflicts);
  const handleHandover = useDispatchStore((s) => s.handleHandover);

  const pendingCount = useMemo(() => conflicts.filter((c) => !c.resolved).length, [conflicts]);
  const pendingHandovers = useMemo(() => handovers.filter((h) => h.status === "待确认"), [handovers]);

  const conflictColumns: ColumnsType<ConflictRecord> = [
    { title: "单号", dataIndex: "orderNo", key: "orderNo", width: 130, render: (v: string) => <strong>{v}</strong> },
    {
      title: "原司机",
      dataIndex: "originalDriver",
      key: "originalDriver",
      width: 110,
      render: (driver: string | null) => <Tag>{driverText(driver)}</Tag>
    },
    {
      title: "携带序号",
      dataIndex: "carriedRevision",
      key: "carriedRevision",
      width: 90,
      render: (v: number) => <Tag color="default">rev {v}</Tag>
    },
    {
      title: "当前序号",
      dataIndex: "currentRevision",
      key: "currentRevision",
      width: 90,
      render: (v: number) => <Tag color="red">rev {v}</Tag>
    },
    {
      title: "当前实际占用",
      dataIndex: "currentDriver",
      key: "currentDriver",
      width: 120,
      render: (driver: string | null) => driverText(driver)
    },
    { title: "本次被拦下的操作", dataIndex: "attemptedAction", key: "attemptedAction" },
    {
      title: "发生时间",
      dataIndex: "createdAt",
      key: "createdAt",
      width: 170,
      render: (v: string) => new Date(v).toLocaleString()
    },
    {
      title: "状态",
      dataIndex: "resolved",
      key: "resolved",
      width: 90,
      render: (resolved: boolean) => (resolved ? <Tag color="green">已核对</Tag> : <Tag color="volcano">待处理</Tag>)
    },
    {
      title: "操作",
      key: "action",
      width: 100,
      render: (_, record) =>
        record.resolved ? null : (
          <Button size="small" onClick={() => resolveConflict(record.id)}>
            已核对
          </Button>
        )
    }
  ];

  const handoverColumns: ColumnsType<HandoverRequest> = [
    { title: "单号", dataIndex: "orderNo", key: "orderNo", width: 130, render: (v: string) => <strong>{v}</strong> },
    { title: "原司机", dataIndex: "fromDriver", key: "fromDriver", width: 100 },
    { title: "承接司机", dataIndex: "toDriver", key: "toDriver", width: 100 },
    { title: "移交原因", dataIndex: "reason", key: "reason" },
    {
      title: "状态",
      dataIndex: "status",
      key: "status",
      width: 100,
      render: (status: HandoverRequest["status"]) => {
        const color = status === "待确认" ? "orange" : status === "已确认" ? "green" : "default";
        return <Tag color={color}>{status}</Tag>;
      }
    },
    {
      title: "发起时间",
      dataIndex: "createdAt",
      key: "createdAt",
      width: 170,
      render: (v: string) => new Date(v).toLocaleString()
    },
    {
      title: "承接确认",
      key: "action",
      width: 170,
      render: (_, record) => {
        if (record.status !== "待确认") return <span className="muted">{record.handledAt ? new Date(record.handledAt).toLocaleString() : "—"}</span>;
        const isTarget = record.toDriver === currentUser;
        return (
          <Space>
            <Button size="small" type="primary" disabled={!isTarget} onClick={() => handleHandover(record.id, "confirm")}>
              确认承接
            </Button>
            <Popconfirm
              title="拒绝该移交申请？"
              onConfirm={() => handleHandover(record.id, "reject")}
            >
              <Button size="small" danger disabled={!isTarget}>
                拒绝
              </Button>
            </Popconfirm>
            {!isTarget && <span className="muted">需 {record.toDriver} 操作</span>}
          </Space>
        );
      }
    }
  ];

  return (
    <div className="conflicts-page">
      <Alert
        type="warning"
        showIcon
        style={{ marginBottom: 14 }}
        message={`冲突区共 ${conflicts.length} 条，待处理 ${pendingCount} 条；在途移交待确认 ${pendingHandovers.length} 条。`}
        description="落子时携带的修订序号与当前序号不一致即记入此处，冲突不会覆盖先排结果；处理完请点“已核对”。记录重新打开页面后仍保留。"
      />

      <section className="conflict-section">
        <div className="section-head">
          <h3>排班冲突区</h3>
          {conflicts.some((c) => c.resolved) && (
            <Button size="small" onClick={clearResolved}>清理已核对</Button>
          )}
        </div>
        {conflicts.length === 0 ? (
          <Empty description="暂无冲突记录" />
        ) : (
          <Table rowKey="id" size="middle" columns={conflictColumns} dataSource={conflicts} pagination={false} scroll={{ x: 1000 }} />
        )}
      </section>

      <section className="conflict-section">
        <h3>在途移交记录</h3>
        {handovers.length === 0 ? (
          <Empty description="暂无移交记录" />
        ) : (
          <Table rowKey="id" size="middle" columns={handoverColumns} dataSource={handovers} pagination={false} scroll={{ x: 1000 }} />
        )}
      </section>
    </div>
  );
}
