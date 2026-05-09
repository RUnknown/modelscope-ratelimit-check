// ==UserScript==
// @name         ModelScope-Ratelimit-Check
// @namespace    https://github.com/RUnknown/modelscope-ratelimit-check
// @version      2.6
// @description  用于查询 ModelScope API 用量与额度，自动保存查询记录
// @author       RUnknown
// @match        *://*/*
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// ==/UserScript==

(function() {
    'use strict';

    const API_URL = 'https://api-inference.modelscope.cn/v1/chat/completions';
    const STORAGE_KEY_API_KEY = 'modelscope_ratelimit_api_key';
    const STORAGE_KEY_MODELS = 'modelscope_ratelimit_models';
    const STORAGE_KEY_DARK = 'modelscope_ratelimit_dark_mode';
    const STORAGE_KEY_RESULTS = 'modelscope_ratelimit_results';

    const DEFAULT_MODELS = [
        'deepseek-ai/DeepSeek-V4-Flash',
        'deepseek-ai/DeepSeek-V4-Pro',
        'ZhipuAI/GLM-5.1',
        'MiniMax/MiniMax-M2.5',
        'moonshotai/Kimi-K2.5'
    ];

    let panel = null;
    let isDark = GM_getValue(STORAGE_KEY_DARK, false);

    GM_registerMenuCommand('ModelScope 限额查询', showPanel);

    // ==================== 主题样式 ====================
    function injectGlobalStyles() {
        if (document.getElementById('ms-ratelimit-style')) return;
        const style = document.createElement('style');
        style.id = 'ms-ratelimit-style';
        style.textContent = `
            :root {
                --ms-blue: #1E88E5;
                --ms-blue-dark: #1565C0;
                --ms-blue-light: #64B5F6;
                --ms-gray-50: #F8FAFC;
                --ms-gray-100: #F1F5F9;
                --ms-gray-200: #E2E8F0;
                --ms-gray-600: #475569;
                --ms-gray-800: #1E293B;
                --ms-gray-900: #0F172A;
            }
            .ms-ratelimit-panel {
                --bg: #FFFFFF;
                --bg2: #F8FAFC;
                --input-bg: #F1F5F9;
                --text: #1E293B;
                --text2: #475569;
                --border: #E2E8F0;
                --accent: #1E88E5;
                --accent-hover: #1565C0;
                --table-head: #1E88E5;
                --table-head-text: #FFFFFF;
                --hover-row: rgba(30,136,229,0.04);
                --shadow: rgba(0,0,0,0.08);
            }
            .ms-ratelimit-panel.dark {
                --bg: #1E1E2E;
                --bg2: #2A2A40;
                --input-bg: #2D2D46;
                --text: #E2E8F0;
                --text2: #94A3B8;
                --border: #3B3B5C;
                --accent: #64B5F6;
                --accent-hover: #42A5F5;
                --table-head: #2D3A5C;
                --table-head-text: #E2E8F0;
                --hover-row: rgba(100,181,246,0.06);
                --shadow: rgba(0,0,0,0.4);
            }
            .ms-ratelimit-panel {
                color: var(--text);
                background: var(--bg);
                border: 1px solid var(--border);
                border-radius: 16px;
                box-shadow: 0 20px 50px var(--shadow);
                font-family: 'Inter', system-ui, -apple-system, sans-serif;
                transition: background 0.3s, color 0.3s;
                position: fixed;
                top: 50%; left: 50%;
                transform: translate(-50%, -50%);
                width: 780px;
                max-width: 94vw;
                max-height: 88vh;
                overflow-y: auto;
                z-index: 99999;
                padding: 24px;
            }
            .ms-ratelimit-panel * { box-sizing: border-box; }
            .ms-ratelimit-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 20px;
            }
            .ms-ratelimit-header h3 {
                margin: 0;
                font-size: 18px;
                font-weight: 600;
            }
            .ms-row {
                display: flex;
                align-items: center;
                gap: 10px;
                margin-bottom: 14px;
                flex-wrap: wrap;
            }
            .ms-row label {
                font-size: 13px;
                font-weight: 500;
                color: var(--text2);
                white-space: nowrap;
            }
            .ms-input {
                background: var(--input-bg);
                border: 1px solid var(--border);
                border-radius: 8px;
                padding: 10px 12px;
                font-size: 14px;
                color: var(--text);
                flex: 1;
                min-width: 0;
                transition: border-color 0.2s, box-shadow 0.2s;
            }
            .ms-input:focus {
                outline: none;
                border-color: var(--accent);
                box-shadow: 0 0 0 3px rgba(30,136,229,0.15);
            }
            .ms-btn {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                padding: 9px 16px;
                border-radius: 8px;
                font-size: 13px;
                font-weight: 500;
                border: none;
                cursor: pointer;
                transition: all 0.2s;
                white-space: nowrap;
                gap: 6px;
            }
            .ms-btn-primary { background: var(--accent); color: #fff; }
            .ms-btn-primary:hover { background: var(--accent-hover); }
            .ms-btn-secondary {
                background: transparent;
                border: 1px solid var(--border);
                color: var(--text);
            }
            .ms-btn-secondary:hover { background: var(--hover-row); }
            .ms-btn-icon {
                background: transparent;
                border: none;
                color: var(--text2);
                cursor: pointer;
                font-size: 18px;
                padding: 4px 8px;
                border-radius: 6px;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                transition: all 0.2s;
            }
            .ms-btn-icon:hover { background: var(--hover-row); color: var(--accent); }
            .ms-btn-icon.remove-btn { color: #e53935; }
            .ms-btn-icon.remove-btn:hover { background: rgba(229,57,53,0.1); color: #e53935; }

            .ms-account-bar {
                display: flex;
                gap: 24px;
                justify-content: center;
                padding: 12px 16px;
                background: var(--bg2);
                border-radius: 10px;
                margin-bottom: 16px;
                font-size: 14px;
                border: 1px solid var(--border);
            }
            .ms-account-item {
                display: flex;
                align-items: center;
                gap: 6px;
            }
            .ms-account-item span:first-child { color: var(--text2); font-weight: 500; }
            .ms-account-item span:last-child { font-weight: 600; color: var(--accent); }

            .ms-table {
                width: 100%;
                border-collapse: separate;
                border-spacing: 0;
                border-radius: 10px;
                overflow: hidden;
                border: 1px solid var(--border);
                font-size: 13px;
            }
            .ms-table th {
                background: var(--table-head);
                color: var(--table-head-text);
                font-weight: 500;
                padding: 10px 12px;
                text-align: left;
            }
            .ms-table td {
                padding: 10px 12px;
                border-bottom: 1px solid var(--border);
                background: var(--bg);
                vertical-align: middle;
            }
            .ms-table tbody tr:last-child td { border-bottom: none; }
            .ms-table tbody tr:hover td { background: var(--hover-row); }

            .ms-table .action-cell {
                display: flex;
                gap: 4px;
                align-items: center;
            }
        `;
        document.head.appendChild(style);
    }

    // ==================== 核心功能：自动恢复默认模型 ====================
    function resetModelsToDefault(silent = false) {
        // 将模型列表设为默认，清除查询结果，保留 API Key
        GM_setValue(STORAGE_KEY_MODELS, JSON.stringify(DEFAULT_MODELS));
        GM_setValue(STORAGE_KEY_RESULTS, '{}');
        if (!silent) {
            renderStoredResults();
            updateAccountBar();
            showStatus('✅ 已恢复默认模型');
        }
    }

    // ==================== 面板构建 ====================
    function showPanel() {
        if (panel) {
            panel.style.display = 'block';
            panel.classList.toggle('dark', isDark);
            updateAccountBar();
            return;
        }

        injectGlobalStyles();

        // 关键修复：如果模型列表为空（新用户或清空后），自动填充默认模型
        let models = getCurrentModels();
        if (models.length === 0) {
            resetModelsToDefault(true); // 静默恢复，不显示提示
            models = DEFAULT_MODELS;
        }

        const savedKey = GM_getValue(STORAGE_KEY_API_KEY, '');

        panel = document.createElement('div');
        panel.className = 'ms-ratelimit-panel' + (isDark ? ' dark' : '');

        // 标题栏
        const header = document.createElement('div');
        header.className = 'ms-ratelimit-header';
        header.innerHTML = '<h3>🔮 ModelScope 限额查询</h3>';
        const btnGroup = document.createElement('div');
        btnGroup.style.cssText = 'display:flex; gap:6px; flex-wrap:wrap;';

        // 清空所有内容按钮
        const clearAllBtn = document.createElement('button');
        clearAllBtn.className = 'ms-btn ms-btn-secondary';
        clearAllBtn.innerHTML = '🗑️ 清空所有内容';
        clearAllBtn.title = '清除 API Key、所有模型及查询记录';
        clearAllBtn.onclick = () => {
            if (!confirm('确定要清空所有内容吗？包括 API Key、模型列表和查询结果。')) return;
            GM_setValue(STORAGE_KEY_API_KEY, '');
            GM_setValue(STORAGE_KEY_MODELS, '[]');
            GM_setValue(STORAGE_KEY_RESULTS, '{}');
            document.getElementById('ratelimit-api-key').value = '';
            renderStoredResults();
            updateAccountBar();
            showStatus('✅ 已清空所有内容');
        };
        btnGroup.appendChild(clearAllBtn);

        // 恢复默认模型按钮
        const resetModelsBtn = document.createElement('button');
        resetModelsBtn.className = 'ms-btn ms-btn-secondary';
        resetModelsBtn.innerHTML = '🔄 恢复默认模型';
        resetModelsBtn.title = '将模型列表重置为默认，保留 API Key';
        resetModelsBtn.onclick = () => resetModelsToDefault();
        btnGroup.appendChild(resetModelsBtn);

        // 保存按钮
        const saveBtn = document.createElement('button');
        saveBtn.className = 'ms-btn ms-btn-secondary';
        saveBtn.innerHTML = '💾 保存';
        saveBtn.title = '保存当前配置和查询结果';
        saveBtn.onclick = () => saveAllConfig();
        btnGroup.appendChild(saveBtn);

        // 深色模式
        const darkBtn = document.createElement('button');
        darkBtn.className = 'ms-btn-icon';
        darkBtn.innerHTML = isDark ? '☀️' : '🌙';
        darkBtn.title = isDark ? '切换浅色' : '切换深色';
        darkBtn.onclick = () => {
            isDark = !isDark;
            GM_setValue(STORAGE_KEY_DARK, isDark);
            panel.classList.toggle('dark', isDark);
            darkBtn.innerHTML = isDark ? '☀️' : '🌙';
        };
        btnGroup.appendChild(darkBtn);

        // 关闭
        const closeBtn = document.createElement('button');
        closeBtn.className = 'ms-btn-icon';
        closeBtn.innerHTML = '✕';
        closeBtn.title = '关闭面板';
        closeBtn.onclick = () => { panel.style.display = 'none'; };
        btnGroup.appendChild(closeBtn);

        header.appendChild(btnGroup);
        panel.appendChild(header);

        // API Key 行
        const apiRow = document.createElement('div');
        apiRow.className = 'ms-row';
        apiRow.innerHTML = '<label>🔑 API Key</label>';
        const keyInput = document.createElement('input');
        keyInput.type = 'text';
        keyInput.className = 'ms-input';
        keyInput.id = 'ratelimit-api-key';
        keyInput.value = savedKey;
        keyInput.placeholder = 'ms-xxxxxxxx';
        apiRow.appendChild(keyInput);

        const queryBtn = document.createElement('button');
        queryBtn.className = 'ms-btn ms-btn-primary';
        queryBtn.innerHTML = '🚀 查询限额';
        queryBtn.onclick = () => {
            const apiKey = keyInput.value.trim();
            const currentModels = getCurrentModels();
            if (!apiKey) { alert('请输入 API Key'); return; }
            if (!currentModels.length) { alert('模型列表为空，请先恢复默认模型'); return; }
            queryAllBalances(apiKey, currentModels);
        };
        apiRow.appendChild(queryBtn);
        panel.appendChild(apiRow);

        // 添加模型行
        const addRow = document.createElement('div');
        addRow.className = 'ms-row';
        addRow.innerHTML = '<label>📦 添加模型</label>';
        const modelInput = document.createElement('input');
        modelInput.type = 'text';
        modelInput.className = 'ms-input';
        modelInput.id = 'ratelimit-add-model';
        modelInput.placeholder = '例如 Qwen/Qwen2.5-7B-Instruct';
        addRow.appendChild(modelInput);

        const addBtn = document.createElement('button');
        addBtn.className = 'ms-btn ms-btn-secondary';
        addBtn.innerHTML = '添加';
        addBtn.onclick = () => {
            const newModel = modelInput.value.trim();
            if (!newModel) return;
            const currentModels = getCurrentModels();
            if (currentModels.includes(newModel)) {
                alert('模型已在列表中');
                return;
            }
            currentModels.push(newModel);
            GM_setValue(STORAGE_KEY_MODELS, JSON.stringify(currentModels));
            modelInput.value = '';
            addModelRowToTable(newModel);
            saveAllConfig();
        };
        addRow.appendChild(addBtn);
        panel.appendChild(addRow);

        // 账户概览栏
        const accountBar = document.createElement('div');
        accountBar.className = 'ms-account-bar';
        accountBar.id = 'ratelimit-account-bar';
        accountBar.innerHTML = `
            <div class="ms-account-item"><span>账户限额</span><span id="acc-limit">-</span></div>
            <div class="ms-account-item"><span>账户剩余</span><span id="acc-remaining">-</span></div>
            <div class="ms-account-item"><span>已使用</span><span id="acc-used">-</span></div>
        `;
        panel.appendChild(accountBar);

        // 表格
        const table = document.createElement('table');
        table.className = 'ms-table';
        table.id = 'ratelimit-result-table';
        table.innerHTML = `
            <thead>
                <tr>
                    <th>模型</th>
                    <th>模型限额</th>
                    <th>模型剩余</th>
                    <th>状态</th>
                    <th>操作</th>
                </tr>
            </thead>
            <tbody></tbody>
        `;
        panel.appendChild(table);

        const statusRow = document.createElement('div');
        statusRow.id = 'ratelimit-status';
        statusRow.className = 'ms-status';
        statusRow.style.marginTop = '10px';
        panel.appendChild(statusRow);

        document.body.appendChild(panel);

        // 渲染结果（此时模型列表肯定非空，因为已在上面自动恢复）
        renderStoredResults();
        updateAccountBar();
    }

    // ==================== 辅助函数 ====================
    function getCurrentModels() {
        const raw = GM_getValue(STORAGE_KEY_MODELS, '[]');
        try {
            const arr = JSON.parse(raw);
            return Array.isArray(arr) ? arr : [];
        } catch(e) {
            return [];
        }
    }

    function saveAllConfig() {
        const key = document.getElementById('ratelimit-api-key')?.value?.trim() || '';
        const models = getCurrentModels();
        GM_setValue(STORAGE_KEY_API_KEY, key);
        GM_setValue(STORAGE_KEY_MODELS, JSON.stringify(models));
        showStatus('✅ 配置已保存');
    }

    function showStatus(msg) {
        const statusEl = document.getElementById('ratelimit-status');
        if (statusEl) {
            statusEl.textContent = msg;
            setTimeout(() => { if(statusEl) statusEl.textContent = ''; }, 2000);
        }
    }

    function getResultsFromStorage() {
        const raw = GM_getValue(STORAGE_KEY_RESULTS, null);
        if (raw) {
            try { return JSON.parse(raw); } catch(e) {}
        }
        return {};
    }

    function setResultsToStorage(results) {
        GM_setValue(STORAGE_KEY_RESULTS, JSON.stringify(results));
    }

    function updateResultStorage(modelId, data, isError, errorMsg) {
        const results = getResultsFromStorage();
        results[modelId] = {
            accountLimit: data.accountLimit || null,
            accountRemaining: data.accountRemaining || null,
            modelLimit: data.modelLimit || null,
            modelRemaining: data.modelRemaining || null,
            status: isError ? 'error' : 'success',
            error: isError ? errorMsg : null,
            timestamp: Date.now()
        };
        setResultsToStorage(results);
        updateAccountBar();
    }

    function updateAccountBar() {
        const results = getResultsFromStorage();
        let best = null;
        let latestTime = 0;
        for (const [, r] of Object.entries(results)) {
            if (r.status === 'success' && r.accountLimit && r.accountRemaining && r.timestamp > latestTime) {
                best = r;
                latestTime = r.timestamp;
            }
        }
        const accLimitEl = document.getElementById('acc-limit');
        const accRemainingEl = document.getElementById('acc-remaining');
        const accUsedEl = document.getElementById('acc-used');
        if (best) {
            accLimitEl.textContent = best.accountLimit;
            accRemainingEl.textContent = best.accountRemaining;
            const used = parseInt(best.accountLimit) - parseInt(best.accountRemaining);
            accUsedEl.textContent = isNaN(used) ? '-' : used;
        } else {
            accLimitEl.textContent = '-';
            accRemainingEl.textContent = '-';
            accUsedEl.textContent = '-';
        }
    }

    function removeModel(modelId) {
        if (!confirm(`确定要移除模型 "${modelId}" 吗？`)) return;
        const models = getCurrentModels().filter(m => m !== modelId);
        GM_setValue(STORAGE_KEY_MODELS, JSON.stringify(models));

        const results = getResultsFromStorage();
        delete results[modelId];
        setResultsToStorage(results);

        renderStoredResults();
        updateAccountBar();
        saveAllConfig();
    }

    function createActionCell(modelId) {
        const actionCell = document.createElement('td');
        actionCell.className = 'action-cell';
        actionCell.style.cssText = 'display:flex; gap:4px; align-items:center;';

        const refreshBtn = document.createElement('button');
        refreshBtn.className = 'ms-btn-icon refresh-single-btn';
        refreshBtn.setAttribute('data-model', modelId);
        refreshBtn.innerHTML = '🔄';
        refreshBtn.title = '刷新此模型';
        refreshBtn.addEventListener('click', () => refreshSingleModel(modelId));

        const removeBtn = document.createElement('button');
        removeBtn.className = 'ms-btn-icon remove-btn';
        removeBtn.innerHTML = '🗑️';
        removeBtn.title = '移除该模型';
        removeBtn.addEventListener('click', () => removeModel(modelId));

        actionCell.appendChild(refreshBtn);
        actionCell.appendChild(removeBtn);
        return actionCell;
    }

    function renderStoredResults() {
        const results = getResultsFromStorage();
        const models = getCurrentModels();
        const tbody = document.querySelector('#ratelimit-result-table tbody');
        if (!tbody) return;
        tbody.innerHTML = '';

        models.forEach(modelId => {
            const row = tbody.insertRow();
            const r = results[modelId];
            let statusHtml, statusStyle;
            if (r && r.status === 'success') {
                statusStyle = 'color:var(--accent)';
                statusHtml = '✅ 成功';
            } else if (r && r.status === 'error') {
                statusStyle = 'color:#e53935';
                statusHtml = '❌ ' + (r.error || '');
            } else {
                statusStyle = 'color:var(--text2)';
                statusHtml = '未查询';
            }

            row.innerHTML = `
                <td>${escapeHtml(modelId)}</td>
                <td>${(r && r.modelLimit) || '-'}</td>
                <td>${(r && r.modelRemaining) || '-'}</td>
                <td style="${statusStyle}">${statusHtml}</td>
            `;
            row.appendChild(createActionCell(modelId));
        });
    }

    function addModelRowToTable(modelId) {
        const tbody = document.querySelector('#ratelimit-result-table tbody');
        if (!tbody) return;
        const row = tbody.insertRow();
        row.innerHTML = `
            <td>${escapeHtml(modelId)}</td>
            <td>-</td><td>-</td>
            <td style="color:var(--text2)">未查询</td>
        `;
        row.appendChild(createActionCell(modelId));
    }

    function renderFreshTable(modelsArray) {
        const tbody = document.querySelector('#ratelimit-result-table tbody');
        if (!tbody) return;
        tbody.innerHTML = '';
        modelsArray.forEach(modelId => {
            const row = tbody.insertRow();
            row.innerHTML = `
                <td>${escapeHtml(modelId)}</td>
                <td>-</td><td>-</td>
                <td style="color:var(--text2)">查询中...</td>
            `;
            row.appendChild(createActionCell(modelId));
        });
    }

    function refreshSingleModel(modelId) {
        const apiKey = document.getElementById('ratelimit-api-key')?.value?.trim();
        if (!apiKey) { alert('请先输入 API Key'); return; }

        const tbody = document.querySelector('#ratelimit-result-table tbody');
        const rows = tbody.querySelectorAll('tr');
        let targetRow = null;
        rows.forEach(row => {
            if (row.cells[0].textContent.trim() === modelId) targetRow = row;
        });
        if (!targetRow) return;

        targetRow.cells[3].textContent = '查询中...';
        targetRow.cells[3].style.color = 'var(--text2)';

        querySingleModel(apiKey, modelId, (err, data) => {
            if (err) {
                targetRow.cells[1].textContent = '-';
                targetRow.cells[2].textContent = '-';
                targetRow.cells[3].textContent = '❌ ' + err;
                targetRow.cells[3].style.color = '#e53935';
                updateResultStorage(modelId, {}, true, err);
            } else {
                targetRow.cells[1].textContent = data.modelLimit || '-';
                targetRow.cells[2].textContent = data.modelRemaining || '-';
                targetRow.cells[3].textContent = '✅ 成功';
                targetRow.cells[3].style.color = 'var(--accent)';
                updateResultStorage(modelId, data, false, null);
            }
        });
    }

    function queryAllBalances(apiKey, models) {
        const statusEl = document.getElementById('ratelimit-status');
        renderFreshTable(models);
        statusEl.textContent = '⏳ 正在查询中...';

        let completed = 0;
        const total = models.length;

        models.forEach(modelId => {
            querySingleModel(apiKey, modelId, (err, data) => {
                completed++;
                const tbody = document.querySelector('#ratelimit-result-table tbody');
                const rows = tbody.querySelectorAll('tr');
                rows.forEach(row => {
                    if (row.cells[0].textContent.trim() === modelId) {
                        if (err) {
                            row.cells[1].textContent = '-';
                            row.cells[2].textContent = '-';
                            row.cells[3].textContent = '❌ ' + err;
                            row.cells[3].style.color = '#e53935';
                            updateResultStorage(modelId, {}, true, err);
                        } else {
                            row.cells[1].textContent = data.modelLimit || '-';
                            row.cells[2].textContent = data.modelRemaining || '-';
                            row.cells[3].textContent = '✅ 成功';
                            row.cells[3].style.color = 'var(--accent)';
                            updateResultStorage(modelId, data, false, null);
                        }
                    }
                });

                if (completed === total) {
                    statusEl.textContent = '✨ 查询完成！';
                    saveAllConfig();
                }
            });
        });
    }

    function querySingleModel(apiKey, modelId, callback) {
        GM_xmlhttpRequest({
            method: 'POST',
            url: API_URL,
            headers: {
                'Authorization': 'Bearer ' + apiKey,
                'Content-Type': 'application/json',
                'User-Agent': 'Mozilla/5.0'
            },
            data: JSON.stringify({
                model: modelId,
                messages: [{ role: 'user', content: 'hi' }],
                max_tokens: 1
            }),
            timeout: 15000,
            onload: function(response) {
                if (response.status !== 200) {
                    let errorMsg = 'HTTP ' + response.status;
                    try {
                        const body = JSON.parse(response.responseText);
                        if (body.error?.message) errorMsg += ': ' + body.error.message;
                    } catch(e) {}
                    callback(errorMsg, null);
                    return;
                }
                const headers = parseHeaders(response.responseHeaders);
                const data = {
                    accountLimit: headers['modelscope-ratelimit-requests-limit'] || null,
                    accountRemaining: headers['modelscope-ratelimit-requests-remaining'] || null,
                    modelLimit: headers['modelscope-ratelimit-model-requests-limit'] || null,
                    modelRemaining: headers['modelscope-ratelimit-model-requests-remaining'] || null,
                };
                callback(null, data);
            },
            onerror: () => callback('网络错误', null),
            ontimeout: () => callback('请求超时', null)
        });
    }

    function parseHeaders(headerStr) {
        const headers = {};
        if (!headerStr) return headers;
        headerStr.split('\n').forEach(line => {
            const idx = line.indexOf(':');
            if (idx > 0) headers[line.substring(0, idx).trim().toLowerCase()] = line.substring(idx+1).trim();
        });
        return headers;
    }

    function escapeHtml(text) {
        return text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }
})();