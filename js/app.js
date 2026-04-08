/**
 * js/app.js
 * SVN Web 浏览器的前端逻辑
 */

document.addEventListener('DOMContentLoaded', () => {
    // DOM 元素获取
    const form = document.getElementById('svn-form');
    const baseUrlInput = document.getElementById('baseUrl');
    const usernameInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');
    
    const breadcrumb = document.getElementById('breadcrumb');
    const tableContainer = document.getElementById('table-container');
    const fileListBody = document.getElementById('file-list');
    
    // 状态容器
    const initState = document.getElementById('init-state');
    const loadingState = document.getElementById('loading');
    const errorState = document.getElementById('error-message');
    const errorText = errorState.querySelector('.text');
    
    // 文本视图 DOM
    const fileContent = document.getElementById('file-content');
    const contentText = document.getElementById('content-text');
    const contentFilename = document.getElementById('content-filename');
    const btnBackList = document.getElementById('btn-back-list');

    // 内部状态
    let currentBaseUrl = '';
    let currentAuthOptions = null;
    let pathHistory = []; // { path: '', displayName: '' }

    /**
     * 格式化文件大小
     */
    function formatSize(bytes) {
        if (bytes === 0 || !bytes) return '-';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    /**
     * 格式化时间
     */
    function formatDate(dateStr) {
        if (!dateStr) return '-';
        const date = new Date(dateStr);
        return date.toLocaleString('zh-CN', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    /**
     * 切换主视图的展示状态
     */
    function showState(state) {
        initState.classList.add('hidden');
        loadingState.classList.add('hidden');
        errorState.classList.add('hidden');
        tableContainer.classList.add('hidden');
        fileContent.classList.add('hidden');

        if (state === 'init') initState.classList.remove('hidden');
        else if (state === 'loading') loadingState.classList.remove('hidden');
        else if (state === 'error') errorState.classList.remove('hidden');
        else if (state === 'data') tableContainer.classList.remove('hidden');
        else if (state === 'content') fileContent.classList.remove('hidden');
    }

    /**
     * 显示错误信息
     */
    function showError(msg) {
        showState('error');
        errorText.textContent = msg;
    }

    /**
     * 渲染面包屑导航
     */
    function renderBreadcrumb() {
        breadcrumb.innerHTML = '';
        
        if (pathHistory.length === 0) {
            breadcrumb.innerHTML = '<span class="path-item empty">未连接</span>';
            return;
        }

        pathHistory.forEach((item, index) => {
            const isLast = index === pathHistory.length - 1;
            
            const btn = document.createElement('button');
            btn.className = 'path-btn';
            btn.textContent = item.displayName;
            
            if (isLast) {
                btn.style.fontWeight = 'bold';
                btn.style.cursor = 'default';
            } else {
                btn.onclick = () => navigateToHistory(index);
            }
            
            breadcrumb.appendChild(btn);

            if (!isLast) {
                const sep = document.createElement('span');
                sep.className = 'separator';
                sep.innerHTML = '<i class="ri-arrow-right-s-line"></i>';
                breadcrumb.appendChild(sep);
            }
        });
    }

    /**
     * 点击面包屑返回之前的路径目录
     */
    function navigateToHistory(index) {
        // 剪裁掉 index 之后的历史记录
        pathHistory = pathHistory.slice(0, index + 1);
        const targetPath = pathHistory[pathHistory.length - 1].path;
        fetchSvnList(targetPath);
    }

    /**
     * 渲染文件/目录列表
     */
    function renderList(entries) {
        fileListBody.innerHTML = '';

        if (!entries || entries.length === 0) {
            fileListBody.innerHTML = `
                <tr>
                    <td colspan="5" style="text-align: center; color: var(--text-muted); padding: 32px;">
                        该目录为空
                    </td>
                </tr>`;
            return;
        }

        entries.forEach(entry => {
            const tr = document.createElement('tr');
            const isDir = entry.kind === 'dir';
            
            if (isDir) {
                tr.className = 'row-dir';
                tr.onclick = () => {
                    const entryName = entry.name.replace(/\/$/, '');
                    const newTargetUrl = currentBaseUrl + '/' + entryName;
                    
                    pathHistory.push({
                        path: newTargetUrl,
                        displayName: entryName
                    });
                    
                    fetchSvnList(newTargetUrl, true);
                };
            } else {
                tr.className = 'row-file';
                tr.onclick = () => {
                    const entryName = entry.name;
                    const fileUrl = currentBaseUrl + '/' + entryName;
                    fetchSvnFileContent(fileUrl, entryName);
                };
            }

            const iconClass = isDir ? 'ri-folder-fill icon-dir' : 'ri-file-3-line icon-file';
            const displayName = isDir ? entry.name.replace(/\/$/, '') : entry.name;

            tr.innerHTML = `
                <td class="col-name">
                    <div class="name-cell">
                        <i class="${iconClass} icon"></i>
                        <span>${displayName}</span>
                    </div>
                </td>
                <td class="col-size">${isDir ? '-' : formatSize(entry.size)}</td>
                <td class="col-rev">${entry.revision || '-'}</td>
                <td class="col-author">${entry.author || '-'}</td>
                <td class="col-date">${formatDate(entry.date)}</td>
            `;

            fileListBody.appendChild(tr);
        });
    }

    /**
     * 获取文件内容
     */
    async function fetchSvnFileContent(targetUrl, filename) {
        showState('loading');
        
        try {
            const response = await fetch('api.php', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    action: 'cat',
                    targetUrl: targetUrl,
                    username: currentAuthOptions.username,
                    password: currentAuthOptions.password
                })
            });

            const data = await response.json();

            if (!response.ok || data.error) {
                throw new Error(data.error || '请求失败，未知错误');
            }

            if (data.success) {
                contentText.textContent = data.content;
                contentFilename.textContent = filename;
                showState('content');
            } else {
                throw new Error('获取内容异常');
            }
        } catch (err) {
            showError(err.message);
        }
    }

    /**
     * 请求后端 API 获取 SVN 数据
     * @param {string} targetUrl 完整的目标 SVN 地址
     * @param {boolean} isSubPath 是否是在访问子目录
     */
    async function fetchSvnList(targetUrl, isSubPath = false) {
        showState('loading');
        
        // 更新当前基础路径，如果是根路径访问
        if (!isSubPath) {
            currentBaseUrl = targetUrl;
        } else {
            // 当前是子目录访问时，BaseUrl随着层级增长更新
            currentBaseUrl = targetUrl; 
        }

        renderBreadcrumb();

        try {
            const response = await fetch('api.php', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    targetUrl: targetUrl,
                    username: currentAuthOptions.username,
                    password: currentAuthOptions.password
                })
            });

            const data = await response.json();

            if (!response.ok || data.error) {
                throw new Error(data.error || '请求失败，未知错误');
            }

            if (data.success && Array.isArray(data.entries)) {
                renderList(data.entries);
                showState('data');
            } else {
                throw new Error('返回的数据格式异常');
            }
        } catch (err) {
            showError(err.message);
        }
    }

    // 监听表单提交
    form.addEventListener('submit', (e) => {
        e.preventDefault();
        
        let targetUrl = baseUrlInput.value.trim();
        const username = usernameInput.value.trim();
        const password = passwordInput.value.trim();

        if (!targetUrl.startsWith('svn://') && !targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
            alert('请输入正确的 SVN 协议前缀（如 svn://）');
            return;
        }

        // 把末尾的斜杠去掉，保持路径统一
        targetUrl = targetUrl.replace(/\/$/, "");

        // 存储认证状态以便后续点击目录使用
        currentAuthOptions = { username, password };
        
        // 初始化面包屑历史
        pathHistory = [{
            path: targetUrl,
            displayName: "🏠 Root (" + targetUrl.split('/').pop() + ")"
        }];

        // 请求数据
        fetchSvnList(targetUrl, false);
    });

    // 监听返回列表按钮
    btnBackList.addEventListener('click', () => {
        showState('data');
    });
});
