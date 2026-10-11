// ====== CONFIG ======
// Paste your OAuth Client ID here for real Google sign-in.
// Leave as is to use demo mode.
const GOOGLE_CLIENT_ID = 'YOUR_CLIENT_ID.apps.googleusercontent.com';

// ====== STATE ======
let tradesDatabase = [];
let currentUser = null;
let currentDateView = new Date(2026, 8, 1);
let tokenClient = null;
let accessToken = null;
let driveFileId = null;

let equityChartInstance = null;
let winLossChartInstance = null;
let symbolChartInstance = null;

document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    initTabs();
    setupEventListeners();
    loadLocalDatabase();
    renderAllViews();
});

function initTheme() {
    const isDark = localStorage.getItem('theme') === 'dark' ||
        (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches);
    if (isDark) {
        document.documentElement.classList.add('dark');
        document.getElementById('themeIcon').className = 'fa-solid fa-sun text-yellow-400';
    } else {
        document.documentElement.classList.remove('dark');
        document.getElementById('themeIcon').className = 'fa-solid fa-moon text-gray-600';
    }
}

document.getElementById('themeToggle').addEventListener('click', () => {
    const isDark = document.documentElement.classList.toggle('dark');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
    document.getElementById('themeIcon').className = isDark ? 'fa-solid fa-sun text-yellow-400' : 'fa-solid fa-moon text-gray-600';
    renderCharts();
});

function initTabs() {
    const tabBtns = document.querySelectorAll('.nav-tab');
    const tabContents = document.querySelectorAll('.tab-content');

    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const target = btn.dataset.tab;

            tabBtns.forEach(b => {
                b.classList.remove('active', 'border-blue-600', 'text-blue-600', 'dark:text-blue-400');
                b.classList.add('border-transparent', 'text-gray-500', 'dark:text-gray-400');
            });
            btn.classList.add('active', 'border-blue-600', 'text-blue-600', 'dark:text-blue-400');

            tabContents.forEach(c => c.classList.add('hidden'));
            document.getElementById(`tab-${target}`).classList.remove('hidden');

            if (target === 'analytics' || target === 'overview') renderCharts();
        });
    });
}

