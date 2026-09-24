import { useEffect } from "react";
import { App as AntApp, ConfigProvider, Tabs } from "antd";
import zhCN from "antd/locale/zh_CN";
import { useDispatchStore } from "./state/store";
import { BoardPage } from "./pages/BoardPage";
import { OrdersPage } from "./pages/OrdersPage";
import { ConflictsPage } from "./pages/ConflictsPage";

const TAB_STORAGE_KEY = "hxwlfront-14-active-tab";

function Shell() {
  const { message } = AntApp.useApp();
  const lastMessage = useDispatchStore((s) => s.lastMessage);
  const dismissMessage = useDispatchStore((s) => s.dismissMessage);

  useEffect(() => {
    if (lastMessage) {
      // 冲突 / 拒绝等提示走 warning，正常保存走 success
      if (lastMessage.includes("冲突") || lastMessage.includes("不能") || lastMessage.includes("只有") || lastMessage.includes("已存在")) {
        message.warning(lastMessage, 3);
      } else {
        message.success(lastMessage, 2.5);
      }
      dismissMessage();
    }
  }, [lastMessage, message, dismissMessage]);

  return (
    <Tabs
      defaultActiveKey={localStorage.getItem(TAB_STORAGE_KEY) ?? "board"}
      onChange={(key) => localStorage.setItem(TAB_STORAGE_KEY, key)}
      items={[
        { key: "orders", label: "配送资料", children: <OrdersPage /> },
        { key: "board", label: "拖拽排班", children: <BoardPage /> },
        { key: "conflicts", label: "冲突记录", children: <ConflictsPage /> }
      ]}
    />
  );
}

export default function App() {
  return (
    <ConfigProvider locale={zhCN} theme={{ token: { colorPrimary: "#176b87", borderRadius: 8 } }}>
      <AntApp>
        <main className="app-shell">
          <header className="app-header">
            <div>
              <p className="eyebrow">物流 · 多调度员协作排班</p>
              <h1>配送任务拖拽排班</h1>
            </div>
            <p className="header-desc">配送单携带修订序号，拖放核对；他端晚保存不再覆盖先排结果，冲突单列处理。</p>
          </header>
          <Shell />
        </main>
      </AntApp>
    </ConfigProvider>
  );
}
