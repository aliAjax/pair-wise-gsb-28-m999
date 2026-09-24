import { App as AntApp, Badge, ConfigProvider, Select, Tabs, Tag } from "antd";
import zhCN from "antd/locale/zh_CN";
import { useEffect, useMemo, useRef, useState } from "react";
import ConflictCenter from "./pages/ConflictCenter";
import OrderDataPage from "./pages/OrderDataPage";
import ScheduleBoard from "./pages/ScheduleBoard";
import { IDENTITIES } from "./data";
import { bindRemoteSync, useBoardStore } from "./store";

type TabKey = "schedule" | "data" | "conflict";

function Shell() {
  const { message } = AntApp.useApp();
  const identityId = useBoardStore((s) => s.identityId);
  const setIdentity = useBoardStore((s) => s.setIdentity);
  const stationId = useBoardStore((s) => s.stationId);
  const openConflicts = useBoardStore((s) => s.conflicts.filter((c) => c.status === "open").length);
  const [activeTab, setActiveTab] = useState<TabKey>("schedule");

  // 订阅另一台电脑（其它标签页）的保存：真相更新后，下一次拖放即按新序号核对
  useEffect(() => bindRemoteSync(), []);

  // 他端写入的新冲突记录会实时合并进来，提醒调度员去冲突区处理
  const knownConflictsRef = useRef<Set<string> | null>(null);
  const conflicts = useBoardStore((s) => s.conflicts);
  useEffect(() => {
    const ids = new Set(conflicts.map((c) => c.id));
    if (knownConflictsRef.current === null) {
      knownConflictsRef.current = ids;
      return;
    }
    const known = knownConflictsRef.current;
    const arrived = conflicts.filter((c) => !known.has(c.id));
    if (arrived.length > 0) {
      message.warning(`另一台电脑有 ${arrived.length} 条排班操作因序号冲突落入冲突区`);
    }
    knownConflictsRef.current = ids;
  }, [conflicts, message]);

  const tabItems = useMemo(
    () => [
      { key: "schedule", label: "排班拖拽", children: <ScheduleBoard /> },
      { key: "data", label: "配送资料", children: <OrderDataPage /> },
      {
        key: "conflict",
        label: (
          <Badge count={openConflicts} size="small" offset={[10, -2]}>
            冲突区
          </Badge>
        ),
        children: <ConflictCenter />
      }
    ],
    [openConflicts]
  );

  return (
    <main className="app">
      <div className="shell">
        <header className="topbar">
          <div>
            <p className="eyebrow">物流 · 双人调度乐观锁</p>
            <h1>配送任务拖拽排班</h1>
            <p className="subtitle">
              配送单携带修订序号进入排班，拖放时核对序号；序号不一致则整笔操作进冲突区。
              已发车单据锁定拖拽，由原司机登记移交、承接方确认后换占用；数据全部本地持久化，重开不丢。
            </p>
          </div>
          <div className="identity-box">
            <label className="identity-label">
              当前登录身份
              <Select
                value={identityId}
                onChange={setIdentity}
                style={{ width: 230 }}
                options={IDENTITIES.map((item) => ({
                  value: item.id,
                  label: item.name
                }))}
              />
            </label>
            <Tag className="station-tag" color="blue">
              本机编号 {stationId}
            </Tag>
            <span className="identity-hint">另开浏览器标签页即为另一台调度电脑</span>
          </div>
        </header>

        <Tabs
          activeKey={activeTab}
          onChange={(key) => setActiveTab(key as TabKey)}
          items={tabItems}
          destroyInactiveTabPane={false}
        />
      </div>
    </main>
  );
}

export default function App() {
  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        token: {
          colorPrimary: "#176b87",
          borderRadius: 8
        }
      }}
    >
      <AntApp>
        <Shell />
      </AntApp>
    </ConfigProvider>
  );
}