function setupEventListeners() {
    document.getElementById('loginBtn').addEventListener('click', handleGoogleSignIn);
    document.getElementById('logoutBtn').addEventListener('click', handleSignOut);

    document.getElementById('quickTradeForm').addEventListener('submit', (e) => {
        e.preventDefault();
        const trade = {
            id: Date.now().toString(),
            date: document.getElementById('qDate').value || new Date().toISOString().slice(0, 16),
            symbol: document.getElementById('qSymbol').value.toUpperCase(),
            side: document.getElementById('qSide').value,
            profit: parseFloat(document.getElementById('qProfit').value) || 0,
            lots: parseFloat(document.getElementById('qLots').value) || 1.0,
            notes: 'Quick logged trade'
        };
        tradesDatabase.push(trade);
        saveLocalDatabase();
        renderAllViews();
        document.getElementById('quickTradeForm').reset();
    });

    const modal = document.getElementById('tradeModal');
    document.getElementById('addTradeModalOpen').addEventListener('click', () => {
        document.getElementById('modalTitle').innerText = 'Add New Trade';
        document.getElementById('fullTradeForm').reset();
        document.getElementById('editTradeId').value = '';
        document.getElementById('fDate').value = new Date().toISOString().slice(0, 16);
        modal.classList.remove('hidden');
    });

    document.getElementById('closeModalBtn').addEventListener('click', () => modal.classList.add('hidden'));
    document.getElementById('cancelModalBtn').addEventListener('click', () => modal.classList.add('hidden'));

    document.getElementById('fullTradeForm').addEventListener('submit', (e) => {
        e.preventDefault();
        const editId = document.getElementById('editTradeId').value;
        const tradeData = {
            id: editId || Date.now().toString(),
            date: document.getElementById('fDate').value,
            symbol: document.getElementById('fSymbol').value.toUpperCase(),
            side: document.getElementById('fSide').value,
            lots: parseFloat(document.getElementById('fLots').value) || 1.0,
            profit: parseFloat(document.getElementById('fProfit').value) || 0,
            entry: parseFloat(document.getElementById('fEntry').value) || null,
            exit: parseFloat(document.getElementById('fExit').value) || null,
            notes: document.getElementById('fNotes').value
        };

        if (editId) {
            const idx = tradesDatabase.findIndex(t => t.id === editId);
            if (idx !== -1) tradesDatabase[idx] = tradeData;
        } else {
            tradesDatabase.push(tradeData);
        }

        saveLocalDatabase();
        renderAllViews();
        modal.classList.add('hidden');
    });

    document.getElementById('clearAllTradesBtn').addEventListener('click', () => {
        if (confirm('Are you sure you want to clear all trade records?')) {
            tradesDatabase = [];
            saveLocalDatabase();
            renderAllViews();
        }
    });

    document.getElementById('tradeSearch').addEventListener('input', renderTradesTable);

    document.getElementById('prevMonthBtn').addEventListener('click', () => {
        currentDateView.setMonth(currentDateView.getMonth() - 1);
        initCalendar(currentDateView);
    });
    document.getElementById('nextMonthBtn').addEventListener('click', () => {
        currentDateView.setMonth(currentDateView.getMonth() + 1);
        initCalendar(currentDateView);
    });
    document.getElementById('todayMonthBtn').addEventListener('click', () => {
        currentDateView = new Date(2026, 8, 1);
        initCalendar(currentDateView);
    });

    document.getElementById('saveToDriveBtn').addEventListener('click', saveToGoogleDrive);
    document.getElementById('loadFromDriveBtn').addEventListener('click', loadFromGoogleDrive);
    document.getElementById('syncNowQuickBtn').addEventListener('click', saveToGoogleDrive);
    document.getElementById('exportCsvBtn').addEventListener('click', exportDatabaseCSV);

    document.getElementById('downloadSourceBtn').addEventListener('click', () => {
        const blob = new Blob([document.documentElement.outerHTML], { type: 'text/html' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'CN12KH_Trading_Journal_Source.html';
        a.click();
    });
}

// ====== AUTH ======
function handleGoogleSignIn() {
    const hasClientId = GOOGLE_CLIENT_ID && !GOOGLE_CLIENT_ID.startsWith('YOUR');

    if (hasClientId && window.google && google.accounts && google.accounts.oauth2) {
        if (!tokenClient) {
            tokenClient = google.accounts.oauth2.initTokenClient({
                client_id: GOOGLE_CLIENT_ID,
                scope: 'openid email profile https://www.googleapis.com/auth/drive.file',
                callback: async (resp) => {
                    if (resp.error) {
                        alert('Google sign-in failed: ' + resp.error);
                        return;
                    }
                    accessToken = resp.access_token;
                    try {
                        const info = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
                            headers: { Authorization: 'Bearer ' + accessToken }
                        }).then(r => r.json());
                        currentUser = {
                            displayName: info.name || 'Google User',
                            email: info.email || '',
                            photoURL: info.picture || 'https://placehold.co/80x80/2563eb/ffffff?text=U'
                        };
                        updateAuthUI();
                    } catch (err) {
                        alert('Could not load Google profile.');
                    }
                }
            });
        }
        tokenClient.requestAccessToken();
        return;
    }

    // Demo mode (no Client ID set)
    currentUser = {
        displayName: "CN12KH Trader",
        email: "trader.cn12kh@gmail.com",
        photoURL: "https://placehold.co/80x80/2563eb/ffffff?text=CN"
    };
    updateAuthUI();
}

function handleSignOut() {
    if (accessToken && window.google && google.accounts && google.accounts.oauth2) {
        google.accounts.oauth2.revoke(accessToken, () => {});
    }
    accessToken = null;
    driveFileId = null;
    currentUser = null;
    updateAuthUI();
}

function updateAuthUI() {
    const loginBtn = document.getElementById('loginBtn');
    const userInfo = document.getElementById('userInfo');
    const driveNotice = document.getElementById('driveNotice');

    if (currentUser) {
        loginBtn.classList.add('hidden');
        userInfo.classList.remove('hidden');
        driveNotice.classList.remove('hidden');
        document.getElementById('userName').innerText = currentUser.displayName;
        document.getElementById('userEmail').innerText = currentUser.email;
        document.getElementById('userAvatar').src = currentUser.photoURL;
    } else {
        loginBtn.classList.remove('hidden');
        userInfo.classList.add('hidden');
        driveNotice.classList.add('hidden');
    }
}

