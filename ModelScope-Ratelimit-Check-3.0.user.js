// ==UserScript==
// @name:zh-CN   魔搭社区限额查询
// @name         ModelScope-Ratelimit-Check
// @namespace    https://github.com/RUnknown/modelscope-ratelimit-check
// @version      3.0
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

    // ==================== 常量 ====================
    const API_URL = 'https://api-inference.modelscope.cn/v1/chat/completions';
    const STORAGE = {
        KEYS: 'modelscope_ratelimit_keys',
        ACTIVE_KEY_ID: 'modelscope_ratelimit_active_key_id',
        DARK: 'modelscope_ratelimit_dark_mode',
        LANG: 'modelscope_ratelimit_lang',
        API_KEY_HISTORY: 'modelscope_ratelimit_api_key_history',
        MODEL_HISTORY: 'modelscope_ratelimit_model_history'
    };

    const DEFAULT_MODELS = [
        'deepseek-ai/DeepSeek-V4-Flash',
        'deepseek-ai/DeepSeek-V4-Pro',
        'ZhipuAI/GLM-5.1',
        'MiniMax/MiniMax-M2.5',
        'moonshotai/Kimi-K2.5'
    ];

    // ==================== 国际化 ====================
    const LANG = {
        zh: {
            title: '🔮 ModelScope 限额查询',
            save: '💾 保存',
            clearAll: '🗑️ 清空所有内容',
            resetModels: '🔄 恢复默认模型',
            darkMode: '深色模式',
            lightMode: '浅色模式',
            close: '关闭面板',
            apiKey: '🔑 API Key',
            query: '🚀 查询限额',
            addModel: '📦 添加模型',
            addBtn: '添加',
            accountLimit: '账户限额',
            accountRemaining: '账户剩余',
            used: '已使用',
            model: '模型',
            modelLimit: '模型限额',
            modelRemaining: '模型剩余',
            status: '状态',
            actions: '操作',
            duration: '耗时',
            notQueried: '未查询',
            querying: '查询中...',
            success: '✅ 成功',
            error: '❌ ',
            configSaved: '✅ 配置已保存',
            restoredDefaults: '✅ 已恢复默认模型',
            clearedAll: '✅ 已清空所有内容',
            queryComplete: '✨ 查询完成！',
            removeModelConfirm: '确定要移除模型',
            clearAllConfirm: '确定要清空所有内容吗？包括 API Key、模型列表和查询结果。',
            needApiKey: '请输入 API Key',
            needModel: '模型列表为空，请先恢复默认模型',
            modelExists: '模型已在列表中',
            copySuccess: '已复制',
            keyNamePlaceholder: '输入 Key 名称',
            addKey: '添加 Key',
            deleteKey: '删除当前 Key',
            renameKey: '重命名',
            keyName: 'Key 名称',
            enterKeyName: '请输入 Key 名称',
            keyNameExists: '名称已存在',
            langSwitch: 'EN',
            reminder: '注意：每次查询将消耗 1 次模型额度。'
        },
        en: {
            title: '🔮 ModelScope Rate Limit Check',
            save: '💾 Save',
            clearAll: '🗑️ Clear All',
            resetModels: '🔄 Reset Default Models',
            darkMode: 'Dark Mode',
            lightMode: 'Light Mode',
            close: 'Close Panel',
            apiKey: '🔑 API Key',
            query: '🚀 Check Limits',
            addModel: '📦 Add Model',
            addBtn: 'Add',
            accountLimit: 'Account Limit',
            accountRemaining: 'Account Remaining',
            used: 'Used',
            model: 'Model',
            modelLimit: 'Model Limit',
            modelRemaining: 'Model Remaining',
            status: 'Status',
            actions: 'Actions',
            duration: 'Duration',
            notQueried: 'Not queried',
            querying: 'Querying...',
            success: '✅ Success',
            error: '❌ ',
            configSaved: '✅ Config saved',
            restoredDefaults: '✅ Default models restored',
            clearedAll: '✅ All cleared',
            queryComplete: '✨ Query complete!',
            removeModelConfirm: 'Are you sure you want to remove model ',
            clearAllConfirm: 'Are you sure you want to clear everything? (API Key, models, results)',
            needApiKey: 'Please enter an API Key',
            needModel: 'Model list is empty, please restore defaults',
            modelExists: 'Model already exists',
            copySuccess: 'Copied',
            keyNamePlaceholder: 'Enter key name',
            addKey: 'Add Key',
            deleteKey: 'Delete current key',
            renameKey: 'Rename',
            keyName: 'Key Name',
            enterKeyName: 'Enter key name',
            keyNameExists: 'Name already exists',
            langSwitch: '中文',
            reminder: 'Note: Each query consumes 1 model request quota.'
        }
    };

    let currentLang = GM_getValue(STORAGE.LANG, 'zh');
    function t(key) { return LANG[currentLang]?.[key] || key; }

    // ==================== 数据管理（多 Key） ====================
    function getAllKeys() {
        const raw = GM_getValue(STORAGE.KEYS, '[]');
        try { return JSON.parse(raw); } catch(e) { return []; }
    }
    function setAllKeys(keys) { GM_setValue(STORAGE.KEYS, JSON.stringify(keys)); }
    function getActiveKeyId() { return GM_getValue(STORAGE.ACTIVE_KEY_ID, null); }
    function setActiveKeyId(id) { GM_setValue(STORAGE.ACTIVE_KEY_ID, id); }
    function getActiveKeyData() {
        const keys = getAllKeys();
        const activeId = getActiveKeyId();
        if (activeId && keys.length) {
            return keys.find(k => k.id === activeId) || null;
        }
        return null;
    }
    function getCurrentApiKey() { return getActiveKeyData()?.key || ''; }
    function getCurrentModels() {
        const k = getActiveKeyData();
        return k?.models || [];
    }
    function getCurrentResults() {
        const k = getActiveKeyData();
        return k?.results || {};
    }
    function updateCurrentKey(updates) {
        const keys = getAllKeys();
        const activeId = getActiveKeyId();
        const idx = keys.findIndex(k => k.id === activeId);
        if (idx !== -1) {
            keys[idx] = { ...keys[idx], ...updates };
            setAllKeys(keys);
        }
    }

    // 历史记录
    function getHistory(key) {
        const raw = GM_getValue(key, '[]');
        try { return JSON.parse(raw); } catch(e) { return []; }
    }
    function addHistory(key, value) {
        if (!value) return;
        const arr = getHistory(key).filter(v => v !== value);
        arr.unshift(value);
        if (arr.length > 20) arr.pop();
        GM_setValue(key, JSON.stringify(arr));
    }

    // ==================== 面板 & UI ====================
    let panel = null;
    let isDark = GM_getValue(STORAGE.DARK, false);
    let sortColumn = null;
    let sortAsc = true;

    GM_registerMenuCommand('ModelScope 限额查询', showPanel);

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
                --group-bg: #F0F4F8;
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
                --group-bg: #2A2A40;
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
                width: 840px;
                max-width: 94vw;
                max-height: 90vh;
                overflow: auto;
                z-index: 99999;
                padding: 24px;
            }
            .ms-ratelimit-panel * { box-sizing: border-box; }
            .ms-ratelimit-header {
                display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;
            }
            .ms-row {
                display: flex; align-items: center; gap: 8px; margin-bottom: 12px; flex-wrap: wrap;
            }
            .ms-row label { font-size:13px; font-weight:500; color:var(--text2); white-space:nowrap; }
            .ms-input {
                background: var(--input-bg); border:1px solid var(--border); border-radius:8px;
                padding:8px 12px; font-size:14px; color:var(--text); flex:1; min-width:0;
                transition: border-color 0.2s;
            }
            .ms-input:focus { outline:none; border-color:var(--accent); box-shadow:0 0 0 2px rgba(30,136,229,0.15); }
            .ms-select {
                background: var(--input-bg); border:1px solid var(--border); border-radius:8px;
                padding:8px 12px; font-size:14px; color:var(--text); max-width:160px;
            }
            .ms-btn {
                display:inline-flex; align-items:center; justify-content:center;
                padding:8px 14px; border-radius:8px; font-size:13px; font-weight:500;
                border:none; cursor:pointer; transition:all 0.2s; white-space:nowrap; gap:4px;
            }
            .ms-btn-primary { background:var(--accent); color:#fff; }
            .ms-btn-primary:hover { background:var(--accent-hover); }
            .ms-btn-secondary { background:transparent; border:1px solid var(--border); color:var(--text); }
            .ms-btn-secondary:hover { background:var(--hover-row); }
            .ms-btn-icon {
                background:transparent; border:none; color:var(--text2); cursor:pointer;
                font-size:18px; padding:4px 8px; border-radius:6px;
                display:inline-flex; align-items:center; justify-content:center;
            }
            .ms-btn-icon:hover { background:var(--hover-row); color:var(--accent); }
            .ms-btn-icon.remove-btn { color:#e53935; }
            .ms-btn-icon.remove-btn:hover { background:rgba(229,57,53,0.1); }
            .ms-account-bar {
                display:flex; gap:24px; justify-content:center; padding:10px 16px;
                background:var(--bg2); border-radius:10px; margin-bottom:33px; font-size:14px;
                border:1px solid var(--border);
            }
            .ms-account-item { display:flex; align-items:center; gap:6px; }
            .ms-account-item span:first-child { color:var(--text2); font-weight:500; }
            .ms-account-item span:last-child { font-weight:600; color:var(--accent); }
            .ms-table { width:100%; border-collapse:separate; border-spacing:0; border-radius:10px; overflow:hidden; border:1px solid var(--border); font-size:13px; }
            .ms-table th { background:var(--table-head); color:var(--table-head-text); font-weight:500; padding:8px 10px; text-align:left; position:relative; cursor:pointer; user-select:none; }
            .ms-table th.sortable::after { content:' ↕'; opacity:0.5; font-size:12px; }
            .ms-table th.sort-asc::after { content:' ↑'; opacity:1; }
            .ms-table th.sort-desc::after { content:' ↓'; opacity:1; }
            .ms-table td { padding:8px 10px; border-bottom:1px solid var(--border); background:var(--bg); vertical-align:middle; }
            .ms-table tbody tr:last-child td { border-bottom:none; }
            .ms-table tbody tr:hover td { background:var(--hover-row); }
            /* 关键修复：强制单元格文本不换行，保持表格整洁 */
            // .ms-table th, .ms-table td {
            .ms-table th {
                white-space: nowrap;
            }
            .model-clickable { cursor:pointer; transition:color 0.2s; }
            .model-clickable:hover { color:var(--accent); text-decoration:underline; }
            .group-row td { background:var(--group-bg); font-weight:600; cursor:pointer; padding:6px 10px; }
            .group-row td:hover { opacity:0.9; }
            .action-cell { display:flex; gap:4px; align-items:center; }
            .copy-tooltip { font-size:12px; margin-left:6px; color:var(--accent); }

            /* 新增：额度消耗提醒 */
            .ms-reminder {
                text-align: center;
                padding: 8px 16px;
                margin: -20px auto 16px auto;   /* 水平居中 */
                background: var(--bg2);
                border: 1px solid var(--border);
                border-radius: 8px;
                color: var(--text2);
                font-size: 13px;
                font-weight: 500;
                max-width: 80%;          /* 限制最大宽度，视觉更舒适 */
                box-sizing: border-box;
            }
        `;
        document.head.appendChild(style);
    }

    // ==================== 主面板构建 ====================
    function showPanel() {
        if (panel) {
            panel.style.display = 'block';
            panel.classList.toggle('dark', isDark);
            updateAccountBar();
            return;
        }

        injectGlobalStyles();

        // 确保至少有一个 Key
        let keys = getAllKeys();
        if (!keys.length) {
            const defaultKey = { id: 'default', key: '', models: [...DEFAULT_MODELS], results: {} };
            keys = [defaultKey];
            setAllKeys(keys);
            setActiveKeyId('default');
        } else if (!getActiveKeyId() || !keys.find(k => k.id === getActiveKeyId())) {
            setActiveKeyId(keys[0].id);
        }

        const activeKey = getActiveKeyData();

        panel = document.createElement('div');
        panel.className = 'ms-ratelimit-panel' + (isDark ? ' dark' : '');

        // 标题栏
        const header = document.createElement('div');
        header.className = 'ms-ratelimit-header';
        const h3 = document.createElement('h3');
        h3.style.margin = '0';
        h3.textContent = t('title');
        header.appendChild(h3);

        const btnGroup = document.createElement('div');
        btnGroup.style.cssText = 'display:flex; gap:6px; flex-wrap:wrap; align-items:center;';

        // 语言切换
        const langBtn = document.createElement('button');
        langBtn.className = 'ms-btn-icon';
        langBtn.textContent = t('langSwitch');
        langBtn.title = 'Switch Language';
        langBtn.onclick = () => {
            currentLang = currentLang === 'zh' ? 'en' : 'zh';
            GM_setValue(STORAGE.LANG, currentLang);
            panel.remove();
            panel = null;
            showPanel();
        };
        btnGroup.appendChild(langBtn);

        // Key 管理区域
        const keySelect = document.createElement('select');
        keySelect.className = 'ms-select';
        keySelect.id = 'key-select';
        function refreshKeySelect() {
            keySelect.innerHTML = '';
            getAllKeys().forEach(k => {
                const opt = document.createElement('option');
                opt.value = k.id;
                opt.textContent = k.id;
                keySelect.appendChild(opt);
            });
            keySelect.value = getActiveKeyId();
        }
        refreshKeySelect();
        keySelect.onchange = () => {
            setActiveKeyId(keySelect.value);
            panel.remove();
            panel = null;
            showPanel();
        };
        btnGroup.appendChild(keySelect);

        const addKeyBtn = document.createElement('button');
        addKeyBtn.className = 'ms-btn-icon';
        addKeyBtn.innerHTML = '➕';
        addKeyBtn.title = t('addKey');
        addKeyBtn.onclick = () => {
            const name = prompt(t('enterKeyName'), 'key_' + Date.now());
            if (!name) return;
            const keys = getAllKeys();
            if (keys.find(k => k.id === name)) { alert(t('keyNameExists')); return; }
            keys.push({ id: name, key: '', models: [...DEFAULT_MODELS], results: {} });
            setAllKeys(keys);
            setActiveKeyId(name);
            panel.remove();
            panel = null;
            showPanel();
        };
        btnGroup.appendChild(addKeyBtn);

        const delKeyBtn = document.createElement('button');
        delKeyBtn.className = 'ms-btn-icon remove-btn';
        delKeyBtn.innerHTML = '🗑️';
        delKeyBtn.title = t('deleteKey');
        delKeyBtn.onclick = () => {
            const id = getActiveKeyId();
            if (!confirm(`Delete key "${id}"?`)) return;
            let keys = getAllKeys();
            keys = keys.filter(k => k.id !== id);
            setAllKeys(keys);
            if (keys.length) {
                setActiveKeyId(keys[0].id);
            } else {
                const newKey = { id: 'default', key: '', models: [...DEFAULT_MODELS], results: {} };
                setAllKeys([newKey]);
                setActiveKeyId('default');
            }
            panel.remove();
            panel = null;
            showPanel();
        };
        btnGroup.appendChild(delKeyBtn);

        // 清空所有内容按钮
        const clearAllBtn = document.createElement('button');
        clearAllBtn.className = 'ms-btn ms-btn-secondary';
        clearAllBtn.textContent = t('clearAll');
        clearAllBtn.onclick = () => {
            if (!confirm(t('clearAllConfirm'))) return;
            updateCurrentKey({ key: '', models: [], results: {} });
            document.getElementById('ratelimit-api-key').value = '';
            renderStoredResults();
            updateAccountBar();
            showStatus(t('clearedAll'));
        };
        btnGroup.appendChild(clearAllBtn);

        // 恢复默认模型
        const resetModelsBtn = document.createElement('button');
        resetModelsBtn.className = 'ms-btn ms-btn-secondary';
        resetModelsBtn.textContent = t('resetModels');
        resetModelsBtn.onclick = () => {
            updateCurrentKey({ models: [...DEFAULT_MODELS], results: {} });
            renderStoredResults();
            updateAccountBar();
            showStatus(t('restoredDefaults'));
        };
        btnGroup.appendChild(resetModelsBtn);

        // 保存按钮
        const saveBtn = document.createElement('button');
        saveBtn.className = 'ms-btn ms-btn-secondary';
        saveBtn.textContent = t('save');
        saveBtn.onclick = () => saveAllConfig();
        btnGroup.appendChild(saveBtn);

        // 深色模式
        const darkBtn = document.createElement('button');
        darkBtn.className = 'ms-btn-icon';
        darkBtn.innerHTML = isDark ? '☀️' : '🌙';
        darkBtn.title = isDark ? t('lightMode') : t('darkMode');
        darkBtn.onclick = () => {
            isDark = !isDark;
            GM_setValue(STORAGE.DARK, isDark);
            panel.classList.toggle('dark', isDark);
            darkBtn.innerHTML = isDark ? '☀️' : '🌙';
        };
        btnGroup.appendChild(darkBtn);

        // 关闭
        const closeBtn = document.createElement('button');
        closeBtn.className = 'ms-btn-icon';
        closeBtn.innerHTML = '✕';
        closeBtn.title = t('close');
        closeBtn.onclick = () => { panel.style.display = 'none'; };
        btnGroup.appendChild(closeBtn);

        header.appendChild(btnGroup);
        panel.appendChild(header);

        // API Key 输入行
        const apiRow = document.createElement('div');
        apiRow.className = 'ms-row';
        const apiLabel = document.createElement('label');
        apiLabel.textContent = t('apiKey');
        apiRow.appendChild(apiLabel);

        const apiKeyHistDatalist = document.createElement('datalist');
        apiKeyHistDatalist.id = 'api-key-history';
        function updateApiKeyDatalist() {
            apiKeyHistDatalist.innerHTML = '';
            getHistory(STORAGE.API_KEY_HISTORY).forEach(v => {
                const opt = document.createElement('option');
                opt.value = v;
                apiKeyHistDatalist.appendChild(opt);
            });
        }
        updateApiKeyDatalist();

        const keyInput = document.createElement('input');
        keyInput.type = 'text';
        keyInput.className = 'ms-input';
        keyInput.id = 'ratelimit-api-key';
        keyInput.value = getCurrentApiKey();
        keyInput.placeholder = 'ms-xxxxxxxx';
        keyInput.setAttribute('list', 'api-key-history');
        apiRow.appendChild(keyInput);
        apiRow.appendChild(apiKeyHistDatalist);

        const queryBtn = document.createElement('button');
        queryBtn.className = 'ms-btn ms-btn-primary';
        queryBtn.textContent = t('query');
        queryBtn.onclick = () => {
            const apiKey = keyInput.value.trim();
            const models = getCurrentModels();
            if (!apiKey) { alert(t('needApiKey')); return; }
            if (!models.length) { alert(t('needModel')); return; }
            updateCurrentKey({ key: apiKey });
            addHistory(STORAGE.API_KEY_HISTORY, apiKey);
            updateApiKeyDatalist();
            queryAllBalances(apiKey, models);
        };
        apiRow.appendChild(queryBtn);
        panel.appendChild(apiRow);

        // 添加模型行
        const addRow = document.createElement('div');
        addRow.className = 'ms-row';
        const addLabel = document.createElement('label');
        addLabel.textContent = t('addModel');
        addRow.appendChild(addLabel);

        const modelHistDatalist = document.createElement('datalist');
        modelHistDatalist.id = 'model-history';
        function updateModelDatalist() {
            modelHistDatalist.innerHTML = '';
            const allModels = new Set([...DEFAULT_MODELS, ...getCurrentModels(), ...getHistory(STORAGE.MODEL_HISTORY)]);
            allModels.forEach(m => {
                const opt = document.createElement('option');
                opt.value = m;
                modelHistDatalist.appendChild(opt);
            });
        }
        updateModelDatalist();

        const modelInput = document.createElement('input');
        modelInput.type = 'text';
        modelInput.className = 'ms-input';
        modelInput.id = 'ratelimit-add-model';
        modelInput.placeholder = '例如 Qwen/Qwen2.5-7B-Instruct';
        modelInput.setAttribute('list', 'model-history');
        addRow.appendChild(modelInput);
        addRow.appendChild(modelHistDatalist);

        const addBtn = document.createElement('button');
        addBtn.className = 'ms-btn ms-btn-secondary';
        addBtn.textContent = t('addBtn');
        addBtn.onclick = () => {
            const newModel = modelInput.value.trim();
            if (!newModel) return;
            const models = getCurrentModels();
            if (models.includes(newModel)) {
                alert(t('modelExists'));
                return;
            }
            models.push(newModel);
            updateCurrentKey({ models: models });
            addHistory(STORAGE.MODEL_HISTORY, newModel);
            updateModelDatalist();
            modelInput.value = '';
            addModelRowToTable(newModel);
            saveAllConfig();
        };
        addRow.appendChild(addBtn);
        panel.appendChild(addRow);

        // 账户概览
        const accountBar = document.createElement('div');
        accountBar.className = 'ms-account-bar';
        accountBar.id = 'ratelimit-account-bar';
        accountBar.innerHTML = `
            <div class="ms-account-item"><span>${t('accountLimit')}</span><span id="acc-limit">-</span></div>
            <div class="ms-account-item"><span>${t('accountRemaining')}</span><span id="acc-remaining">-</span></div>
            <div class="ms-account-item"><span>${t('used')}</span><span id="acc-used">-</span></div>
        `;
        panel.appendChild(accountBar);

        // 新增：额度消耗提醒
        const reminderDiv = document.createElement('div');
        reminderDiv.className = 'ms-reminder';
        reminderDiv.textContent = '⚠️ ' + t('reminder');
        panel.appendChild(reminderDiv);

        // 表格
        const table = document.createElement('table');
        table.className = 'ms-table';
        table.id = 'ratelimit-result-table';
        table.innerHTML = `
            <thead>
                <tr>
                    <th class="sortable" data-sort="model">${t('model')}</th>
                    <th class="sortable" data-sort="limit">${t('modelLimit')}</th>
                    <th class="sortable" data-sort="remaining">${t('modelRemaining')}</th>
                    <th class="sortable" data-sort="duration">${t('duration')}</th>
                    <th class="sortable" data-sort="status">${t('status')}</th>
                    <th>${t('actions')}</th>
                </tr>
            </thead>
            <tbody></tbody>
        `;

        table.querySelectorAll('th.sortable').forEach(th => {
            th.addEventListener('click', () => {
                const col = th.dataset.sort;
                if (sortColumn === col) {
                    sortAsc = !sortAsc;
                } else {
                    sortColumn = col;
                    sortAsc = true;
                }
                table.querySelectorAll('th.sortable').forEach(h => {
                    h.classList.remove('sort-asc', 'sort-desc');
                });
                th.classList.add(sortAsc ? 'sort-asc' : 'sort-desc');
                renderStoredResults();
            });
        });

        panel.appendChild(table);

        const statusRow = document.createElement('div');
        statusRow.id = 'ratelimit-status';
        statusRow.style.marginTop = '10px';
        panel.appendChild(statusRow);

        document.body.appendChild(panel);

        let currentModels = getCurrentModels();
        if (currentModels.length === 0) {
            updateCurrentKey({ models: [...DEFAULT_MODELS], results: {} });
            currentModels = DEFAULT_MODELS;
        }

        renderStoredResults();
        updateAccountBar();
    }

    // ==================== 渲染表格 ====================
    function renderStoredResults() {
        const results = getCurrentResults();
        let models = getCurrentModels();
        const tbody = document.querySelector('#ratelimit-result-table tbody');
        if (!tbody) return;
        tbody.innerHTML = '';

        if (sortColumn) {
            models = [...models].sort((a, b) => {
                const ra = results[a] || {};
                const rb = results[b] || {};
                let valA, valB;
                switch (sortColumn) {
                    case 'model':
                        valA = a.toLowerCase();
                        valB = b.toLowerCase();
                        return sortAsc ? valA.localeCompare(valB) : valB.localeCompare(valA);
                    case 'limit':
                        valA = parseInt(ra.modelLimit) || 0;
                        valB = parseInt(rb.modelLimit) || 0;
                        return sortAsc ? valA - valB : valB - valA;
                    case 'remaining':
                        valA = parseInt(ra.modelRemaining) || 0;
                        valB = parseInt(rb.modelRemaining) || 0;
                        return sortAsc ? valA - valB : valB - valA;
                    case 'duration':
                        valA = ra.duration || 0;
                        valB = rb.duration || 0;
                        return sortAsc ? valA - valB : valB - valA;
                    case 'status':
                        valA = (ra.status === 'success' ? 1 : ra.status === 'error' ? 2 : 0);
                        valB = (rb.status === 'success' ? 1 : rb.status === 'error' ? 2 : 0);
                        return sortAsc ? valA - valB : valB - valA;
                }
                return 0;
            });
        }

        const groups = {};
        models.forEach(m => {
            const parts = m.split('/');
            const group = parts.length > 1 ? parts[0] : 'Other';
            if (!groups[group]) groups[group] = [];
            groups[group].push(m);
        });

        const sortedGroups = Object.keys(groups).sort((a,b) => a.localeCompare(b));

        sortedGroups.forEach(group => {
            const groupRow = document.createElement('tr');
            groupRow.className = 'group-row';
            groupRow.innerHTML = `<td colspan="6">📁 ${group} <span style="font-size:12px;margin-left:8px;color:var(--text2)">(${groups[group].length} models)</span></td>`;
            groupRow.onclick = function() {
                const rows = Array.from(tbody.querySelectorAll(`tr[data-group="${group}"]`));
                const hidden = rows.length && rows[0].style.display === 'none';
                rows.forEach(r => r.style.display = hidden ? '' : 'none');
            };
            tbody.appendChild(groupRow);

            groups[group].forEach(modelId => {
                const r = results[modelId];
                const row = document.createElement('tr');
                row.setAttribute('data-group', group);

                const modelCell = document.createElement('td');
                modelCell.className = 'model-clickable';
                modelCell.textContent = modelId;
                modelCell.title = 'Click to copy';
                modelCell.onclick = function(e) {
                    e.stopPropagation();
                    navigator.clipboard.writeText(modelId).then(() => {
                        const tooltip = document.createElement('span');
                        tooltip.className = 'copy-tooltip';
                        tooltip.textContent = t('copySuccess');
                        modelCell.appendChild(tooltip);
                        setTimeout(() => tooltip.remove(), 1500);
                    });
                };
                row.appendChild(modelCell);

                const limitCell = document.createElement('td');
                limitCell.textContent = (r && r.modelLimit) || '-';
                row.appendChild(limitCell);

                const remainingCell = document.createElement('td');
                remainingCell.textContent = (r && r.modelRemaining) || '-';
                row.appendChild(remainingCell);

                const durCell = document.createElement('td');
                durCell.textContent = (r && r.duration != null) ? `${r.duration}ms` : '-';
                row.appendChild(durCell);

                const statusCell = document.createElement('td');
                let statusText, statusColor;
                if (r && r.status === 'success') {
                    statusText = t('success');
                    statusColor = 'var(--accent)';
                } else if (r && r.status === 'error') {
                    statusText = t('error') + (r.error || '');
                    statusColor = '#e53935';
                } else {
                    statusText = t('notQueried');
                    statusColor = 'var(--text2)';
                }
                statusCell.textContent = statusText;
                statusCell.style.color = statusColor;
                row.appendChild(statusCell);

                const actionCell = createActionCell(modelId);
                row.appendChild(actionCell);

                tbody.appendChild(row);
            });
        });
    }

    function createActionCell(modelId) {
        const td = document.createElement('td');
        td.className = 'action-cell';
        const refreshBtn = document.createElement('button');
        refreshBtn.className = 'ms-btn-icon';
        refreshBtn.innerHTML = '🔄';
        refreshBtn.title = 'Refresh';
        refreshBtn.onclick = () => refreshSingleModel(modelId);
        const removeBtn = document.createElement('button');
        removeBtn.className = 'ms-btn-icon remove-btn';
        removeBtn.innerHTML = '🗑️';
        removeBtn.title = 'Remove';
        removeBtn.onclick = () => removeModel(modelId);
        td.appendChild(refreshBtn);
        td.appendChild(removeBtn);
        return td;
    }

    function addModelRowToTable(modelId) {
        renderStoredResults();
    }

    function renderFreshTable(modelsArray) {
        const tbody = document.querySelector('#ratelimit-result-table tbody');
        if (!tbody) return;
        tbody.innerHTML = '';
        modelsArray.forEach(modelId => {
            const row = tbody.insertRow();
            row.innerHTML = `
                <td class="model-clickable">${escapeHtml(modelId)}</td>
                <td>-</td>
                <td>-</td>
                <td>-</td>
                <td style="color:var(--text2)">${t('querying')}</td>
            `;
            row.appendChild(createActionCell(modelId));
        });
    }

    // ==================== 业务逻辑 ====================
    function saveAllConfig() {
        const keyInput = document.getElementById('ratelimit-api-key');
        if (keyInput) {
            updateCurrentKey({ key: keyInput.value.trim() });
        }
        showStatus(t('configSaved'));
    }

    function showStatus(msg) {
        const el = document.getElementById('ratelimit-status');
        if (el) {
            el.textContent = msg;
            setTimeout(() => { if(el) el.textContent = ''; }, 2000);
        }
    }

    function updateAccountBar() {
        const results = getCurrentResults();
        let best = null, latest = 0;
        for (const [, r] of Object.entries(results)) {
            if (r.status === 'success' && r.accountLimit && r.accountRemaining && r.timestamp > latest) {
                best = r;
                latest = r.timestamp;
            }
        }
        document.getElementById('acc-limit').textContent = best ? best.accountLimit : '-';
        document.getElementById('acc-remaining').textContent = best ? best.accountRemaining : '-';
        const used = best ? parseInt(best.accountLimit) - parseInt(best.accountRemaining) : '-';
        document.getElementById('acc-used').textContent = isNaN(used) ? '-' : used;
    }

    function removeModel(modelId) {
        if (!confirm(`${t('removeModelConfirm')} "${modelId}"?`)) return;
        const models = getCurrentModels().filter(m => m !== modelId);
        const results = getCurrentResults();
        delete results[modelId];
        updateCurrentKey({ models, results });
        renderStoredResults();
        updateAccountBar();
        saveAllConfig();
    }

    function refreshSingleModel(modelId) {
        const apiKey = getCurrentApiKey();
        if (!apiKey) { alert(t('needApiKey')); return; }
        const tbody = document.querySelector('#ratelimit-result-table tbody');
        const rows = Array.from(tbody.querySelectorAll('tr'));
        for (let row of rows) {
            if (row.querySelector('.model-clickable')?.textContent.trim() === modelId) {
                row.cells[3].textContent = '-';
                row.cells[4].textContent = t('querying');
                break;
            }
        }

        const startTime = performance.now();
        querySingleModel(apiKey, modelId, (err, data) => {
            const duration = Math.round(performance.now() - startTime);
            const results = getCurrentResults();
            results[modelId] = {
                accountLimit: (data && data.accountLimit) || null,
                accountRemaining: (data && data.accountRemaining) || null,
                modelLimit: (data && data.modelLimit) || null,
                modelRemaining: (data && data.modelRemaining) || null,
                status: err ? 'error' : 'success',
                error: err || null,
                duration,
                timestamp: Date.now()
            };
            updateCurrentKey({ results });
            renderStoredResults();
            updateAccountBar();
        });
    }

    function queryAllBalances(apiKey, models) {
        const statusEl = document.getElementById('ratelimit-status');
        renderFreshTable(models);
        statusEl.textContent = t('querying');

        let completed = 0;
        const total = models.length;

        models.forEach(modelId => {
            const startTime = performance.now();
            querySingleModel(apiKey, modelId, (err, data) => {
                completed++;
                const duration = Math.round(performance.now() - startTime);
                const results = getCurrentResults();
                results[modelId] = {
                    accountLimit: (data && data.accountLimit) || null,
                    accountRemaining: (data && data.accountRemaining) || null,
                    modelLimit: (data && data.modelLimit) || null,
                    modelRemaining: (data && data.modelRemaining) || null,
                    status: err ? 'error' : 'success',
                    error: err || null,
                    duration,
                    timestamp: Date.now()
                };
                updateCurrentKey({ results });

                if (completed === total) {
                    statusEl.textContent = t('queryComplete');
                    renderStoredResults();
                    updateAccountBar();
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
            onerror: () => callback('Network error', null),
            ontimeout: () => callback('Timeout', null)
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