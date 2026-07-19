import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { normalizeBackendConfig } from "../utils/promptUtils";
import { getRagStatusText } from "../utils/ragStatus";

export function RagSettingsPanel({ config, status, onChange, onClose }) {
  const [local, setLocal] = useState({ ...config });

  useEffect(() => setLocal({ ...config }), [config]);

  function update(field, value) {
    setLocal((state) => ({ ...state, [field]: value }));
  }

  function apply(e) {
    e.preventDefault();
    const { serverUrl: _legacyServerUrl, ...nextConfig } = local;
    onChange(normalizeBackendConfig({ ...nextConfig, topK: Number(local.topK) }));
    onClose();
  }

  return (
    <div className="rag-settings-panel" role="dialog" aria-label="Backend API settings">
      <div className="rag-settings-header">
        <span>Backend API settings</span>
        <span className={`rag-status ${status}`}>{getRagStatusText(status)}</span>
        <button type="button" onClick={onClose} aria-label="Close"><X size={15} /></button>
      </div>
      <form className="rag-settings-form" onSubmit={apply}>
        <label>
          Backend API URL
          <input value={local.backendApiUrl} onChange={(e) => update("backendApiUrl", e.target.value)} placeholder="http://localhost:8080" />
        </label>
        <label>
          Knowledge mode
          <select value={local.collectionName} onChange={(e) => update("collectionName", e.target.value)}>
            <option value="prompt_techniques">기법 모드</option>
            <option value="papers">논문 모드</option>
          </select>
        </label>
        <div className="rag-settings-row">
          <label>
            Top-K
            <input type="number" min={1} max={20} value={local.topK} onChange={(e) => update("topK", e.target.value)} />
          </label>
          <label>
            Model hint
            <select value={local.model} onChange={(e) => update("model", e.target.value)}>
              <option value="gemini-2.0-flash">gemini-2.0-flash</option>
              <option value="gemini-1.5-flash">gemini-1.5-flash</option>
              <option value="gemini-1.5-pro">gemini-1.5-pro</option>
            </select>
          </label>
        </div>
        <button className="rag-settings-apply" type="submit">Apply</button>
      </form>
    </div>
  );
}
