import { useEffect, useMemo, useState } from "react";
import type { SettingsSnapshot } from "../../../shared/contracts/settings.js";
import type { DesktopInfo } from "../../../shared/desktop-api.js";
import {
  SettingRow,
  SettingsNavigation,
  SettingsSaveBar,
  settingsSections,
} from "../../components/workbench/settings-components.js";
import type {
  SettingsDraft,
  SettingsSectionId,
} from "../../components/workbench/types.js";

const initialDraft: SettingsDraft = {
  defaultModel: "",
  maxAgents: 3,
  writeApproval: "always",
  externalApproval: true,
  approvalTimeoutMinutes: 30,
};

export function SettingsPage({
  desktopInfo,
  workspaceId,
}: {
  readonly desktopInfo?: DesktopInfo;
  readonly workspaceId?: string;
}): React.JSX.Element {
  const [section, setSection] = useState<SettingsSectionId>("preferences");
  const [draft, setDraft] = useState<SettingsDraft>(initialDraft);
  const [savedDraft, setSavedDraft] = useState<SettingsDraft>(initialDraft);
  const [notifications, setNotifications] = useState(true);
  const [savedNotifications, setSavedNotifications] = useState(true);
  const [shortcut, setShortcut] = useState("enter");
  const [savedShortcut, setSavedShortcut] = useState("enter");
  const [workspaceVersion, setWorkspaceVersion] = useState(1);
  const [status, setStatus] = useState("设置已同步");
  const dirty = useMemo(
    () =>
      JSON.stringify({ draft, notifications, shortcut }) !==
      JSON.stringify({
        draft: savedDraft,
        notifications: savedNotifications,
        shortcut: savedShortcut,
      }),
    [
      draft,
      notifications,
      savedDraft,
      savedNotifications,
      savedShortcut,
      shortcut,
    ],
  );
  useEffect(() => {
    if (!workspaceId) return;
    void window.fastMpa.application
      .getSettingsSnapshot(workspaceId)
      .then((snapshot: SettingsSnapshot) => {
        setNotifications(snapshot.preferences.notificationsEnabled);
        setShortcut(snapshot.preferences.sendShortcut);
        setSavedNotifications(snapshot.preferences.notificationsEnabled);
        setSavedShortcut(snapshot.preferences.sendShortcut);
        const next: SettingsDraft = {
          defaultModel: snapshot.workspace.defaultModel,
          maxAgents: snapshot.workspace.maxAgents,
          writeApproval: snapshot.workspace.writeApproval,
          externalApproval: snapshot.workspace.externalApproval,
          approvalTimeoutMinutes: snapshot.workspace.approvalTimeoutMinutes,
        };
        setDraft(next);
        setSavedDraft(next);
        setWorkspaceVersion(snapshot.workspace.version);
      });
  }, [workspaceId]);
  useEffect(() => {
    if (!dirty) return;
    const handleBeforeUnload = (event: BeforeUnloadEvent): void => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [dirty]);
  const title =
    settingsSections.find((item) => item.id === section)?.label ?? "设置";
  const updateDraft = <K extends keyof SettingsDraft>(
    key: K,
    value: SettingsDraft[K],
  ): void => setDraft((current) => ({ ...current, [key]: value }));
  return (
    <div className="settings-page">
      <SettingsNavigation selected={section} onSelect={setSection} />
      <main className="settings-content">
        <header className="settings-header">
          <p className="eyebrow">FastMPA</p>
          <h2>{title}</h2>
          <p>设置仅影响当前产品工作区，不改变已完成的运行记录。</p>
        </header>
        {section === "preferences" && (
          <section className="settings-group">
            <h3>界面与输入</h3>
            <SettingRow label="界面语言" description="产品界面显示语言">
              <select
                defaultValue="zh-CN"
                onChange={() => setStatus("语言设置已自动保存")}
              >
                <option value="zh-CN">简体中文</option>
                <option value="en-US">English</option>
              </select>
            </SettingRow>
            <SettingRow label="通知" description="运行完成、失败和审批请求">
              <label>
                <input
                  type="checkbox"
                  checked={notifications}
                  onChange={(event) => {
                    setNotifications(event.target.checked);
                    setStatus("通知设置已自动保存");
                  }}
                />{" "}
                接收通知
              </label>
            </SettingRow>
            <SettingRow label="发送快捷键" description="Composer 中的发送行为">
              <select
                value={shortcut}
                onChange={(event) => {
                  setShortcut(event.target.value);
                  setStatus("发送快捷键已自动保存");
                }}
              >
                <option value="enter">Enter 发送</option>
                <option value="ctrl-enter">Ctrl+Enter 发送</option>
              </select>
            </SettingRow>
          </section>
        )}
        {section === "workspace" && (
          <section className="settings-group">
            <h3>工作区默认值</h3>
            <SettingRow label="默认模型" description="新运行使用的模型">
              <select
                value={draft.defaultModel}
                onChange={(event) =>
                  updateDraft("defaultModel", event.target.value)
                }
              >
                <option value="">跟随当前连接</option>
                <option value="default">默认模型</option>
              </select>
            </SettingRow>
            <SettingRow
              label="自动路由上限"
              description="群聊一次允许调度的 Agent 数量"
            >
              <input
                type="number"
                min="1"
                max="5"
                value={draft.maxAgents}
                onChange={(event) =>
                  updateDraft("maxAgents", Number(event.target.value))
                }
              />
            </SettingRow>
          </section>
        )}
        {section === "execution" && (
          <section className="settings-group">
            <h3>风险与运行策略</h3>
            <SettingRow
              label="写操作审批"
              description="Agent 修改文件或外部资源前的确认规则"
            >
              <select
                value={draft.writeApproval}
                onChange={(event) =>
                  updateDraft(
                    "writeApproval",
                    event.target.value as SettingsDraft["writeApproval"],
                  )
                }
              >
                <option value="always">始终需要批准</option>
                <option value="external">仅外部资源需要批准</option>
              </select>
            </SettingRow>
            <SettingRow
              label="外部操作审批"
              description="调用外部服务前要求人工决定"
            >
              <input
                type="checkbox"
                checked={draft.externalApproval}
                onChange={(event) =>
                  updateDraft("externalApproval", event.target.checked)
                }
              />
            </SettingRow>
            <SettingRow
              label="审批超时"
              description="等待人工决定的最长时间（分钟）"
            >
              <input
                type="number"
                min="1"
                max="1440"
                value={draft.approvalTimeoutMinutes}
                onChange={(event) =>
                  updateDraft(
                    "approvalTimeoutMinutes",
                    Number(event.target.value),
                  )
                }
              />
            </SettingRow>
          </section>
        )}
        {section === "connections" && (
          <section className="settings-group">
            <h3>连接状态</h3>
            <SettingRow
              label="模型提供商"
              description="凭据只显示连接状态，不显示密钥"
            >
              <span>{desktopInfo?.model ?? "未配置"}</span>
            </SettingRow>
            <SettingRow
              label="工具连接"
              description="外部工具连接由 Runtime 管理"
            >
              <span>未配置连接</span>
            </SettingRow>
          </section>
        )}
        {section === "security" && (
          <section className="settings-group">
            <h3>安全与审计</h3>
            <SettingRow label="数据库" description="运行状态和会话数据">
              SQLite
            </SettingRow>
            <SettingRow
              label="数据目录"
              description="打开 FastMPA 本地数据目录"
            >
              <button
                type="button"
                className="secondary-button"
                onClick={() =>
                  void window.fastMpa.desktop.revealDataDirectory()
                }
              >
                打开数据目录
              </button>
            </SettingRow>
          </section>
        )}
        {section === "about" && (
          <section className="settings-group">
            <h3>运行环境</h3>
            <SettingRow label="版本" description="FastMPA Desktop">
              {desktopInfo?.version ?? "加载中"}
            </SettingRow>
            <SettingRow label="平台" description="当前桌面运行环境">
              {desktopInfo
                ? `${desktopInfo.platform} · ${desktopInfo.arch}`
                : "加载中"}
            </SettingRow>
            <SettingRow
              label="日志路径"
              description="仅显示路径，不显示日志内容"
            >
              <code>{desktopInfo?.logPath ?? "加载中"}</code>
            </SettingRow>
          </section>
        )}
        <SettingsSaveBar
          dirty={dirty}
          saving={false}
          status={status}
          onDiscard={() => {
            setDraft(savedDraft);
            setNotifications(savedNotifications);
            setShortcut(savedShortcut);
            setStatus("已放弃更改");
          }}
          onSave={() => {
            if (!workspaceId) return;
            void window.fastMpa.application
              .updateSettings({
                workspaceId,
                preferences: {
                  notificationsEnabled: notifications,
                  sendShortcut: shortcut as "enter" | "ctrl-enter",
                },
                workspace: {
                  ...draft,
                  version: workspaceVersion,
                },
              })
              .then(() => {
                setSavedDraft(draft);
                setSavedNotifications(notifications);
                setSavedShortcut(shortcut);
                setWorkspaceVersion((version) => version + 1);
                setStatus("设置已保存");
              })
              .catch((error: unknown) => {
                setStatus(
                  error instanceof Error ? error.message : "设置保存失败",
                );
              });
          }}
        />
      </main>
    </div>
  );
}