// ====== DRIVE ======
async function saveToGoogleDrive() {
    if (!currentUser) {
        alert('Please sign in with your Gmail account first.');
        return;
    }

    // Demo mode: download JSON file
    if (!accessToken) {
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(tradesDatabase, null, 2));
        const a = document.createElement('a');
        a.setAttribute("href", dataStr);
        a.setAttribute("download", `CN12KH_Drive_Journal_${new Date().toISOString().slice(0, 10)}.json`);
        document.body.appendChild(a);
        a.click();
        a.remove();
        alert('Demo mode: journal exported as a JSON file.');
        return;
    }

    try {
        const body = JSON.stringify(tradesDatabase, null, 2);
        const headers = { Authorization: 'Bearer ' + accessToken };

        // Find existing file created by this app (drive.file scope only sees its own files)
        if (!driveFileId) {
            const q = encodeURIComponent("name='CN12KH_Trading_Journal.json' and trashed=false");
            const found = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)`, { headers }).then(r => r.json());
            if (found.files && found.files.length) driveFileId = found.files[0].id;
        }

        let r;
        if (driveFileId) {
            // Update in place
            r = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${driveFileId}?uploadType=media`, {
                method: 'PATCH',
                headers: { ...headers, 'Content-Type': 'application/json' },
                body
            });
        } else {
            // Create new
            const meta = { name: 'CN12KH_Trading_Journal.json', mimeType: 'application/json' };
            const form = new FormData();
            form.append('metadata', new Blob([JSON.stringify(meta)], { type: 'application/json' }));
            form.append('file', new Blob([body], { type: 'application/json' }));
            r = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', {
                method: 'POST', headers, body: form
            });
            if (r.ok) driveFileId = (await r.clone().json()).id;
        }
        alert(r.ok ? 'Saved to Google Drive ✔' : 'Drive save failed (' + r.status + ')');
    } catch (err) {
        alert('Drive save failed: ' + err.message);
    }
}

async function loadFromGoogleDrive() {
    // Real Drive load
    if (accessToken) {
        try {
            const headers = { Authorization: 'Bearer ' + accessToken };
            const q = encodeURIComponent("name='CN12KH_Trading_Journal.json' and trashed=false");
            const found = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)`, { headers }).then(r => r.json());
            if (found.files && found.files.length) {
                driveFileId = found.files[0].id;
                const content = await fetch(`https://www.googleapis.com/drive/v3/files/${driveFileId}?alt=media`, { headers }).then(r => r.json());
                if (Array.isArray(content)) {
                    tradesDatabase = content;
                    saveLocalDatabase();
                    renderAllViews();
                    alert('Journal loaded from Google Drive ✔');
                    return;
                }
            }
            alert('No journal file found on Drive yet. Save one first.');
        } catch (err) {
            alert('Drive load failed: ' + err.message);
        }
        return;
    }

    // Fallback: local JSON file picker
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = e => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.readAsText(file, 'UTF-8');
        reader.onload = ev => {
            try {
                const content = JSON.parse(ev.target.result);
                if (Array.isArray(content)) {
                    tradesDatabase = content;
                    saveLocalDatabase();
                    renderAllViews();
                    alert('Trading database restored from backup!');
                }
            } catch (err) {
                alert('Invalid JSON file structure.');
            }
        };
    };
    input.click();
}

function exportDatabaseCSV() {
    if (tradesDatabase.length === 0) {
        alert('No trades in database to export.');
        return;
    }
    let csv = 'ID,Date,Symbol,Side,Lots,Profit,Entry,Exit,Notes\n';
    tradesDatabase.forEach(t => {
        csv += `"${t.id}","${t.date}","${t.symbol}","${t.side}","${t.lots || ''}","${t.profit}","${t.entry || ''}","${t.exit || ''}","${(t.notes || '').replace(/"/g, '""')}"\n`;
    });
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.setAttribute('href', url);
    a.setAttribute('download', 'CN12KH_Trades_Database.csv');
    a.click();
}

// ====== LOCAL STORAGE ======
function saveLocalDatabase() {
    localStorage.setItem('cn12kh_trades', JSON.stringify(tradesDatabase));
}

function loadLocalDatabase() {
    const saved = localStorage.getItem('cn12kh_trades');
    if (saved) {
        try { tradesDatabase = JSON.parse(saved); } catch (e) { tradesDatabase = []; }
    } else {
        tradesDatabase = [];
    }
}

// ====== RENDER ======
function renderAllViews() {
    renderOverviewMetrics();
    renderTradesTable();
    initCalendar(currentDateView);
    renderCharts();
}

