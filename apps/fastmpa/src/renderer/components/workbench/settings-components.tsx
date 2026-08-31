import type { SettingsSectionId } from "./types.js";

export const settingsSections: readonly { readonly id: SettingsSectionId; readonly label: string }[] = [
  { id: "preferences", label: "我的偏好" },
  { id: "workspace", label: "工作区" },
  { id: "execution", label: "执行与审批" },
  { id: "connections", label: "工具与连接" },
  { id: "security", label: "安全与审计" },
  { id: "about", label: "关于" },
];

export function SettingsNavigation({ selected, onSelect }: { readonly selected: SettingsSectionId; readonly onSelect: (id: SettingsSectionId) => void }): React.JSX.Element {
  return <nav className="settings-navigation" aria-label="设置分类">{settingsSections.map((item) => <button type="button" key={item.id} className={selected === item.id ? "selected" : ""} aria-current={selected === item.id ? "page" : undefined} onClick={() => onSelect(item.id)}>{item.label}</button>)}</nav>;
}

export function SettingRow({ label, description, children }: { readonly label: string; readonly description: string; readonly children: React.ReactNode }): React.JSX.Element {
  return <div className="setting-row"><div><strong>{label}</strong><small>{description}</small></div><div>{children}</div></div>;
}

export function SettingsSaveBar({ dirty, saving, status, onSave, onDiscard }: { readonly dirty: boolean; readonly saving: boolean; readonly status: string; readonly onSave: () => void; readonly onDiscard: () => void }): React.JSX.Element {
  return <div className="settings-save-bar" aria-live="polite"><span>{dirty ? "有未保存更改" : status}</span>{dirty && <div><button type="button" className="secondary-button" disabled={saving} onClick={onDiscard}>放弃</button><button type="button" className="send-button" disabled={saving} onClick={onSave}>{saving ? "保存中…" : "保存更改"}</button></div>}</div>;
}