function renderOverviewMetrics() {
    const total = tradesDatabase.length;
    const wins = tradesDatabase.filter(t => t.profit > 0);
    const losses = tradesDatabase.filter(t => t.profit < 0);
    const totalPnL = tradesDatabase.reduce((acc, t) => acc + t.profit, 0);
    const winRate = total > 0 ? ((wins.length / total) * 100).toFixed(1) : '0';

    const grossProfit = wins.reduce((acc, t) => acc + t.profit, 0);
    const grossLoss = Math.abs(losses.reduce((acc, t) => acc + t.profit, 0));
    const profitFactor = grossLoss > 0 ? (grossProfit / grossLoss).toFixed(2) : grossProfit > 0 ? 'MAX' : '0.00';

    const pnlElem = document.getElementById('statNetPnL');
    pnlElem.innerText = `${totalPnL >= 0 ? '+' : '-'}$${Math.abs(totalPnL).toFixed(2)}`;
    pnlElem.className = `text-2xl font-black mt-1 ${totalPnL >= 0 ? 'text-blue-600 dark:text-blue-400' : 'text-red-600 dark:text-red-400'}`;

    document.getElementById('statPnLBadge').innerText = `${total} Trades`;
    document.getElementById('statWinRate').innerText = `${winRate}%`;
    document.getElementById('statWinBar').style.width = `${winRate}%`;
    document.getElementById('statProfitFactor').innerText = profitFactor;
    document.getElementById('statTotalTrades').innerText = total;
}

function renderTradesTable() {
    const tbody = document.getElementById('tradesTableBody');
    tbody.innerHTML = '';

    const q = (document.getElementById('tradeSearch').value || '').toLowerCase();
    const list = tradesDatabase.filter(t =>
        !q || (t.symbol || '').toLowerCase().includes(q) || (t.notes || '').toLowerCase().includes(q));

    if (list.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="text-center py-8 text-gray-400 text-xs">No trades recorded yet. Add a trade above.</td></tr>`;
        return;
    }

    const sorted = [...list].sort((a, b) => new Date(b.date) - new Date(a.date));

    sorted.forEach(t => {
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-gray-50 dark:hover:bg-gray-700/30 transition';
        const isProfit = t.profit >= 0;
        const profitClass = isProfit ? 'text-blue-600 dark:text-blue-400 font-bold' : 'text-red-600 dark:text-red-400 font-bold';

        tr.innerHTML = `
            <td class="p-3 text-xs text-gray-500 whitespace-nowrap">${(t.date || '').replace('T', ' ')}</td>
            <td class="p-3 font-bold text-gray-900 dark:text-white">${t.symbol}</td>
            <td class="p-3">
                <span class="px-2 py-0.5 text-[10px] font-bold rounded ${t.side === 'BUY' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'}">${t.side}</span>
            </td>
            <td class="p-3 text-xs">${t.lots || 1.0}</td>
            <td class="p-3 text-xs text-gray-500">${t.entry || '-'} / ${t.exit || '-'}</td>
            <td class="p-3 ${profitClass}">${isProfit ? '+' : '-'}$${Math.abs(t.profit).toFixed(2)}</td>
            <td class="p-3 text-right">
                <button onclick="editTrade('${t.id}')" class="text-gray-400 hover:text-blue-500 p-1"><i class="fa-solid fa-pen"></i></button>
                <button onclick="deleteTrade('${t.id}')" class="text-gray-400 hover:text-red-500 p-1"><i class="fa-solid fa-trash"></i></button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

window.editTrade = function (id) {
    const trade = tradesDatabase.find(t => t.id === id);
    if (!trade) return;
    document.getElementById('modalTitle').innerText = 'Edit Trade';
    document.getElementById('editTradeId').value = trade.id;
    document.getElementById('fDate').value = trade.date;
    document.getElementById('fSymbol').value = trade.symbol;
    document.getElementById('fSide').value = trade.side;
    document.getElementById('fLots').value = trade.lots || 1.0;
    document.getElementById('fProfit').value = trade.profit;
    document.getElementById('fEntry').value = trade.entry || '';
    document.getElementById('fExit').value = trade.exit || '';
    document.getElementById('fNotes').value = trade.notes || '';
    document.getElementById('tradeModal').classList.remove('hidden');
};

window.deleteTrade = function (id) {
    tradesDatabase = tradesDatabase.filter(t => t.id !== id);
    saveLocalDatabase();
    renderAllViews();
};

function initCalendar(dateObj) {
    const year = dateObj.getFullYear();
    const month = dateObj.getMonth();
    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    document.getElementById('calendarTitle').innerText = `${monthNames[month]} ${year}`;

    const grid = document.getElementById('calendarGrid');
    grid.innerHTML = '';

    const firstDayIndex = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    for (let i = 0; i < firstDayIndex; i++) {
        const empty = document.createElement('div');
        empty.className = 'h-24 bg-gray-50/50 dark:bg-gray-800/30 rounded-lg border border-gray-100 dark:border-gray-800';
        grid.appendChild(empty);
    }

    for (let day = 1; day <= daysInMonth; day++) {
        const dayBox = document.createElement('div');
        const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const dayTrades = tradesDatabase.filter(t => (t.date || '').startsWith(dateKey));
        const dayNet = dayTrades.reduce((acc, t) => acc + t.profit, 0);

        let themeStyles = 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700';
        if (dayTrades.length > 0) {
            if (dayNet > 0) themeStyles = 'bg-blue-50 dark:bg-blue-950/40 border-blue-400 dark:border-blue-700 text-blue-900 dark:text-blue-100';
            else if (dayNet < 0) themeStyles = 'bg-red-50 dark:bg-red-950/40 border-red-400 dark:border-red-700 text-red-900 dark:text-red-100';
        }

        dayBox.className = `h-24 p-2 rounded-xl border flex flex-col justify-between transition ${themeStyles}`;
        dayBox.innerHTML = `
            <div class="flex justify-between items-center">
                <span class="text-xs font-bold">${day}</span>
                ${dayTrades.length > 0 ? `<span class="text-[10px] px-1.5 rounded font-bold ${dayNet >= 0 ? 'bg-blue-600 text-white' : 'bg-red-600 text-white'}">${dayTrades.length}T</span>` : ''}
            </div>
            <div class="text-center">
                ${dayTrades.length > 0
                    ? `<p class="text-xs font-black ${dayNet >= 0 ? 'text-blue-600 dark:text-blue-400' : 'text-red-600 dark:text-red-400'}">${dayNet >= 0 ? '+' : '-'}$${Math.abs(dayNet).toFixed(0)}</p>`
                    : '<span class="text-[10px] text-gray-300 dark:text-gray-600">-</span>'}
            </div>
        `;
        grid.appendChild(dayBox);
    }
}

function renderCharts() {
    const isDark = document.documentElement.classList.contains('dark');
    const textColor = isDark ? '#9ca3af' : '#4b5563';
    const gridColor = isDark ? '#374151' : '#e5e7eb';

    // 1. Equity curve
    const sorted = [...tradesDatabase].sort((a, b) => new Date(a.date) - new Date(b.date));
    let cumulative = 0;
    const labels = sorted.map((t, i) => `#${i + 1}`);
    const dataPoints = sorted.map(t => { cumulative += t.profit; return cumulative; });

    if (equityChartInstance) equityChartInstance.destroy();
    equityChartInstance = new Chart(document.getElementById('equityChart').getContext('2d'), {
        type: 'line',
        data: {
            labels: labels.length > 0 ? labels : ['Start'],
            datasets: [{
                label: 'Cumulative P&L ($)',
                data: dataPoints.length > 0 ? dataPoints : [0],
                borderColor: '#3b82f6',
                backgroundColor: 'rgba(59, 130, 246, 0.1)',
                fill: true, tension: 0.3, borderWidth: 2
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                x: { ticks: { color: textColor }, grid: { color: gridColor } },
                y: { ticks: { color: textColor }, grid: { color: gridColor } }
            }
        }
    });

    // 2. Win/Loss doughnut
    const wins = tradesDatabase.filter(t => t.profit > 0).length;
    const losses = tradesDatabase.filter(t => t.profit < 0).length;

    if (winLossChartInstance) winLossChartInstance.destroy();
    winLossChartInstance = new Chart(document.getElementById('winLossChart').getContext('2d'), {
        type: 'doughnut',
        data: {
            labels: ['Win', 'Loss'],
            datasets: [{ data: [wins, losses], backgroundColor: ['#3b82f6', '#ef4444'] }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { labels: { color: textColor } } }
        }
    });

    // 3. P&L by symbol
    const symbolMap = {};
    tradesDatabase.forEach(t => { symbolMap[t.symbol] = (symbolMap[t.symbol] || 0) + t.profit; });

    if (symbolChartInstance) symbolChartInstance.destroy();
    symbolChartInstance = new Chart(document.getElementById('symbolBarChart').getContext('2d'), {
        type: 'bar',
        data: {
            labels: Object.keys(symbolMap),
            datasets: [{
                label: 'P&L ($)',
                data: Object.values(symbolMap),
                backgroundColor: Object.values(symbolMap).map(v => v >= 0 ? '#3b82f6' : '#ef4444')
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                x: { ticks: { color: textColor }, grid: { color: gridColor } },
                y: { ticks: { color: textColor }, grid: { color: gridColor } }
            }
        }
    });
}
